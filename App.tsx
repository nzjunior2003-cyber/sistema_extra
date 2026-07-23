import { sendSystemEmail } from "./utils/emailHelper";
import React, { useState, useEffect, useRef } from 'react';
import { 
  Flame, Sun, Moon, FileText, DollarSign, ClipboardList, 
  Share2, Upload, Wifi, WifiOff, Database, CheckCircle2, 
  User, Search, Plus, X, Star, Trash2, Check, Download,
  GripVertical, Camera, Eraser, LayoutDashboard, ShieldCheck, Banknote, LogOut, Lock, AlertTriangle, Clock, ExternalLink, Users, UserPlus, History, UserCheck, ChevronRight, Eye, EyeOff
} from 'lucide-react';
import { AppState, DocumentType, Soldier, CostSheetItem, ReportEffectiveItem, ReportServiceItem } from './types';
import { RANKS, UBMS, UNIT_VALUE_DEFAULT, EXTERNAL_DB_URL, REPORT_LOGISTICS_ITEMS, REPORT_VEHICLE_ITEMS, OCCURRENCE_CODES, ROLES, MEMO_LEGAL_TEXT } from './constants';
import { generatePDF, generateEscalaOnlyPDF } from './utils/pdfGenerator';
import { RAW_SOLDIER_CSV } from './data/initialSoldiers';
import { googleSignIn, initAuth } from './services/authService';
import { uploadFileToDrive } from './services/driveService';
import { StatDashboard } from './components/StatDashboard';

const STORAGE_KEY = 'extra-docs-state';
const SYSTEM_ESCALAS_KEY = 'extra-docs-escalas'; // Novo storage para o banco de dados das missões

const DEFAULT_FORM_DATA = {
  issuerMatricula: '',
  issuerName: '',
  issuerWarName: '',
  issuerRank: RANKS[0], 
  issuerUbm: UBMS[0],
  issuerCpf: '',
  issuerPhone: '',
  
  recipient: '',
  recipientCargo: '',
  memoSubject: 'Solicitação de Pagamento de Jornada Op. Extraordinária',
  
  memoNsNum: '',
  memoNsYear: '2025',
  memoBgNum: '',
  memoBgYear: '2025',
  memoDatesList: [],
  
  memoNs: '',
  memoBg: '',
  memoEventDates: '',
  
  operationName: '',
  escalaObs: '',
  ubmOrigem: '',
  costSheetItems: [],
  homologadorNome: '',
  homologadorMatricula: '',
  homologadorPosto: '',
  homologadorFuncao: '',
  
  eventName: '',
  eventDate: new Date().toISOString().split('T')[0],
  eventDayOfWeek: 'DOMINGO',
  eventLocal: '',
  uniform: '4º A - PRONTIDÃO COMPLETO;',
  eventStartTime: '08:00',
  eventEndTime: '17:00',
  eventPublicEstimate: '0',
  siscobNumber: '',
  
  reportAbsences: '',
  reportExchanges: '',
  reportDispensations: '',
  reportDelays: '',

  reportEffectiveItems: [],
  reportServiceItems: [],
  
  reportLogistics: {},
  reportVehicles: {},
  reportOtherLogistics: '',
  reportOtherVehicles: '',

  reportPositive: { has: true, text: '' },
  reportNegative: { has: false, text: '' },
  reportActivities: '',
  reportGuidance: 'HOUVE',
  reportDistribution: 'CONFORME NECESSIDADE',
  reportSuggestions: 'NADA A DECLARAR',
  reportPhotos: ['', ''], 
  reportFinalConsiderations: '' 
};

// --- MOCK DB DE USUÁRIOS DO SISTEMA ---
const MOCK_USERS = [
  { matricula: 'administrador', nome: 'Administrador', posto: 'ADMIN', permissoes: ['ADMIN', 'ESCALANTE', 'APROVADOR', 'PAGAMENTO'], senha: '123456' },
  { matricula: 'escalante', nome: 'Usuário Escalante', posto: '1º SGT QPBM', permissoes: ['ESCALANTE'], ubmEscalante: '1º GBM', senha: '123456' },
  { matricula: 'comandante', nome: 'Usuário Comandante', posto: 'CAP QOBM', permissoes: [], senha: '123456' },
  { matricula: 'homologador', nome: 'Usuário Homologador', posto: 'MAJ QOBM', permissoes: ['APROVADOR'], senha: '123456' },
  { matricula: 'pagamento', nome: 'Usuário Pagamento', posto: 'ST QPBM', permissoes: ['PAGAMENTO'], senha: '123456' },
  { matricula: 'militar', nome: 'Usuário Militar', posto: 'SD QPBM', permissoes: [], senha: '123456' }
];

const extractFileIdFromUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  const matchD = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (matchD) return matchD[1];
  const matchId = url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (matchId) return matchId[1];
  return null;
};

const dataURLtoBlob = (dataurl: string): Blob => {
  try {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (e) {
    console.error("Error converting dataURL to blob:", e);
    return new Blob([], { type: 'application/pdf' });
  }
};

const App: React.FC = () => {
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- NOVOS ESTADOS DO SISTEMA CORPORATIVO ---
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [escalas, setEscalas] = useState<any[]>([]); // Cofre central de todas as escalas
  const [activeTab, setActiveTab] = useState('PORTAL'); // PORTAL, ESCALANTE, COMANDANTE, APROVADOR, PAGAMENTO, EDITOR
  const [selectedUbmForRequest, setSelectedUbmForRequest] = useState(UBMS[0]);
  const [editingEscalaId, setEditingEscalaId] = useState<string | null>(null);
  const getEffectiveCostItems = (formData: any) => {
    if (!formData) return [];
    if (Array.isArray(formData.costSheetItems)) {
      return formData.costSheetItems;
    }
    return [];
  };
  const [loginData, setLoginData] = useState({ matricula: '', senha: '' });
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loginError, setLoginError] = useState('');

  // States para Login Customizado e Recuperação
  const [activeSubstituteId, setActiveSubstituteId] = useState<string | null>(null);
  const [substituteSuggestions, setSubstituteSuggestions] = useState<Soldier[]>([]);
  
  const [customUsersDict, setCustomUsersDict] = useState<Record<string, any>>(() => {
    const saved = localStorage.getItem('CUSTOM_USERS_DB');
    return saved ? JSON.parse(saved) : {};
  });
  const [roleRequests, setRoleRequests] = useState<any[]>(() => {
    const saved = localStorage.getItem('ROLE_REQUESTS');
    return saved ? JSON.parse(saved) : [];
  });
  const [adminUserSearch, setAdminUserSearch] = useState('');
  const [showFirstAccessModal, setShowFirstAccessModal] = useState(false);
  const [firstAccessUser, setFirstAccessUser] = useState<any>(null);
  const [firstAccessData, setFirstAccessData] = useState({ email: '', novaSenha: '', confirmarSenha: '', nomeGuerra: '' });

  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotMatricula, setForgotMatricula] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotExpectedEmail, setForgotExpectedEmail] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  
  const [delegationModal, setDelegationModal] = useState<{isOpen: boolean, escalaId: string | null}>({isOpen: false, escalaId: null});
  const [delegationSearch, setDelegationSearch] = useState('');

  const [returnModal, setReturnModal] = useState<{isOpen: boolean, escalaId: string | null}>({isOpen: false, escalaId: null});
  const [returnReason, setReturnReason] = useState('');
  const [viewingPdfEscalaId, setViewingPdfEscalaId] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [aprovadorDocView, setAprovadorDocView] = useState<'MEMO' | 'NS' | 'BG' | 'ESCALA' | 'RELATORIO' | 'CUSTOS' | 'ALTERACOES'>('MEMO');
  const [docLoadState, setDocLoadState] = useState<'idle' | 'loading' | 'success' | 'error' | 'empty'>('idle');
  const [docErrorMsg, setDocErrorMsg] = useState<string | null>(null);
  const generatedPdfCache = useRef<Record<string, Blob>>({});
  const [pagamentoEscalaId, setPagamentoEscalaId] = useState<string | null>(null);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);

  const [consultingEscalaId, setConsultingEscalaId] = useState<string | null>(null);
  const [showAtestarConfirmModal, setShowAtestarConfirmModal] = useState<string | null>(null);

  // Filtros de Pesquisa - Usuário
  const [filterUserAno, setFilterUserAno] = useState('');
  const [filterUserMes, setFilterUserMes] = useState('');
  const [filterUserTipoServico, setFilterUserTipoServico] = useState('');

  // Filtros de Pesquisa - Escalante
  const [filterEscalanteAno, setFilterEscalanteAno] = useState('');
  const [filterEscalanteMes, setFilterEscalanteMes] = useState('');
  const [filterEscalanteTipoServico, setFilterEscalanteTipoServico] = useState('');
  const [filterEscalanteMilitar, setFilterEscalanteMilitar] = useState('');
  const [filterEscalanteUbm, setFilterEscalanteUbm] = useState('');

  // Filtros de Pesquisa - Homologador
  const [filterHomologadorAno, setFilterHomologadorAno] = useState('');
  const [filterHomologadorMes, setFilterHomologadorMes] = useState('');
  const [filterHomologadorTipoServico, setFilterHomologadorTipoServico] = useState('');
  const [filterHomologadorUbmOrigem, setFilterHomologadorUbmOrigem] = useState('');
  const [filterHomologadorAltServico, setFilterHomologadorAltServico] = useState('');
  const [filterHomologadorAltEfetivo, setFilterHomologadorAltEfetivo] = useState('');
  const [filterHomologadorMilitar, setFilterHomologadorMilitar] = useState('');

  const handleDriveLogin = async () => {
    try {
      const result = await googleSignIn();
      if (result) {
        setIsDriveAuthed(true);
        setNeedsDriveAuth(false);
      }
    } catch(err) {
      console.error(err);
      alert("Falha ao integrar com o Google Drive.");
    }
  };

  const saveCustomUser = (matricula: string, data: any) => {
    setCustomUsersDict(prev => {
        const nextObj = { ...prev, [matricula]: data };
        localStorage.setItem('CUSTOM_USERS_DB', JSON.stringify(nextObj));
        return nextObj;
    });
  };

  const requestRole = async (role: string, ubm?: string) => {
     if (!currentUser) return;
     const currentPerms = currentUser?.permissoes || [];
     if (currentPerms.includes(role)) {
        alert("Você já possui esta permissão.");
        return;
     }

     const existing = roleRequests.find(r => r.matricula === currentUser.matricula && r.role === role && r.status === 'PENDING');
     
     if (!existing) {
         const newReqs = [...roleRequests, { id: Date.now().toString(), matricula: currentUser.matricula, nome: currentUser.nome, role, status: 'PENDING', ubm }];
         setRoleRequests(newReqs);
         localStorage.setItem('ROLE_REQUESTS', JSON.stringify(newReqs));
     }
     try {
      await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              to: 'sipcdal@gmail.com',
              subject: `Nova Solicitação de Perfil: ${role}${ubm ? ` (${ubm})` : ""}`,
              html: `<div style="font-family: sans-serif; padding: 20px;">\n                       <h2>Sistema de Escalas - Solicitação de Acesso</h2>\n                       <p>O militar <strong>${currentUser.nome}</strong> (Matrícula: ${currentUser.matricula}) solicitou acesso ao perfil: <strong>${role}</strong>${ubm ? ` para a UBM: <strong>${ubm}</strong>` : ""}.</p>\n                       <p>Acesse o painel de Administração no sistema para aprovar ou recusar a solicitação.</p>\n                      </div>`
          })
      });

     } catch (e) {
       alert("Erro de rede ao notificar administrador. A solicitação foi salva no sistema.");
     }

     alert(existing ? "Re-enviamos a notificação para o Administrador!" : "Solicitação enviada ao Administrador!");
  };

  // Mantido o seu estado original do formulário
  const [state, setState] = useState<AppState>({
    currentDoc: DocumentType.MEMO,
    darkMode: false,
    personnelDb: [],
    formData: JSON.parse(JSON.stringify(DEFAULT_FORM_DATA))
  });

  const currentEditingEscala = editingEscalaId ? escalas.find(e => e.id === editingEscalaId) : null;
  const isPastEvent = (() => {
    if (!currentEditingEscala) return false;
    const evDate = currentEditingEscala.formData.eventDate;
    const evTime = currentEditingEscala.formData.eventStartTime;
    if (evDate && evTime) {
       const dt = new Date(`${evDate}T${evTime}`);
       return !isNaN(dt.getTime()) && new Date() >= dt;
    }
    return false;
  })();

  const isEditable = !editingEscalaId || (() => {
    const scale = currentEditingEscala || escalas.find(e => e.id === editingEscalaId);
    const statusOk = ['em_edicao', 'esclarecimento_solicitado'].includes(scale?.status || 'em_edicao');
    if (!statusOk) return false;
    
    // Se o usuário for Escalante de outra UBM (e não for ADMIN), não pode editar
    if ((currentUser?.permissoes || []).includes('ESCALANTE') && !(currentUser?.permissoes || []).includes('ADMIN')) {
       const userUbm = currentUser.ubmEscalante || currentUser.ubm;
       if (userUbm && scale?.ubm && scale.ubm !== userUbm) {
          return false;
       }
    }
    
    // Se o documento atual for o RELATÓRIO, o Comandante ou Auxiliar podem editá-lo
    if (state.currentDoc === DocumentType.REPORT) {
      const isCmtOrAux = scale?.comandanteMatricula === currentUser.matricula || scale?.auxiliarMatricula === currentUser.matricula;
      return isCmtOrAux;
    }
    
    // Para outros documentos (Memorando, Planilha), se o evento já começou, o ESCALANTE não pode mais editar
    return !(isPastEvent && (currentUser?.permissoes || []).includes('ESCALANTE'));
  })();

  const [dbStatus, setDbStatus] = useState("Conectando...");
  const [isOnline, setIsOnline] = useState(true);

  const [issuerSearchTerm, setIssuerSearchTerm] = useState('');
  const [showIssuerSuggestions, setShowIssuerSuggestions] = useState(false);
  const [issuerSuggestions, setIssuerSuggestions] = useState<Soldier[]>([]);

  const [recipientSearchTerm, setRecipientSearchTerm] = useState('');
  const [showRecipientSuggestions, setShowRecipientSuggestions] = useState(false);
  const [recipientSuggestions, setRecipientSuggestions] = useState<Soldier[]>([]);

  const [homologadorSearchTerm, setHomologadorSearchTerm] = useState('');
  const [showHomologadorSuggestions, setShowHomologadorSuggestions] = useState(false);
  const [homologadorSuggestions, setHomologadorSuggestions] = useState<Soldier[]>([]);

  // Estados para Delegação de Função de Homologação
  const [delegationSuggestions, setDelegationSuggestions] = useState<Soldier[]>([]);

  // Funções para verificar se a escala pertence ao Homologador/Destinatário ou Delegado
  const isUserHomologadorForEscala = (escala: any, user: any) => {
    if (!user) return false;
    if (user.matricula === 'administrador' || (user.permissoes || []).includes('ADMIN')) return true;

    const reqMat = escala.formData?.recipientMatricula || escala.destinatarioMatricula;
    const homMat = escala.formData?.homologadorMatricula || escala.homologadorMatricula;
    const delMat = escala.delegatedMatricula;

    if (reqMat && reqMat === user.matricula) return true;
    if (homMat && homMat === user.matricula) return true;
    if (delMat && delMat === user.matricula) return true;

    const userFullName = user.nome ? user.nome.toLowerCase() : '';
    const recipientText = (escala.formData?.recipient || '').toLowerCase();
    const homologadorText = (escala.formData?.homologadorNome || '').toLowerCase();
    const delegatedText = (escala.delegatedNome || '').toLowerCase();

    if (userFullName && userFullName.length > 3) {
      if (recipientText.includes(userFullName)) return true;
      if (homologadorText.includes(userFullName)) return true;
      if (delegatedText.includes(userFullName)) return true;
    }

    const hasNoAssignedHomologador = !reqMat && !homMat && !delMat && !escala.formData?.recipient && !escala.formData?.homologadorNome;
    if (hasNoAssignedHomologador && ((user.permissoes || []).includes('APROVADOR') || user.matricula === 'homologador')) return true;

    return false;
  };

  const [costSearchTerm, setCostSearchTerm] = useState('');
  const [showCostSuggestions, setShowCostSuggestions] = useState(false);
  const [costSuggestions, setCostSuggestions] = useState<Soldier[]>([]);

  const [effSearchTerm, setEffSearchTerm] = useState('');
  const [showEffSuggestions, setShowEffSuggestions] = useState(false);
  const [effSuggestions, setEffSuggestions] = useState<Soldier[]>([]);
  
  const [newEffItem, setNewEffItem] = useState<{ soldier: Soldier | null, status: string, ubm: string, serviceType: string }>({ 
      soldier: null, status: 'P', ubm: UBMS[0], serviceType: 'PREVENCAO' 
  });

  const [newSvcItem, setNewSvcItem] = useState<Partial<ReportServiceItem>>({ sex: 'M', condition: 'ILS', code: '1' });

  const [tempDateInput, setTempDateInput] = useState('');
  const [tempMonthInput, setTempMonthInput] = useState('');

  const [showWarNameModal, setShowWarNameModal] = useState(false);
  const [tempCommanderId, setTempCommanderId] = useState('');
  const [tempWarName, setTempWarName] = useState('');
  const [commanderSelectionContext, setCommanderSelectionContext] = useState<'COST' | 'REPORT'>('COST');

  const [costDateInput, setCostDateInput] = useState('');
  const [newCostDatesList, setNewCostDatesList] = useState<string[]>([]);

  const [newCostItem, setNewCostItem] = useState<{
    selectedSoldier: Soldier | null;
    serviceType: string;
    qty: number;
    ubm: string;
  }>({
    selectedSoldier: null,
    serviceType: 'DIVERSOS',
    qty: 1,
    ubm: UBMS[0]
  });

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [draggedReportIndex, setDraggedReportIndex] = useState<number | null>(null);

  // Authentication states
  const [needsDriveAuth, setNeedsDriveAuth] = useState(false);
  const [isDriveAuthed, setIsDriveAuthed] = useState(false);

  // --- CARREGAMENTO INICIAL ---
  useEffect(() => {
    initAuth(
      () => {
        setNeedsDriveAuth(false);
        setIsDriveAuthed(true);
      },
      () => {
        setIsDriveAuthed(false);
        // Only set needs auth if they try to use drive
      }
    );

    // Carrega o BD de Militares original
    const loadDatabase = async () => {
      try {
        setDbStatus("Buscando planilha online...");
        const response = await fetch(EXTERNAL_DB_URL);
        if (response.ok) {
          const text = await response.text();
          let soldiers = parseCSV(text);
          MOCK_USERS.forEach(u => {
            if (u.matricula !== 'administrador') {
              soldiers.push({ matricula: u.matricula, nome: u.nome, posto: u.posto, ubm: "QCG", cpf: "" });
            }
          });
          if (soldiers.length > 0) {
            setState(prev => ({ ...prev, personnelDb: soldiers }));
            setDbStatus(`${soldiers.length} militares (Online)`);
            setIsOnline(true);
            return;
          }
        }
        throw new Error("Falha ao obter dados online");
      } catch (e) {
        try {
          let soldiers = parseCSV(RAW_SOLDIER_CSV);
          MOCK_USERS.forEach(u => {
             if (u.matricula !== 'administrador') {
               soldiers.push({ matricula: u.matricula, nome: u.nome, posto: u.posto, ubm: "QCG", cpf: "" });
             }
          });
          setState(prev => ({ ...prev, personnelDb: soldiers }));
          setDbStatus(`${soldiers.length} militares (Offline)`);
          setIsOnline(false);
        } catch (innerE) {
          setDbStatus("Erro ao carregar base.");
        }
      }
    };
    loadDatabase();

    // Carrega as Escalas Salvas
    const savedEscalas = localStorage.getItem(SYSTEM_ESCALAS_KEY);
    if (savedEscalas) {
      setEscalas(JSON.parse(savedEscalas));
    }
  }, []);

  // Salva automaticamente o array de escalas
  useEffect(() => {
    localStorage.setItem(SYSTEM_ESCALAS_KEY, JSON.stringify(escalas));
  }, [escalas]);

  // A sua lógica original de sincronia entre Planilha e Relatório (MANTIDA)
  useEffect(() => {
    const reportItems = state.formData.reportEffectiveItems || [];
    const costItems = state.formData.costSheetItems || [];
    
    let needsUpdate = false;
    let newCostItems = [...costItems];

    const invalidMatriculas = reportItems
        .filter(r => r.status === 'F' || r.status === 'D')
        .map(r => r.soldierMf);
    
    const hasInvalidToDrop = newCostItems.some(c => invalidMatriculas.includes(c.soldierMatricula));
    if (hasInvalidToDrop) {
        newCostItems = newCostItems.filter(c => !invalidMatriculas.includes(c.soldierMatricula));
        needsUpdate = true;
    }

    const validReportItems = reportItems.filter(r => r.status !== 'F' && r.status !== 'D');
    
    validReportItems.forEach(reportItem => {
        const exists = newCostItems.some(c => c.soldierMatricula === reportItem.soldierMf);
        
        if (!exists) {
            newCostItems.push({
                id: `sync-${reportItem.id}`, 
                soldierName: reportItem.soldierName,
                soldierMatricula: reportItem.soldierMf,
                soldierRank: reportItem.soldierRank,
                soldierUbm: reportItem.soldierUbm,
                date: state.formData.eventDate || '', 
                datesList: state.formData.eventDate ? [state.formData.eventDate] : [],
                serviceType: (reportItem.serviceType as any) || 'PREVENCAO',
                quantity: 1, 
                unitValue: UNIT_VALUE_DEFAULT,
                isCommander: reportItem.isCommander,
                isAuxiliar: reportItem.isAuxiliar,
                role: reportItem.role
            });
            needsUpdate = true;
        } else {
            const idx = newCostItems.findIndex(c => c.soldierMatricula === reportItem.soldierMf);
            let updated = false;
            if (newCostItems[idx].isCommander !== reportItem.isCommander) {
                newCostItems[idx].isCommander = reportItem.isCommander;
                updated = true;
            }
            if (newCostItems[idx].isAuxiliar !== reportItem.isAuxiliar) {
                newCostItems[idx].isAuxiliar = reportItem.isAuxiliar;
                updated = true;
            }
            if (newCostItems[idx].role !== reportItem.role) {
                newCostItems[idx].role = reportItem.role;
                updated = true;
            }
            if (newCostItems[idx].serviceType !== reportItem.serviceType && reportItem.serviceType) {
                newCostItems[idx].serviceType = reportItem.serviceType as any;
                updated = true;
            }
            if (newCostItems[idx].date !== state.formData.eventDate) {
                newCostItems[idx].date = state.formData.eventDate;
                newCostItems[idx].datesList = state.formData.eventDate ? [state.formData.eventDate] : [];
                updated = true;
            }
            if (updated) needsUpdate = true;
        }
    });

    if (needsUpdate) {
        setState(prev => ({
            ...prev,
            formData: { ...prev.formData, costSheetItems: newCostItems }
        }));
    }
  }, [state.formData.reportEffectiveItems, state.formData.eventDate]);

  useEffect(() => {
    if (activeTab === 'ADMIN') {
       const saved = localStorage.getItem('ROLE_REQUESTS');
       if (saved) setRoleRequests(JSON.parse(saved));
    }
  }, [activeTab]);

  useEffect(() => {
    if (state.formData.eventDate) {
      // Create date object handling timezone issues safely
      const [year, month, day] = state.formData.eventDate.split('-');
      // JavaScript Date month is 0-indexed
      const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      
      const diasSemana = [
        'DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'
      ];
      
      const newDayOfWeek = diasSemana[d.getDay()];
      
      if (state.formData.eventDayOfWeek !== newDayOfWeek) {
        handleInputChange('eventDayOfWeek', newDayOfWeek);
      }
    }
  }, [state.formData.eventDate]);

  useEffect(() => {
    // Force fix for existing cached 'administrador' who lost ADMIN tag
     if (currentUser && currentUser.matricula === 'administrador' && !currentUser.permissoes?.includes('ADMIN')) {
         const updatedUser = { ...currentUser, permissoes: ['ADMIN', 'ESCALANTE', 'APROVADOR', 'PAGAMENTO'] };
         setCurrentUser(updatedUser);
         saveCustomUser(updatedUser.matricula, updatedUser);
     }
     if (currentUser && (currentUser.permissoes || []).includes('ADMIN') && activeTab !== 'ADMIN') {
         setActiveTab('ADMIN');
     }
  }, [currentUser]);

  // Outros effects originais de formatação de datas (MANTIDOS)...
  useEffect(() => {
     if (state.formData.eventName) {
         setState(prev => ({
            ...prev,
            formData: { ...prev.formData, operationName: prev.formData.eventName }
         }));
     }
  }, [state.formData.eventName]);

  useEffect(() => {
    const { memoNsNum, memoNsYear, memoBgNum, memoBgYear } = state.formData;
    setState(prev => ({
      ...prev,
      formData: {
        ...prev.formData,
        memoNs: memoNsNum ? `${memoNsNum}/${memoNsYear}` : '',
        memoBg: memoBgNum ? `${memoBgNum}/${memoBgYear}` : ''
      }
    }));
  }, [state.formData.memoNsNum, state.formData.memoNsYear, state.formData.memoBgNum, state.formData.memoBgYear]);

  useEffect(() => {
    if (state.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [state.darkMode]);

  // --- LÓGICA DE NEGÓCIO DO SISTEMA (NOVAS FUNÇÕES) ---

  const handleApproveRole = async (reqId: string, approve: boolean) => {
     const currentReqs = JSON.parse(localStorage.getItem('ROLE_REQUESTS') || '[]');
     const req = currentReqs.find((r:any) => r.id === reqId);
     if (!req) return;
     
     if (approve) {
         const currentDict = JSON.parse(localStorage.getItem('CUSTOM_USERS_DB') || '{}');
         let userToUpdate = currentDict[req.matricula];
         if (!userToUpdate) {
             const mockUser = MOCK_USERS.find(u => u.matricula === req.matricula);
             if (mockUser) {
                 userToUpdate = { ...mockUser };
             } else {
                 const soldier = state.personnelDb.find(s => s.matricula === req.matricula);
                 if (soldier) {
                     userToUpdate = { matricula: soldier.matricula, nome: soldier.nome, posto: soldier.posto, permissoes: [] };
                 }
             }
         }
         
         if (userToUpdate) {
             const newPerms = [...new Set([...(userToUpdate.permissoes || []), req.role])];
             userToUpdate.permissoes = newPerms;
             if (req.role === 'ESCALANTE' && req.ubm) {
                 userToUpdate.ubmEscalante = req.ubm;
                 if (!userToUpdate.ubm) {
                     userToUpdate.ubm = req.ubm;
                 }
             }
             // Save directly to localStorage to avoid closure issues
             currentDict[req.matricula] = userToUpdate;
             localStorage.setItem('CUSTOM_USERS_DB', JSON.stringify(currentDict));
             setCustomUsersDict(currentDict); // Update state

             if (currentUser && currentUser.matricula === req.matricula) {
                 setCurrentUser(userToUpdate);
             }

             // Send email to the user notifying about the approval
             if (userToUpdate.email) {
                 try {
                    await fetch('/api/send-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            to: userToUpdate.email,
                            subject: 'Sistema de Escalas - Acesso Aprovado',
                            html: `<div style="font-family: sans-serif; padding: 20px;">\n                                     <h2>Solicitação Aprovada</h2>\n                                     <p>Sua solicitação de acesso para o perfil <strong>${req.role}</strong> foi <strong>aprovada</strong> pelo administrador.</p>\n                                     <p>Você pode acessar o sistema para usar as suas novas permissões.</p>\n                                    </div>`
                        })
                    });
                 } catch (e) {
                     alert("Acesso aprovado, mas falha ao enviar notificação por e-mail.");
                 }
             }
         }
     }
     
     const newReqs = currentReqs.map((r:any) => r.id === reqId ? { ...r, status: approve ? 'APPROVED' : 'REJECTED' } : r);
     setRoleRequests(newReqs);
     localStorage.setItem('ROLE_REQUESTS', JSON.stringify(newReqs));
  };

  const handleRemoveRole = (matricula: string, role: string) => {
     if (matricula === 'administrador' && role === 'ADMIN') {
         alert("Não é possível remover a permissão ADMIN do administrador padrão.");
         return;
     }

     if (window.confirm(`Deseja realmente remover a permissão de ${role} do usuário de matrícula ${matricula}?`)) {
         const currentDict = JSON.parse(localStorage.getItem('CUSTOM_USERS_DB') || '{}');
         let userToUpdate = currentDict[matricula];
         if (!userToUpdate) {
             const mock = MOCK_USERS.find(u => u.matricula === matricula);
             if (mock) {
                 userToUpdate = { ...mock };
             }
         }
         if (userToUpdate) {
             userToUpdate.permissoes = (userToUpdate.permissoes || []).filter((p: string) => p !== role);
             currentDict[matricula] = userToUpdate;
             localStorage.setItem('CUSTOM_USERS_DB', JSON.stringify(currentDict));
             setCustomUsersDict({ ...currentDict });

             if (currentUser && currentUser.matricula === matricula) {
                 setCurrentUser({ ...userToUpdate });
             }
         }
     }
  };

  const handleDeleteUser = (matricula: string) => {
     if (matricula === 'administrador') {
         alert("Não é possível excluir o usuário administrador padrão.");
         return;
     }

     if (window.confirm(`Deseja realmente excluir permanentemente o usuário de matrícula ${matricula}? Todos os acessos e cadastros deste usuário serão removidos.`)) {
         const currentDict = JSON.parse(localStorage.getItem('CUSTOM_USERS_DB') || '{}');
         delete currentDict[matricula];
         localStorage.setItem('CUSTOM_USERS_DB', JSON.stringify(currentDict));
         setCustomUsersDict({ ...currentDict });

         const currentReqs = JSON.parse(localStorage.getItem('ROLE_REQUESTS') || '[]');
         const newReqs = currentReqs.filter((r: any) => r.matricula !== matricula);
         localStorage.setItem('ROLE_REQUESTS', JSON.stringify(newReqs));
         setRoleRequests(newReqs);

         if (currentUser && currentUser.matricula === matricula) {
             setCurrentUser(null);
         }

         alert(`Usuário de matrícula ${matricula} foi excluído com sucesso.`);
     }
  };

  const handleClearRequests = () => {
     if (window.confirm("Deseja realmente limpar todas as solicitações de acesso?")) {
         localStorage.removeItem('ROLE_REQUESTS');
         setRoleRequests([]);
         alert("Todas as solicitações de acesso foram limpas com sucesso.");
     }
  };

  const handleDelegateFunction = (newSoldier: Soldier) => {
     if (!delegationModal.escalaId) return;
     const escala = escalas.find(e => e.id === delegationModal.escalaId);
     if (!escala) return;
     
     const isCommander = escala.comandanteMatricula === currentUser.matricula;
     const isAuxiliar = escala.auxiliarMatricula === currentUser.matricula;
     
     const updatedEscala = { ...escala };
     if (isCommander) {
        updatedEscala.comandanteMatricula = newSoldier.matricula;
     } else if (isAuxiliar) {
        updatedEscala.auxiliarMatricula = newSoldier.matricula;
     }
     
     const updatedItems = updatedEscala.formData.costSheetItems.map((item: any) => {
         if (isCommander && item.soldierMatricula === currentUser.matricula && item.isCommander) {
             return { ...item, soldierName: newSoldier.nome, soldierMatricula: newSoldier.matricula, rank: newSoldier.posto };
         }
         if (isAuxiliar && item.soldierMatricula === currentUser.matricula && item.isAuxiliar) {
             return { ...item, soldierName: newSoldier.nome, soldierMatricula: newSoldier.matricula, rank: newSoldier.posto };
         }
         return item;
     });
     updatedEscala.formData.costSheetItems = updatedItems;
     
     const newEscalas = escalas.map(e => e.id === delegationModal.escalaId ? updatedEscala : e);
     setEscalas(newEscalas);
     localStorage.setItem(SYSTEM_ESCALAS_KEY, JSON.stringify(newEscalas));
     setDelegationModal({ isOpen: false, escalaId: null });
     setDelegationSearch('');
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    let foundUser: any = null;
    const mat = loginData.matricula.trim();

    const customUser = customUsersDict[mat];
    if (customUser && customUser.senha === loginData.senha) {
       // Ensure administrador always has ADMIN permissions even if cached old
       if (customUser.matricula === 'administrador' && !customUser.permissoes?.includes('ADMIN')) {
          customUser.permissoes = ['ADMIN', 'ESCALANTE', 'APROVADOR', 'PAGAMENTO'];
          saveCustomUser(customUser.matricula, customUser);
       }
       if (customUser.matricula === 'escalante' && !customUser.ubmEscalante) {
          customUser.ubmEscalante = '1º GBM';
          saveCustomUser(customUser.matricula, customUser);
       }
       foundUser = customUser;
    } else if (!customUser && loginData.senha === '123456') {
       const mockUser = MOCK_USERS.find(u => u.matricula === mat);
       if (mockUser) {
           foundUser = { ...mockUser };
       } else {
           const soldier = state.personnelDb.find(s => s.matricula === mat);
           if (soldier) {
               foundUser = { matricula: soldier.matricula, nome: soldier.nome, posto: soldier.posto, permissoes: [] };
           }
       }
       if (foundUser) foundUser.isFirstAccess = true;
    } else if (customUser && customUser.senha !== loginData.senha) {
       setLoginError('Senha incorreta.');
       return;
    } else if (!customUser && loginData.senha !== '123456') {
        const mockUser = MOCK_USERS.find(u => u.matricula === mat && u.senha === loginData.senha);
        if (mockUser) {
            foundUser = mockUser;
        }
    }

    if (foundUser) {
      if (foundUser.isFirstAccess) {
         setFirstAccessUser(foundUser);
         setFirstAccessData({ 
           email: foundUser.email || '', 
           novaSenha: '', 
           confirmarSenha: '',
           nomeGuerra: foundUser.nomeGuerra || '' 
         });
         setShowNewPassword(false);
         setShowConfirmPassword(false);
         setShowFirstAccessModal(true);
         setLoginError('');
      } else {
         setCurrentUser(foundUser);
         setActiveTab('PORTAL');
         setLoginError('');
      }
    } else {
      setLoginError('Matrícula ou senha incorretos.');
    }
  };

  const confirmFirstAccess = async () => {
    if (!firstAccessData.email || !firstAccessData.novaSenha || !firstAccessData.confirmarSenha || !firstAccessData.nomeGuerra) {
       alert("Preencha e-mail, nome de guerra, nova senha e confirmação de senha."); return;
    }
    if (firstAccessData.novaSenha !== firstAccessData.confirmarSenha) {
       alert("As senhas não coincidem! Por favor, digite a mesma senha no campo de confirmação."); return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(firstAccessData.email)) {
        alert("O formato do e-mail é inválido. Verifique se não há espaços ou erros de digitação."); return;
    }
    try {
        const res = await fetch("/api/validate-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: firstAccessData.email })
        });
        const data = await res.json();
        if (!data.valid) {
            alert(`E-mail rejeitado pelo servidor: ${data.error}`); return;
        }
    } catch (e) {
        console.error("Erro na validação do e-mail:", e);
        alert("Não foi possível validar o domínio do e-mail no servidor (pode estar offline). Tente novamente mais tarde."); return;
    }

    const finalUser = { 
      ...firstAccessUser, 
      email: firstAccessData.email, 
      senha: firstAccessData.novaSenha, 
      nomeGuerra: firstAccessData.nomeGuerra.toUpperCase() 
    };
    delete finalUser.isFirstAccess;
    saveCustomUser(finalUser.matricula, finalUser);
    setCurrentUser(finalUser);
    setActiveTab('PORTAL');
    setShowFirstAccessModal(false);
  };

  const maskEmail = (email: string) => {
      if (!email) return '';
      const parts = email.split('@');
      if (parts.length !== 2) return email;
      const name = parts[0];
      if (name.length <= 2) return `***@${parts[1]}`;
      return `${name.substring(0, 2)}${'*'.repeat(name.length - 2)}@${parts[1]}`;
  };

  const handleForgotStep1 = () => {
      const currentDict = JSON.parse(localStorage.getItem('CUSTOM_USERS_DB') || '{}');
      const mat = forgotMatricula.trim();
      const customUser = currentDict[mat];
      if (customUser && customUser.email) {
          setForgotExpectedEmail(customUser.email);
          setForgotStep(2);
          setForgotMsg('');
          setForgotEmail('');
      } else {
          setForgotMsg('Usuário não ativou a conta ou não concluiu 1º acesso.');
      }
  };

  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const handleForgotStep2 = async () => {
      if (forgotEmail.trim().toLowerCase() === forgotExpectedEmail.toLowerCase()) {
          const tempPassword = Math.floor(100000 + Math.random() * 900000).toString();
          
          setIsSendingEmail(true);
          setForgotMsg('Enviando e-mail...');

          try {
            const response = await fetch('/api/send-email', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({
                  to: forgotEmail,
                  subject: 'Sistema de Escalas - Senha Temporária',
                  html: `<div style="font-family: sans-serif; p: 20px;">
                          <h2>Recuperação de Acesso</h2>
                          <p>Sua nova senha temporária para o sistema é: <strong>${tempPassword}</strong></p>
                          <p>Por favor, faça o login informando a matrícula e esta senha. O sistema pedirá para você cadastrar uma nova senha e confirmar seu e-mail.</p>
                         </div>`
               })
            });

            const data = await response.json();

            if (response.ok) {
              const currentDict = JSON.parse(localStorage.getItem('CUSTOM_USERS_DB') || '{}');
              const mat = forgotMatricula.trim();
              const userObj = { ...currentDict[mat], senha: tempPassword, isFirstAccess: true };
              saveCustomUser(mat, userObj);
              
              if (data.simulated) {
                 setForgotMsg(`[Simulação enviada] Senha temporária: ${tempPassword}`);
              } else {
                 setForgotMsg(`Senha temporária enviada com sucesso para: ${forgotEmail}`);
              }
              setTimeout(() => {
                  setShowForgotModal(false);
                  setForgotStep(1);
                  setForgotMsg('');
                  setForgotEmail('');
                  setForgotMatricula('');
              }, 12000);
            } else {
              setForgotMsg(`Erro ao enviar: ${data.error || 'Falha no servidor.'}`);
            }
          } catch (error) {
            setForgotMsg('Erro de conexão ao enviar e-mail.');
          } finally {
            setIsSendingEmail(false);
          }
      } else {
          setForgotMsg('O e-mail digitado não corresponde ao cadastrado.');
      }
  };

  const handleCreateNewEscala = () => {
    setEditingEscalaId(null);
    const newForm = JSON.parse(JSON.stringify(DEFAULT_FORM_DATA));
    if (currentUser) {
      newForm.issuerName = currentUser.nome || '';
      newForm.issuerMatricula = currentUser.matricula || '';
      newForm.issuerRank = (currentUser.posto || '').toUpperCase();
      newForm.issuerWarName = currentUser.nomeGuerra || '';
      newForm.issuerUbm = currentUser.ubmEscalante || currentUser.ubm || UBMS[0];
    }
    setState(prev => ({ ...prev, currentDoc: DocumentType.COST_SHEET, formData: newForm}));
    setIssuerSearchTerm(newForm.issuerName || '');
    setRecipientSearchTerm('');
    setHomologadorSearchTerm('');
    setCostSearchTerm('');
    setActiveTab('EDITOR'); // Abre o seu formulário original
  };

  const handleOpenEscala = (escala: any, targetDoc: DocumentType = DocumentType.MEMO) => {
    setEditingEscalaId(escala.id);
    
    // Auto-preencher o relatório caso esteja vazio e tenha planilha
    let formData = { ...DEFAULT_FORM_DATA, ...escala.formData };
    if (targetDoc === DocumentType.REPORT) {
      if (!formData.reportEffectiveItems || formData.reportEffectiveItems.length === 0) {
        formData.reportEffectiveItems = (formData.costSheetItems || []).map((c: any) => ({
          id: `sync-${c.id}`,
          soldierName: c.soldierName,
          soldierRank: c.soldierRank,
          soldierUbm: c.soldierUbm,
          soldierMf: c.soldierMatricula,
          status: 'P',
          serviceType: c.serviceType,
          isCommander: c.isCommander,
          isAuxiliar: c.isAuxiliar,
          role: c.role
        }));
      } else {
        // Se já existem itens no relatório, garantir que a função (role) de cada um esteja sincronizada caso esteja vazia no relatório
        formData.reportEffectiveItems = formData.reportEffectiveItems.map((item: any) => {
          if (!item.role) {
            const matchedCostItem = (formData.costSheetItems || []).find((c: any) => c.soldierMatricula === item.soldierMf);
            if (matchedCostItem && matchedCostItem.role) {
              return { ...item, role: matchedCostItem.role };
            }
          }
          return item;
        });
      }
    }

    if (!formData.reportLogistics) formData.reportLogistics = {};
    if (!formData.reportVehicles) formData.reportVehicles = {};

    setState(prev => ({ ...prev, currentDoc: targetDoc, formData }));
    setIssuerSearchTerm(formData.issuerName || '');
    const recName = formData.recipient || formData.homologadorNome || '';
    setRecipientSearchTerm(recName);
    setHomologadorSearchTerm(recName);
    setActiveTab('EDITOR');
  };

  const [driveFiles, setDriveFiles] = useState<any[]>([]);

  const handleViewPdf = async (escala: any) => {
    setViewingPdfEscalaId(escala.id);
    setAprovadorDocView('MEMO');
    
    try {
      const { getFilesFromFolder } = await import('./services/driveService');
      const dateStr = escala.formData.eventDate || escala.formData.memoDatesList?.[0] || 'Data';
      const folderName = `${escala.formData.eventName || escala.formData.operationName || 'Evento'} - ${dateStr}`;
      const files = await getFilesFromFolder(folderName);
      setDriveFiles(files || []);
    } catch (e) {
      console.warn("Could not fetch from drive, falling back to local generate", e);
      setDriveFiles([]);
    }
  };

  useEffect(() => {
    return () => {
      if (pdfBlobUrl && pdfBlobUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(pdfBlobUrl);
        } catch (e) {
          console.warn("Error revoking object URL:", e);
        }
      }
    };
  }, [pdfBlobUrl]);

  useEffect(() => {
    if (!viewingPdfEscalaId) {
      setPdfBlobUrl(null);
      setDocLoadState('idle');
      setDocErrorMsg(null);
      return;
    }
    
    if (aprovadorDocView === 'ALTERACOES') {
      setPdfBlobUrl(null);
      setDocLoadState('idle');
      setDocErrorMsg(null);
      return;
    }

    const currEscala = escalas.find(e => e.id === viewingPdfEscalaId);
    if (!currEscala) {
      setPdfBlobUrl(null);
      setDocLoadState('empty');
      setDocErrorMsg("Escala não encontrada.");
      return;
    }

    let isCancelled = false;

    const loadDoc = async () => {
      setDocLoadState('loading');
      setDocErrorMsg(null);

      try {
        // 1. GERADOS AUTOMATICAMENTE
        const generatedDocTypes = ['MEMO', 'ESCALA', 'CUSTOS', 'RELATORIO'];
        if (generatedDocTypes.includes(aprovadorDocView)) {
          // Check if there is a matching file in Google Drive files
          let matchedDriveFile = null;
          if (driveFiles && driveFiles.length > 0) {
            if (aprovadorDocView === 'MEMO') {
              matchedDriveFile = driveFiles.find(f => f.name.toLowerCase().includes('memorando'));
            } else if (aprovadorDocView === 'ESCALA') {
              matchedDriveFile = driveFiles.find(f => f.name.toLowerCase().includes('escala'));
            } else if (aprovadorDocView === 'CUSTOS') {
              matchedDriveFile = driveFiles.find(f => f.name.toLowerCase().includes('planilha') || f.name.toLowerCase().includes('custo'));
            } else if (aprovadorDocView === 'RELATORIO') {
              matchedDriveFile = driveFiles.find(f => f.name.toLowerCase().includes('relatorio'));
            }
          }

          if (matchedDriveFile) {
            const fileId = matchedDriveFile.id;
            const previewUrl = `https://drive.google.com/file/d/${fileId}/preview`;
            if (isCancelled) return;
            setPdfBlobUrl(previewUrl);
            setDocLoadState('success');
            return;
          }

          let mergedFormData = { ...DEFAULT_FORM_DATA, ...currEscala.formData };
          if (!mergedFormData.reportLogistics) mergedFormData.reportLogistics = {};
          if (!mergedFormData.reportVehicles) mergedFormData.reportVehicles = {};
          const tempState = { ...state, formData: mergedFormData };

          let blob: Blob;
          const cacheKey = `${viewingPdfEscalaId}-${aprovadorDocView}`;

          if (generatedPdfCache.current[cacheKey]) {
            blob = generatedPdfCache.current[cacheKey];
          } else {
            if (aprovadorDocView === 'MEMO') {
              tempState.currentDoc = DocumentType.MEMO;
              blob = await generatePDF(tempState, currEscala, true) as Blob;
            } else if (aprovadorDocView === 'ESCALA') {
              blob = await generateEscalaOnlyPDF(tempState, true, currentUser, currEscala.escalaApprovalLabel) as Blob;
            } else if (aprovadorDocView === 'CUSTOS') {
              tempState.currentDoc = DocumentType.COST_SHEET;
              blob = await generatePDF(tempState, currEscala, true) as Blob;
            } else { // RELATORIO
              tempState.currentDoc = DocumentType.REPORT;
              blob = await generatePDF(tempState, currEscala, true) as Blob;
            }
            generatedPdfCache.current[cacheKey] = blob;
          }

          if (isCancelled) return;

          const objectUrl = URL.createObjectURL(blob);
          setPdfBlobUrl(objectUrl);
          setDocLoadState('success');
          return;
        }

        // 2. Report Items Attachments
        if (aprovadorDocView.startsWith('ATT-')) {
          const isSub = aprovadorDocView.startsWith('ATT-SUB-');
          const itemId = aprovadorDocView.replace(isSub ? 'ATT-SUB-' : 'ATT-DISP-', '');
          const item = currEscala.formData.reportEffectiveItems?.find((i: any) => i.id === itemId);
          const attachmentUrl = item ? (isSub ? item.substituteAttachment : item.dispensaAttachment) : null;

          if (!attachmentUrl) {
            if (isCancelled) return;
            setDocLoadState('empty');
            return;
          }

          await handleAttachmentUrl(attachmentUrl);
          return;
        }

        // 3. ANEXADOS PELO USUÁRIO (NS, BG ou arquivos adicionais do Drive)
        let attachmentUrl = null;
        if (aprovadorDocView === 'NS') {
          attachmentUrl = currEscala.formData.nsAttachment;
        } else if (aprovadorDocView === 'BG') {
          attachmentUrl = currEscala.formData.bgAttachment;
        }

        let fileId = null;
        if (attachmentUrl) {
          fileId = extractFileIdFromUrl(attachmentUrl);
        }

        if (!fileId && driveFiles && driveFiles.length > 0) {
          let matchedFile = null;
          if (aprovadorDocView === 'NS') {
            matchedFile = driveFiles.find(f => {
              const nameLower = f.name.toLowerCase();
              return nameLower.includes('nota') || nameLower.includes('ns');
            });
          } else if (aprovadorDocView === 'BG') {
            matchedFile = driveFiles.find(f => {
              const nameLower = f.name.toLowerCase();
              return nameLower.includes('boletim') || nameLower.includes('bg');
            });
          } else {
            matchedFile = driveFiles.find(f => f.id === aprovadorDocView);
          }

          if (matchedFile) {
            fileId = matchedFile.id;
          }
        }

        if (!fileId && !attachmentUrl) {
          if (isCancelled) return;
          setDocLoadState('empty');
          return;
        }

        if (fileId) {
          const previewUrl = `https://drive.google.com/file/d/${fileId}/preview`;
          setPdfBlobUrl(previewUrl);
          setDocLoadState('success');
        } else if (attachmentUrl) {
          await handleAttachmentUrl(attachmentUrl);
        } else {
          if (isCancelled) return;
          setDocLoadState('empty');
        }

      } catch (err: any) {
        console.error("Error loading document:", err);
        if (isCancelled) return;
        setDocErrorMsg("Ocorreu um erro ao carregar o documento: " + (err.message || err));
        setDocLoadState('error');
      }
    };

    const handleAttachmentUrl = async (url: string) => {
      try {
        if (url.startsWith('data:')) {
          const blob = dataURLtoBlob(url);
          if (isCancelled) return;
          const objectUrl = URL.createObjectURL(blob);
          setPdfBlobUrl(objectUrl);
          setDocLoadState('success');
        } else if (url.startsWith('blob:')) {
          if (isCancelled) return;
          setPdfBlobUrl(url);
          setDocLoadState('success');
        } else {
          const fileId = extractFileIdFromUrl(url);
          if (fileId) {
            const previewUrl = `https://drive.google.com/file/d/${fileId}/preview`;
            setPdfBlobUrl(previewUrl);
            setDocLoadState('success');
          } else {
            if (isCancelled) return;
            setPdfBlobUrl(url);
            setDocLoadState('success');
          }
        }
      } catch (err: any) {
        console.error("Error handling attachment URL:", err);
        if (isCancelled) return;
        setDocErrorMsg("Não foi possível processar o anexo.");
        setDocLoadState('error');
      }
    };

    loadDoc();

    return () => {
      isCancelled = true;
    };
  }, [viewingPdfEscalaId, aprovadorDocView, driveFiles]);

  const closePdfView = () => {
    setViewingPdfEscalaId(null);
    setPdfBlobUrl(null);
  };

  const openDocumentInNewTab = async (docType: string, escala: any) => {
    setOpeningDocId(docType);
    try {
      if (['RELATORIO', 'CUSTOS'].includes(docType) && !['atestado', 'homologado', 'lancado'].includes(escala.status)) {
        alert('Este documento estará disponível apenas após o Atestado de Execução.');
        setOpeningDocId(null);
        return;
      }

      // 1. GERADOS AUTOMATICAMENTE
      const generatedDocTypes = ['MEMO', 'ESCALA', 'CUSTOS', 'RELATORIO'];
      if (generatedDocTypes.includes(docType)) {
        // Check if there is a matching file in Google Drive files
        let matchedDriveFile = null;
        if (driveFiles && driveFiles.length > 0) {
          if (docType === 'MEMO') {
            matchedDriveFile = driveFiles.find(f => f.name.toLowerCase().includes('memorando'));
          } else if (docType === 'ESCALA') {
            matchedDriveFile = driveFiles.find(f => f.name.toLowerCase().includes('escala'));
          } else if (docType === 'CUSTOS') {
            matchedDriveFile = driveFiles.find(f => f.name.toLowerCase().includes('planilha') || f.name.toLowerCase().includes('custo'));
          } else if (docType === 'RELATORIO') {
            matchedDriveFile = driveFiles.find(f => f.name.toLowerCase().includes('relatorio'));
          }
        }

        if (matchedDriveFile) {
          const fileId = matchedDriveFile.id;
          const previewUrl = `https://drive.google.com/file/d/${fileId}/view`;
          window.open(previewUrl, '_blank');
          setOpeningDocId(null);
          return;
        }

        let mergedFormData = { ...DEFAULT_FORM_DATA, ...escala.formData };
        if (!mergedFormData.reportLogistics) mergedFormData.reportLogistics = {};
        if (!mergedFormData.reportVehicles) mergedFormData.reportVehicles = {};
        const tempState = { ...state, formData: mergedFormData };

        let blob: Blob;
        const cacheKey = `${escala.id}-${docType}`;

        if (generatedPdfCache.current[cacheKey]) {
          blob = generatedPdfCache.current[cacheKey];
        } else {
          if (docType === 'MEMO') {
            tempState.currentDoc = DocumentType.MEMO;
            blob = await generatePDF(tempState, escala, true) as Blob;
          } else if (docType === 'ESCALA') {
            blob = await generateEscalaOnlyPDF(tempState, true, currentUser, escala.escalaApprovalLabel) as Blob;
          } else if (docType === 'CUSTOS') {
            tempState.currentDoc = DocumentType.COST_SHEET;
            blob = await generatePDF(tempState, escala, true) as Blob;
          } else { // RELATORIO
            tempState.currentDoc = DocumentType.REPORT;
            blob = await generatePDF(tempState, escala, true) as Blob;
          }
          generatedPdfCache.current[cacheKey] = blob;
        }

        const objectUrl = URL.createObjectURL(blob);
        window.open(objectUrl, '_blank');
        setOpeningDocId(null);
        return;
      }

      // 2. Attachments (Permutas ou Atestados)
      if (docType.startsWith('ATT-')) {
        const isSub = docType.startsWith('ATT-SUB-');
        const itemId = docType.replace(isSub ? 'ATT-SUB-' : 'ATT-DISP-', '');
        const item = escala.formData.reportEffectiveItems?.find((i: any) => i.id === itemId);
        const attachmentUrl = item ? (isSub ? item.substituteAttachment : item.dispensaAttachment) : null;

        if (attachmentUrl) {
          if (attachmentUrl.startsWith('data:')) {
            const blob = dataURLtoBlob(attachmentUrl);
            const objectUrl = URL.createObjectURL(blob);
            window.open(objectUrl, '_blank');
          } else {
            window.open(attachmentUrl, '_blank');
          }
        } else {
          alert('Anexo não disponível.');
        }
        setOpeningDocId(null);
        return;
      }

      // 3. NS / BG
      let attachmentUrl = null;
      if (docType === 'NS') {
        attachmentUrl = escala.formData.nsAttachment;
      } else if (docType === 'BG') {
        attachmentUrl = escala.formData.bgAttachment;
      }

      let fileId = null;
      if (attachmentUrl) {
        fileId = extractFileIdFromUrl(attachmentUrl);
      }

      if (!fileId && driveFiles && driveFiles.length > 0) {
        let matchedFile = null;
        if (docType === 'NS') {
          matchedFile = driveFiles.find(f => {
            const nameLower = f.name.toLowerCase();
            return nameLower.includes('nota') || nameLower.includes('ns');
          });
        } else if (docType === 'BG') {
          matchedFile = driveFiles.find(f => {
            const nameLower = f.name.toLowerCase();
            return nameLower.includes('boletim') || nameLower.includes('bg');
          });
        }
        if (matchedFile) {
          fileId = matchedFile.id;
        }
      }

      if (fileId) {
        const previewUrl = `https://drive.google.com/file/d/${fileId}/view`;
        window.open(previewUrl, '_blank');
      } else if (attachmentUrl) {
        if (attachmentUrl.startsWith('data:')) {
          const blob = dataURLtoBlob(attachmentUrl);
          const objectUrl = URL.createObjectURL(blob);
          window.open(objectUrl, '_blank');
        } else {
          window.open(attachmentUrl, '_blank');
        }
      } else {
        alert('Este documento não está disponível ou não foi anexado.');
      }
    } catch (e: any) {
      console.error(e);
      alert('Erro ao abrir documento: ' + e.message);
    }
    setOpeningDocId(null);
  };

  const handleFileUploadToDrive = async (type: 'NS' | 'BG') => {
    let authed = isDriveAuthed;
    if (!authed) {
       try {
         const result = await googleSignIn();
         if (result) {
            setIsDriveAuthed(true);
            setNeedsDriveAuth(false);
            authed = true;
         }
       } catch (e) {
          console.error(e);
          setNeedsDriveAuth(true);
          alert("Necessário fazer login no Google para salvar no Drive.");
          return;
       }
    }
    if (!authed) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.onchange = async (e: any) => {
       const file = e.target.files[0];
       if(!file) return;
       try {
           const folderName = state.formData.operationName ? `Anexos - ${state.formData.operationName}` : 'Anexos - SGRP';
           const result = await uploadFileToDrive(file, folderName);
           if (type === 'NS') {
              handleInputChange('nsAttachment', result.url);
              handleInputChange('nsAttachmentType', 'drive');
           } else {
              handleInputChange('bgAttachment', result.url);
              handleInputChange('bgAttachmentType', 'drive');
           }
           alert("Arquivo salvo com sucesso no Drive!");
       } catch(err) {
           console.error(err);
           alert("Erro ao enviar arquivo para o Google Drive.");
       }
    };
    input.click();
  };

  const handleItemFileUploadToDrive = async (itemId: string, field: 'substituteAttachment' | 'dispensaAttachment') => {
    let authed = isDriveAuthed;
    if (!authed) {
       try {
         const result = await googleSignIn();
         if (result) {
            setIsDriveAuthed(true);
            setNeedsDriveAuth(false);
            authed = true;
         }
       } catch (e) {
          console.error(e);
          setNeedsDriveAuth(true);
          alert("Necessário fazer login no Google para salvar no Drive.");
          return;
       }
    }
    if (!authed) {
       const input = document.createElement('input');
       input.type = 'file';
       input.accept = 'application/pdf,image/*';
       input.onchange = (e: any) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onloadend = () => {
             handleEffectiveStatusChange(itemId, field, reader.result as string);
             alert("Arquivo anexado localmente com sucesso!");
          };
          reader.readAsDataURL(file);
       };
       input.click();
       return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.onchange = async (e: any) => {
       const file = e.target.files[0];
       if(!file) return;
       try {
           const folderName = state.formData.operationName ? `Anexos - ${state.formData.operationName}` : 'Anexos - SGRP';
           const result = await uploadFileToDrive(file, folderName);
           handleEffectiveStatusChange(itemId, field, result.url);
           alert("Arquivo salvo com sucesso no Drive!");
       } catch(err) {
           console.error(err);
           alert("Erro ao enviar para o Drive, salvando localmente...");
           const reader = new FileReader();
           reader.onloadend = () => {
              handleEffectiveStatusChange(itemId, field, reader.result as string);
           };
           reader.readAsDataURL(file);
       }
    };
    input.click();
  };

  const handleApproveEscala = async (escalaId: string) => {
     const currentEscala = escalas.find(e => e.id === escalaId);
     if(!currentEscala) return;
     
     const cmdUser = currentUser;
     const now = new Date();
     const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium'});
     const dateStr = formatter.format(now);
     
     let approvalLabel = '';
     if (currentEscala.delegatedMatricula || currentEscala.delegatedNome) {
        approvalLabel = `De ordem homologado por ${cmdUser.nome} - ${cmdUser.posto}, dia ${dateStr}`;
     } else {
        approvalLabel = `homologado por ${cmdUser.nome} - ${cmdUser.posto}, dia ${dateStr}`;
     }
     
     const newEscala = {...currentEscala, status: 'homologado', approvalStatusLabel: approvalLabel, homologationLabel: approvalLabel};
     const newEscalas = escalas.map(e => e.id === escalaId ? newEscala : e);
     setEscalas(newEscalas);
     localStorage.setItem(SYSTEM_ESCALAS_KEY, JSON.stringify(newEscalas));
     
     const cmdMat = currentEscala.comandanteMatricula;
     const cmdUserData = customUsersDict[cmdMat];
     if (cmdUserData && cmdUserData.email) {
      await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
             to: cmdUserData.email,
             subject: 'Relatório Aprovado - Sistema de Escalas',
             html: `<p>O relatório da operação <b>${currentEscala.formData.operationName}</b> foi <b>APROVADO</b> pelo homologador.</p>`
          })
      }).then(async res => { if (!res.ok) alert("Aviso: Falha ao enviar notificação por e-mail."); }).catch(e => alert("Erro ao tentar enviar e-mail de notificação."));
     }
     alert('Processo homologado e enviado para pagamento!');
     closePdfView();
  };

  const handleReturnEscala = async () => {
     if(!returnModal.escalaId) return;
     const escalaId = returnModal.escalaId;
     const currentEscala = escalas.find(e => e.id === escalaId);
     if(!currentEscala) return;
     const newEscala = {...currentEscala, status: 'esclarecimento_solicitado', motivoDevolucao: returnReason};
     const newEscalas = escalas.map(e => e.id === escalaId ? newEscala : e);
     setEscalas(newEscalas);
     localStorage.setItem(SYSTEM_ESCALAS_KEY, JSON.stringify(newEscalas));
     
     const cmdMat = currentEscala.comandanteMatricula;
     const cmdUser = customUsersDict[cmdMat];
     if (cmdUser && cmdUser.email) {
       await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
             to: cmdUser.email,
             subject: 'Relatório Devolvido para Correção - Sistema de Escalas',
             html: `<p>O relatório da operação <b>${currentEscala.formData.operationName}</b> foi devolvido para correção.</p><p><b>Motivo:</b> ${returnReason}</p><p>Acesse o sistema para realizar os ajustes necessários.</p>`
          })
       }).then(async res => { if (!res.ok) alert("Aviso: Falha ao enviar notificação por e-mail."); }).catch(e => alert("Erro ao tentar enviar e-mail de notificação."));
     }
     
     alert('Processo devolvido para o comandante corrigir.');
     setReturnModal({isOpen: false, escalaId: null});
     setReturnReason('');
     closePdfView();
  };

  const updateClarificationStatus = (escalaId: string, itemId: string, status: 'SOLICITADO' | 'RESOLVIDO' | 'JUSTIFICADO') => {
    setEscalas(prev => {
       const nextEscalas = prev.map(e => {
          if (e.id === escalaId) {
             return {
                ...e,
                formData: {
                   ...e.formData,
                   reportEffectiveItems: (e.formData.reportEffectiveItems || []).map((item: any) => 
                     item.id === itemId ? { ...item, clarificationStatus: status } : item
                   )
                }
             };
          }
          return e;
       });
       localStorage.setItem(SYSTEM_ESCALAS_KEY, JSON.stringify(nextEscalas));
       return nextEscalas;
    });
  };

  const handleLaunchAllForPayment = async (escalaId: string) => {
    const esc = escalas.find(e => e.id === escalaId);
    if (!esc) return;

    const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium'});
    const nowStamp = formatter.format(new Date());

    const updatedItems = (esc.formData.costSheetItems || []).map((i: any) => ({
      ...i,
      isLaunched: true}));

    const launchedLabelText = `Lançado por ${currentUser.nome} (${currentUser.posto}) em ${nowStamp}`;

    const updatedEscala = {
      ...esc,
      status: 'lancado' as const,
      paymentLaunchLabel: launchedLabelText,
      launchedByName: currentUser.nome,
      launchedByPosto: currentUser.posto,
      launchedAt: nowStamp,
      launchedByLabel: launchedLabelText,
      formData: {
        ...esc.formData,
        costSheetItems: updatedItems
      }
    };

    const newEscalas = escalas.map(e => e.id === escalaId ? updatedEscala : e);
    setEscalas(newEscalas);
    localStorage.setItem(SYSTEM_ESCALAS_KEY, JSON.stringify(newEscalas));

    for (const item of updatedItems) {
      const mUser = customUsersDict[item.soldierMatricula];
      if (mUser && mUser.email) {
        await fetch('/api/send-email', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
               to: mUser.email,
               subject: 'Aviso de Lançamento de Extraordinária - Pagamento',
               html: `<p>A extraordinária referente à operação <b>${esc.formData.operationName}</b> foi lançada na sua folha de pagamento.</p><p>Acesse o sistema para conferência no seu painel.</p>`
           })
        }).then(async res => { if (!res.ok) alert("Aviso: Falha ao enviar notificação por e-mail."); }).catch(e => alert("Erro ao tentar enviar e-mail de notificação."));
      }
    }

    alert(`Todos os militares foram lançados com sucesso!\nRegistro gravado: ${launchedLabelText}`);
    setPagamentoEscalaId(null);
  };

  const saveEscalaWorkflow = async (novoStatus: string, actionMessage: string, stayOnScreen: boolean = false) => {
    const isNew = !editingEscalaId;
    const currentId = isNew ? Date.now().toString() : editingEscalaId;
    
    // Identifica o Cmt e Auxiliar dinamicamente da sua planilha
    const comandanteItem = state.formData.costSheetItems.find((i: any) => i.isCommander);
    const cmdMatricula = comandanteItem ? comandanteItem.soldierMatricula : state.formData.issuerMatricula;

    const auxiliarItem = state.formData.costSheetItems.find((i: any) => i.isAuxiliar);
    const auxMatricula = auxiliarItem ? auxiliarItem.soldierMatricula : null;

    const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium'});
    const nowStamp = formatter.format(new Date());

    let updatedLabels: any = {};
    if (novoStatus === 'em_edicao') {
         updatedLabels.escalaApprovalLabel = `Escala aprovada por ${currentUser.nome} - ${currentUser.posto} dia ${nowStamp}`;
         updatedLabels.approvalStatusLabel = updatedLabels.escalaApprovalLabel;
    } else if (novoStatus === 'atestado') {
         updatedLabels.executionApprovalLabel = `Execução atestada por ${currentUser.nome} - ${currentUser.posto}, dia ${nowStamp}`;
         updatedLabels.approvalStatusLabel = updatedLabels.executionApprovalLabel;
    } else if (novoStatus === 'lancado') {
         updatedLabels.paymentLaunchLabel = `lançado para pagamento por ${currentUser.nome} - ${currentUser.posto}, dia ${nowStamp}`;
         updatedLabels.approvalStatusLabel = updatedLabels.paymentLaunchLabel;
    }

    const currentEscala = escalas.find(e => e.id === currentId) || {};

    const novaEscala = {
      ...currentEscala,
      id: currentId,
      status: novoStatus,
      formData: state.formData,
      escalanteMatricula: currentUser.matricula,
      ubm: currentUser.ubmEscalante || currentUser.ubm || currentEscala.ubm || state.formData.issuerUbm || 'COP',
      comandanteMatricula: cmdMatricula,
      auxiliarMatricula: auxMatricula,
      homologadorMatricula: state.formData.homologadorMatricula,
      destinatarioMatricula: state.formData.recipient, // Pode extrair a matrícula se desejar
      ...updatedLabels
    };

    let nextEscalas = [];
    if (isNew) {
      nextEscalas = [...escalas, novaEscala];
      setEscalas(nextEscalas);
    } else {
      nextEscalas = escalas.map(e => e.id === currentId ? { ...e, ...novaEscala } : e);
      setEscalas(nextEscalas);
    }
    localStorage.setItem(SYSTEM_ESCALAS_KEY, JSON.stringify(nextEscalas));

    // Handle automated processes for "atestado"
    if (novoStatus === 'atestado') {
        const { uploadBlobToNestedDrive } = await import('./services/driveService');
        const { generateEscalaOnlyPDF, generatePDF } = await import('./utils/pdfGenerator');
        
        try {
            // Generate the 4 PDFs
            const dateStr = state.formData.eventDate || state.formData.memoDatesList?.[0] || 'Data';
            const folderName = `${state.formData.eventName || state.formData.operationName || 'Evento'} - ${dateStr}`;
            
            const docs = [
                { blob: generatePDF({ ...state, currentDoc: DocumentType.MEMO }, undefined, true), name: `Memorando.pdf` },
                { blob: generateEscalaOnlyPDF(state, true, currentUser, escalas.find(e => e.id === editingEscalaId)?.escalaApprovalLabel), name: `Escala.pdf` },
                { blob: generatePDF({ ...state, currentDoc: DocumentType.REPORT }, undefined, true), name: `Relatorio.pdf` },
                { blob: generatePDF({ ...state, currentDoc: DocumentType.COST_SHEET }, undefined, true), name: `Planilha_Custos.pdf` }
            ];

            for (const doc of docs) {
                if (doc.blob) {
                    await uploadBlobToNestedDrive(doc.blob as Blob, doc.name, 'Extras_app', folderName);
                }
            }
            alert('PDFs gerados e salvos no Google Drive com sucesso.');

            // Notify Homologador (If email exists, otherwise system handles notification internally)
            if (novaEscala.homologadorMatricula) {
                const homUser = customUsersDict[novaEscala.homologadorMatricula];
                if (homUser && homUser.email) {
                    await fetch('/api/send-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            to: homUser.email,
                            subject: 'Novo Serviço Atestado para Homologação',
                            html: `<p>O serviço <b>${novaEscala.formData.operationName || novaEscala.formData.eventName}</b> foi atestado pelo Comandante e está aguardando sua homologação.</p>`
                        })
                    }).then(async res => { if (!res.ok) alert("Aviso: Falha ao enviar notificação por e-mail."); }).catch(e => alert("Erro ao tentar enviar e-mail de notificação."));
                }
            }

        } catch (e) {
            console.error('Failed to generate or upload PDFs', e);
            alert('Erro ao salvar os PDFs no Drive. Certifique-se de estar logado.');
        }
    }

    alert(actionMessage);
    
    if (stayOnScreen) {
      setEditingEscalaId(currentId);
    } else {
      setActiveTab((currentUser?.permissoes || []).includes('ESCALANTE') ? 'ESCALANTE' : 'PORTAL');
    }
  };

  // Suas funções de manipulação do form (MANTIDAS)
  const handleInputChange = (field: keyof AppState['formData'], value: any) => {
    const finalValue = field === 'issuerRank' ? String(value).toUpperCase() : value;
    setState(prev => ({
      ...prev,
      formData: { ...prev.formData, [field]: finalValue }}));
  };

  const filterSoldiers = (term: string) => {
    if (!term || term.length < 2) return [];
    const t = term.toUpperCase();
    return state.personnelDb.filter(p => p.nome.includes(t) || p.matricula.includes(t)).slice(0, 10);
  };

  const handleIssuerSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setIssuerSearchTerm(val);
    handleInputChange('issuerName', val);
    if (val.length >= 2) {
      setIssuerSuggestions(filterSoldiers(val));
      setShowIssuerSuggestions(true);
    } else {
      setShowIssuerSuggestions(false);
    }
  };

  const selectIssuer = (s: Soldier) => {
    setIssuerSearchTerm(s.nome);
    setShowIssuerSuggestions(false);
    handleInputChange('issuerName', s.nome);
    handleInputChange('issuerMatricula', s.matricula);
    if (s.posto) handleInputChange('issuerRank', s.posto.toUpperCase());
    if (s.ubm) handleInputChange('issuerUbm', s.ubm);
    try {
      const customUsers = JSON.parse(localStorage.getItem('CUSTOM_USERS_DB') || '{}');
      const u = customUsers[s.matricula];
      if (u && u.nomeGuerra) {
        handleInputChange('issuerWarName', u.nomeGuerra);
      }
    } catch (err) {
      console.error("Error reading custom users db on issuer select:", err);
    }
  };

  const handleSubstituteSearchChange = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    handleEffectiveStatusChange(id, 'substituteName', val);
    if (val.length >= 2) {
      setActiveSubstituteId(id);
      setSubstituteSuggestions(filterSoldiers(val));
    } else {
      setActiveSubstituteId(null);
    }
  };

  const selectSubstitute = (id: string, s: Soldier) => {
    const formatted = `${s.posto} ${s.nome} (Mat: ${s.matricula})`;
    handleEffectiveStatusChange(id, 'substituteName', formatted);
    handleEffectiveStatusChange(id, 'substituteMf', s.matricula);
    setActiveSubstituteId(null);
  };

  const handleRecipientSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setRecipientSearchTerm(val);
    setHomologadorSearchTerm(val);
    handleInputChange('recipient', val);
    handleInputChange('homologadorNome', val);

    // Matching in personnel database
    const match = state.personnelDb.find(s => 
      s.matricula === val.trim() || 
      val.toUpperCase().includes(s.nome.toUpperCase())
    );
    if (match) {
      const rank = match.posto ? match.posto.toUpperCase() : '';
      handleInputChange('recipientMatricula', match.matricula);
      handleInputChange('homologadorMatricula', match.matricula);
      handleInputChange('recipientNome', match.nome);
      handleInputChange('recipientPosto', rank);
      handleInputChange('homologadorPosto', rank);
    }

    if (val.length >= 2) {
      setRecipientSuggestions(filterSoldiers(val));
      setShowRecipientSuggestions(true);
    } else {
      setShowRecipientSuggestions(false);
    }
  };

  const selectRecipient = (s: Soldier) => {
    const memoRank = s.posto ? s.posto.toUpperCase() : '';
    const formattedRecipient = `${s.nome} - ${memoRank}`;
    setRecipientSearchTerm(formattedRecipient);
    setHomologadorSearchTerm(formattedRecipient);
    setShowRecipientSuggestions(false);
    setShowHomologadorSuggestions(false);

    handleInputChange('recipient', formattedRecipient);
    handleInputChange('recipientMatricula', s.matricula);
    handleInputChange('recipientNome', s.nome);
    handleInputChange('recipientPosto', memoRank);

    // Auto synchronize homologador fields with the recipient
    handleInputChange('homologadorNome', formattedRecipient);
    handleInputChange('homologadorMatricula', s.matricula);
    handleInputChange('homologadorPosto', memoRank);
  };

  const handleHomologadorSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHomologadorSearchTerm(val);
    setRecipientSearchTerm(val);
    handleInputChange('homologadorNome', val);
    handleInputChange('recipient', val);

    const match = state.personnelDb.find(s => 
      s.matricula === val.trim() || 
      val.toUpperCase().includes(s.nome.toUpperCase())
    );
    if (match) {
      const rank = match.posto ? match.posto.toUpperCase() : '';
      handleInputChange('homologadorMatricula', match.matricula);
      handleInputChange('recipientMatricula', match.matricula);
      handleInputChange('recipientNome', match.nome);
      handleInputChange('homologadorPosto', rank);
      handleInputChange('recipientPosto', rank);
    }

    if (val.length >= 2) {
      setHomologadorSuggestions(filterSoldiers(val));
      setShowHomologadorSuggestions(true);
    } else {
      setShowHomologadorSuggestions(false);
    }
  };

  const selectHomologador = (s: Soldier) => {
    const memoRank = s.posto ? s.posto.toUpperCase() : '';
    const formattedHomologador = `${s.nome} - ${memoRank}`;
    setHomologadorSearchTerm(formattedHomologador);
    setRecipientSearchTerm(formattedHomologador);
    setShowHomologadorSuggestions(false);
    setShowRecipientSuggestions(false);
    
    // Update formData with the detailed soldier data
    handleInputChange('homologadorNome', formattedHomologador);
    handleInputChange('homologadorMatricula', s.matricula);
    handleInputChange('homologadorPosto', memoRank);

    handleInputChange('recipient', formattedHomologador);
    handleInputChange('recipientMatricula', s.matricula);
    handleInputChange('recipientNome', s.nome);
    handleInputChange('recipientPosto', memoRank);
  };

  const handleDelegateHomologacaoFunction = (escalaId: string, soldier: Soldier) => {
    const targetName = `${soldier.posto ? soldier.posto.toUpperCase() + ' ' : ''}${soldier.nome}`;
    const newEscalas = escalas.map(e => {
      if (e.id === escalaId) {
        return {
          ...e,
          delegatedMatricula: soldier.matricula,
          delegatedNome: targetName,
          delegatedByMatricula: currentUser.matricula,
          delegatedByNome: `${currentUser.posto || ''} ${currentUser.nome}`.trim(),
          delegatedAt: new Date().toLocaleDateString('pt-BR')
        };
      }
      return e;
    });
    setEscalas(newEscalas);
    localStorage.setItem(SYSTEM_ESCALAS_KEY, JSON.stringify(newEscalas));
    setDelegationModal({ isOpen: false, escalaId: null });
    setDelegationSearch('');
    setDelegationSuggestions([]);
    alert(`Função delegada com sucesso para ${targetName}! O militar agora pode homologar este processo.`);
  };

  const handleRemoveDelegation = (escalaId: string) => {
    const newEscalas = escalas.map(e => {
      if (e.id === escalaId) {
        const updated = { ...e };
        delete updated.delegatedMatricula;
        delete updated.delegatedNome;
        delete updated.delegatedByMatricula;
        delete updated.delegatedByNome;
        delete updated.delegatedAt;
        return updated;
      }
      return e;
    });
    setEscalas(newEscalas);
    localStorage.setItem(SYSTEM_ESCALAS_KEY, JSON.stringify(newEscalas));
    alert('Delegação revogada com sucesso.');
  };

  const handleCostSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCostSearchTerm(val);
    if (val.length >= 2) {
      setCostSuggestions(filterSoldiers(val));
      setShowCostSuggestions(true);
    } else {
      setShowCostSuggestions(false);
    }
  };

  const selectCostSoldier = (s: Soldier) => {
    setCostSearchTerm(`${s.matricula} - ${s.nome}`);
    setShowCostSuggestions(false);
    setNewCostItem(prev => ({ ...prev, selectedSoldier: s, ubm: s.ubm || UBMS[0] }));
  };

  const addSoldierToRoster = () => {
    const { selectedSoldier, serviceType, qty, ubm } = newCostItem;
    const soldierName = selectedSoldier?.nome || "Militar Manual";
    const soldierRank = selectedSoldier?.posto ? selectedSoldier.posto.toUpperCase() : "SD QBM";
    const soldierUbm = ubm || selectedSoldier?.ubm || "UBM";
    const soldierMatricula = selectedSoldier?.matricula || costSearchTerm;

    if (!soldierMatricula) {
      alert("Selecione um militar ou digite uma matrícula.");
      return;
    }

    // Interval Check
    const eventDate = state.formData.eventDate;
    if (eventDate) {
        let conflictFound = false;
        const currentEventStart = new Date(`${eventDate}T${state.formData.eventStartTime || '00:00'}`);
        escalas.forEach(e => {
            if (e.id === editingEscalaId) return; // avoid self
            if (e.status === 'esclarecimento_solicitado' || e.status === 'em_edicao' || e.status === 'atestado' || e.status === 'homologado' || e.status === 'lancado') {
                const hasSoldier = e.formData.costSheetItems?.some((c:any) => c.soldierMatricula === soldierMatricula);
                if (hasSoldier && e.formData.eventDate) {
                    const otherStart = new Date(`${e.formData.eventDate}T${e.formData.eventStartTime || '00:00'}`);
                    const diffTime = Math.abs(currentEventStart.getTime() - otherStart.getTime());
                    const diffHours = diffTime / (1000 * 60 * 60);
                    if (diffHours < 24) {
                        conflictFound = true;
                    }
                }
            }
        });
        if (conflictFound) {
            const proceed = window.confirm(`CUIDADO: O militar ${soldierName} já está escalado em outra missão com intervalo menor que 24 horas. Deseja escalar mesmo assim?`);
            if (!proceed) return;
        }
    }

    const newItem: CostSheetItem = {
      id: Date.now().toString(),
      soldierName,
      soldierMatricula,
      soldierRank,
      soldierUbm,
      date: newCostDatesList.length > 0 ? newCostDatesList.join(', ') : '',
      datesList: newCostDatesList,
      serviceType: serviceType as any,
      quantity: qty,
      unitValue: UNIT_VALUE_DEFAULT,
      isCommander: false
    };

    setState(prev => ({
      ...prev,
      formData: { ...prev.formData, costSheetItems: [...prev.formData.costSheetItems, newItem] }
    }));

    setCostSearchTerm('');
    setShowCostSuggestions(false);
    setNewCostItem(prev => ({ ...prev, selectedSoldier: null, qty: 1 }));
    setNewCostDatesList([]);
    setCostDateInput('');
  };

  const initiateCommanderSelection = (id: string, context: 'COST' | 'REPORT') => {
    setCommanderSelectionContext(context);
    setTempCommanderId(id);
    setTempWarName(''); 
    setShowWarNameModal(true);
  };

  const confirmCommander = () => {
    setState(prev => {
      let newFormData = { ...prev.formData };

      if (commanderSelectionContext === 'COST') {
        const updatedItems = prev.formData.costSheetItems.map(item => ({
          ...item,
          isCommander: item.id === tempCommanderId,
          role: item.id === tempCommanderId ? 'Comandante' : (item.role === 'Comandante' ? '' : item.role)
        }));
        newFormData.costSheetItems = updatedItems;
        const commander = updatedItems.find(i => i.id === tempCommanderId);
        
        if (commander) {
          newFormData.issuerName = commander.soldierName;
          newFormData.issuerMatricula = commander.soldierMatricula;
          newFormData.issuerRank = commander.soldierRank;
          newFormData.issuerUbm = commander.soldierUbm;
          newFormData.issuerWarName = tempWarName;
        }
      } else {
        const updatedItems = prev.formData.reportEffectiveItems.map(item => ({
          ...item,
          isCommander: item.id === tempCommanderId,
          role: item.id === tempCommanderId ? 'Comandante' : (item.role === 'Comandante' ? '' : item.role)
        }));
        newFormData.reportEffectiveItems = updatedItems;
        const commander = updatedItems.find(i => i.id === tempCommanderId);
        
        if (commander) {
           newFormData.issuerName = commander.soldierName;
           newFormData.issuerMatricula = commander.soldierMf; 
           newFormData.issuerRank = commander.soldierRank;
           newFormData.issuerUbm = commander.soldierUbm;
           newFormData.issuerWarName = tempWarName;
        }
      }

      return { ...prev, formData: newFormData };
    });
    setShowWarNameModal(false);
  };

  const handleEffectiveStatusChange = (id: string, field: string, value: string) => {
    setState(prev => ({
      ...prev,
      formData: {
        ...prev.formData,
        reportEffectiveItems: prev.formData.reportEffectiveItems.map(item => 
          item.id === id ? { ...item, [field]: value } : item
        )
      }
    }));
  };

  const removeEffectiveItem = (id: string) => {
    setState(prev => ({
      ...prev,
      formData: { ...prev.formData, reportEffectiveItems: prev.formData.reportEffectiveItems.filter(i => i.id !== id) }
    }));
  };

  const handleAddServiceItem = () => {
    setState(prev => ({
      ...prev,
      formData: {
        ...prev.formData,
        reportServiceItems: [
          ...(prev.formData.reportServiceItems || []),
          { id: crypto.randomUUID(), name: '', age: '', sex: 'M', condition: 'ILESA', code: '1 - ESCORIAÇÃO' }
        ]
      }
    }));
  };

  const handleServiceItemChange = (id: string, field: string, value: string) => {
    setState(prev => ({
      ...prev,
      formData: {
        ...prev.formData,
        reportServiceItems: (prev.formData.reportServiceItems || []).map(item => 
          item.id === id ? { ...item, [field]: value } : item
        )
      }
    }));
  };

  const handleRemoveServiceItem = (id: string) => {
    setState(prev => ({
      ...prev,
      formData: {
        ...prev.formData,
        reportServiceItems: (prev.formData.reportServiceItems || []).filter(i => i.id !== id)
      }
    }));
  };

  const updateRole = (id: string, role: string, context: 'COST' | 'REPORT') => {
    if (role === 'Comandante') {
      initiateCommanderSelection(id, context);
      return;
    }

    setState(prev => {
      let newFormData = { ...prev.formData };
      const isAuxiliar = role === 'Aux. do Cmt';
      
      const updateItemRole = (item: any) => {
        if (item.id === id) {
          return { ...item, role, isAuxiliar, isCommander: false };
        }
        return {
          ...item,
          isAuxiliar: isAuxiliar ? false : item.isAuxiliar,
          role: isAuxiliar && item.role === 'Aux. do Cmt' ? '' : item.role
        };
      };

      if (context === 'COST') {
        newFormData.costSheetItems = prev.formData.costSheetItems.map(updateItemRole);
      } else {
        newFormData.reportEffectiveItems = prev.formData.reportEffectiveItems.map(updateItemRole);
      }
      return { ...prev, formData: newFormData };
    });
  };

  const toggleAuxiliar = (id: string, context: 'COST' | 'REPORT') => {
    setState(prev => {
      let newFormData = { ...prev.formData };
      if (context === 'COST') {
        newFormData.costSheetItems = prev.formData.costSheetItems.map(item => ({
          ...item,
          isAuxiliar: item.id === id ? !item.isAuxiliar : false // Only one auxiliar? The prompt says "marcar nela o comandante e auxiliar do comandante", implying singular. So toggle current, unset others.
        }));
      } else {
        newFormData.reportEffectiveItems = prev.formData.reportEffectiveItems.map(item => ({
          ...item,
          isAuxiliar: item.id === id ? !item.isAuxiliar : false
        }));
      }
      return { ...prev, formData: newFormData };
    });
  };

  const parseCSV = (csvText: string): Soldier[] => {
    const rawLines = csvText.split(/\r\n|\n|\r/).filter(line => line.trim() !== '');
    const startIdx = rawLines[0].toLowerCase().includes('matricula') ? 1 : 0;
    const dataLines = rawLines.slice(startIdx);
    
    return dataLines.map((line): Soldier | null => {
      const cols = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      if (cols.length < 3) return null;
      const matriculaIdx = cols.findIndex(c => /^\d{5,}/.test(c));
      const nomeIdx = matriculaIdx > 0 ? matriculaIdx - 1 : 0;
      const cargoIdx = matriculaIdx + 1;
      const finalMat = matriculaIdx !== -1 ? cols[matriculaIdx] : cols[2];
      const finalNome = matriculaIdx !== -1 ? cols[nomeIdx] : cols[1];
      const finalCargo = cols[cargoIdx] || cols[3] || '';
      if (!finalNome || !finalMat) return null;
      return {
        matricula: finalMat,
        nome: finalNome,
        posto: finalCargo,
        ubm: "QCG", 
        cpf: ''
      };
    }).filter((p): p is Soldier => p !== null);
  };

  // Funções Auxiliares (Drag and Drop, etc) omitidas da listagem acima para brevidade, mas devem ser mantidas
  const handleDragStart = (e: React.DragEvent, index: number) => setDraggedIndex(index);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    setState(prev => {
      const newItems = [...prev.formData.costSheetItems];
      const draggedItem = newItems[draggedIndex];
      newItems.splice(draggedIndex, 1);
      newItems.splice(dropIndex, 0, draggedItem);
      return { ...prev, formData: { ...prev.formData, costSheetItems: newItems } };
    });
    setDraggedIndex(null);
  };

  const removeCostItem = (id: string) => {
    setState(prev => ({
      ...prev,
      formData: { ...prev.formData, costSheetItems: prev.formData.costSheetItems.filter(i => i.id !== id) }
    }));
  };

  const formatAnyDate = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  const addMemoDate = () => {
    if (!tempDateInput) return;
    const currentList = state.formData.memoDatesList || [];
    if (!currentList.includes(tempDateInput)) {
      handleInputChange('memoDatesList', [...currentList, tempDateInput].sort());
    }
    setTempDateInput('');
  };

  const addMemoMonth = () => {
    if (!tempMonthInput) return;
    const [year, month] = tempMonthInput.split('-');
    const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
    const newDates = [];
    for (let i = 1; i <= daysInMonth; i++) {
        const day = i.toString().padStart(2, '0');
        newDates.push(`${year}-${month}-${day}`);
    }
    const currentList = state.formData.memoDatesList || [];
    const merged = Array.from(new Set([...currentList, ...newDates])).sort();
    handleInputChange('memoDatesList', merged);
    setTempMonthInput('');
  };

  const removeMemoDate = (d: string) => {
    const currentList = state.formData.memoDatesList || [];
    handleInputChange('memoDatesList', currentList.filter((x: string) => x !== d));
  };

  const removePhotoField = (index: number) => {
    setState(prev => {
      const newPhotos = (prev.formData.reportPhotos || []).filter((_, i) => i !== index);
      return { ...prev, formData: { ...prev.formData, reportPhotos: newPhotos } };
    });
  };

  const toggleLogisticsItem = (item: string) => {
    setState(prev => {
        const current = prev.formData.reportLogistics[item] || { used: false, qty: '' };
        return {
            ...prev,
            formData: {
                ...prev.formData,
                reportLogistics: {
                    ...prev.formData.reportLogistics,
                    [item]: { ...current, used: !current.used }
                }
            }
        };
    });
  };

  const updateLogisticsQty = (item: string, qty: string) => {
    setState(prev => {
        const current = prev.formData.reportLogistics[item] || { used: true, qty: '' };
        return {
            ...prev,
            formData: {
                ...prev.formData,
                reportLogistics: {
                    ...prev.formData.reportLogistics,
                    [item]: { ...current, qty }
                }
            }
        };
    });
  };

  const toggleVehicleItem = (item: string) => {
    setState(prev => {
        const current = prev.formData.reportVehicles[item] || { used: false, qty: '', origin: '' };
        return {
            ...prev,
            formData: {
                ...prev.formData,
                reportVehicles: {
                    ...prev.formData.reportVehicles,
                    [item]: { ...current, used: !current.used }
                }
            }
        };
    });
  };

  const updateVehicleQty = (item: string, qty: string) => {
    setState(prev => {
        const current = prev.formData.reportVehicles[item] || { used: true, qty: '', origin: '' };
        return {
            ...prev,
            formData: {
                ...prev.formData,
                reportVehicles: {
                    ...prev.formData.reportVehicles,
                    [item]: { ...current, qty }
                }
            }
        };
    });
  };

  const updateVehicleOrigin = (item: string, origin: string) => {
    setState(prev => {
        const current = prev.formData.reportVehicles[item] || { used: true, qty: '', origin: '' };
        return {
            ...prev,
            formData: {
                ...prev.formData,
                reportVehicles: {
                    ...prev.formData.reportVehicles,
                    [item]: { ...current, origin }
                }
            }
        };
    });
  };

  
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setState(prev => {
        const newPhotos = [...(prev.formData.reportPhotos || [])];
        newPhotos[index] = base64;
        return { ...prev, formData: { ...prev.formData, reportPhotos: newPhotos } };
      });
    };
    reader.readAsDataURL(file);
  };

  const addPhotoField = () => {
    setState(prev => ({
      ...prev,
      formData: { ...prev.formData, reportPhotos: [...(prev.formData.reportPhotos || []), ''] }
    }));
  };

  // Renderização de Badges
  const renderBadge = (status: string) => {
    switch(status) {
      case 'em_edicao': return <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-bold border border-yellow-200">PREVISTA</span>;
      case 'atestado': return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold border border-blue-200">EXECUTADA</span>;
      case 'esclarecimento_solicitado': return <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-bold border border-red-200">DEVOLVIDA</span>;
      case 'homologado': return <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold border border-green-200">APROVADA</span>;
      case 'lancado': return <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-bold border border-gray-300">LANÇADA P/ PAGTO</span>;
      default: return null;
    }
  };

  // --- TELA DE LOGIN ---
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-md border-t-4 border-cbmpa-700">
          <div className="flex flex-col items-center mb-8">
            <Flame size={48} className="text-yellow-500 mb-2" />
            <h1 className="text-3xl font-black text-cbmpa-900 dark:text-white tracking-wider">EXTRA DOCS</h1>
            <p className="text-sm text-gray-500 mt-1">Acesso Corporativo Integrado</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && <p className="text-red-500 text-sm bg-red-50 p-2 rounded">{loginError}</p>}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Matrícula</label>
              <div className="relative">
                <User className="absolute left-3 top-3 text-gray-400" size={18} />
                <input type="text" required className="w-full pl-10 pr-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={loginData.matricula} onChange={e => setLoginData({...loginData, matricula: e.target.value})} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-gray-400" size={18} />
                <input 
                  type={showLoginPassword ? "text" : "password"} 
                  required 
                  className="w-full pl-10 pr-10 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
                  value={loginData.senha} 
                  onChange={e => setLoginData({...loginData, senha: e.target.value})} 
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  title={showLoginPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            
            <div className="flex justify-end">
              <button type="button" onClick={() => { setShowForgotModal(true); setForgotStep(1); setForgotMatricula(''); setForgotMsg(''); }} className="text-xs text-cbmpa-700 hover:underline dark:text-yellow-500">Esqueci minha senha</button>
            </div>

            <button type="submit" className="w-full bg-cbmpa-700 text-white py-3 rounded-md font-bold hover:bg-cbmpa-800 transition-colors mt-4">Entrar</button>
          </form>
        </div>

        {/* Modal Primeiro Acesso / Redefinição de Senha */}
        {showFirstAccessModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg w-full max-w-md shadow-xl border border-gray-200 dark:border-gray-700">
               <h3 className="text-lg font-bold text-cbmpa-900 dark:text-white border-b pb-2 mb-4">{firstAccessUser?.email ? "Redefinição de Senha" : "Configuração Inicial"}</h3>
               <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{firstAccessUser?.email ? `Olá, ${firstAccessUser?.nome}. Por favor, cadastre sua nova senha.` : `Bem-vindo, ${firstAccessUser?.nome}! Como este é o seu primeiro acesso, cadastre seu e-mail para recuperação, seu nome de guerra e defina uma nova senha.`}</p>
               <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">E-mail para recuperação</label>
                    <input type="email" required className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-cbmpa-500" value={firstAccessData.email} onChange={e => setFirstAccessData({...firstAccessData, email: e.target.value})} placeholder="seu.email@exemplo.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Nome de Guerra</label>
                    <input type="text" required className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-cbmpa-500" value={firstAccessData.nomeGuerra} onChange={e => setFirstAccessData({...firstAccessData, nomeGuerra: e.target.value})} placeholder="Ex: SOUZA JUNIOR" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Nova Senha</label>
                    <div className="relative">
                      <input 
                        type={showNewPassword ? "text" : "password"} 
                        required 
                        className="w-full p-2 pr-10 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
                        value={firstAccessData.novaSenha} 
                        onChange={e => setFirstAccessData({...firstAccessData, novaSenha: e.target.value})} 
                        placeholder="Sua nova senha"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        title={showNewPassword ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Confirmar Nova Senha</label>
                    <div className="relative">
                      <input 
                        type={showConfirmPassword ? "text" : "password"} 
                        required 
                        className="w-full p-2 pr-10 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
                        value={firstAccessData.confirmarSenha} 
                        onChange={e => setFirstAccessData({...firstAccessData, confirmarSenha: e.target.value})} 
                        placeholder="Repita a nova senha"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        title={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
               </div>
               <div className="mt-6 flex justify-end gap-2">
                 <button onClick={() => setShowFirstAccessModal(false)} className="px-4 py-2 border rounded text-gray-600">Cancelar</button>
                 <button onClick={confirmFirstAccess} className="bg-cbmpa-700 text-white px-4 py-2 rounded font-bold hover:bg-cbmpa-800">Concluir</button>
               </div>
            </div>
          </div>
        )}

        {/* Modal Esqueci a Senha */}
        {showForgotModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg w-full max-w-md shadow-xl border border-gray-200 dark:border-gray-700">
               <h3 className="text-lg font-bold text-cbmpa-900 border-b pb-2 mb-4">Recuperação de Senha</h3>
               
               {forgotMsg && <p className={`text-sm mb-4 p-2 rounded ${forgotMsg.includes('enviada') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{forgotMsg}</p>}

               {forgotStep === 1 ? (
                 <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Matrícula</label>
                      <input type="text" className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white" value={forgotMatricula} onChange={e => setForgotMatricula(e.target.value)} placeholder="Sua matrícula" />
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                       <button onClick={() => setShowForgotModal(false)} className="px-4 py-2 border rounded text-gray-600">Cancelar</button>
                       <button onClick={handleForgotStep1} className="bg-cbmpa-700 text-white px-4 py-2 rounded font-bold hover:bg-cbmpa-800">Continuar</button>
                    </div>
                 </div>
               ) : (
                 <div className="space-y-3">
                    <p className="text-sm text-gray-600">Confirme seu e-mail cadastrado ({maskEmail(forgotExpectedEmail)}) para receber a nova senha.</p>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">E-mail completo</label>
                      <input type="email" className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="Email..." />
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                       <button onClick={() => { setForgotStep(1); setForgotMsg(''); }} disabled={isSendingEmail} className="px-4 py-2 border rounded text-gray-600 disabled:opacity-50">Voltar</button>
                       <button onClick={handleForgotStep2} disabled={isSendingEmail} className="bg-cbmpa-700 text-white px-4 py-2 rounded font-bold hover:bg-cbmpa-800 disabled:opacity-50 flex items-center justify-center">
                          {isSendingEmail ? 'Enviando...' : 'Enviar Senha'}
                       </button>
                    </div>
                 </div>
               )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors">
      
      {/* Sidebar Corporativa */}
      <aside className="w-full md:w-64 bg-cbmpa-900 text-white flex-shrink-0 flex flex-col shadow-lg z-10">
        <div className="p-6 border-b border-cbmpa-800 flex justify-between items-center bg-cbmpa-950">
          <div className="flex items-center space-x-2">
            <Flame size={24} className="text-yellow-500" />
            <h1 className="font-bold text-xl tracking-wider">EXTRA DOCS</h1>
          </div>
          <button onClick={() => setState(prev => ({ ...prev, darkMode: !prev.darkMode }))} className="p-2 rounded-full hover:bg-cbmpa-800 text-yellow-500">
            {state.darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
        
        <div className="p-4 bg-cbmpa-800 border-b border-cbmpa-700">
          <div className="font-bold text-yellow-400">{currentUser.nome}</div>
          <div className="text-xs text-gray-400 mt-1">{currentUser.posto}</div>
          <div className="text-xs text-gray-300 mt-1">Mat: {currentUser.matricula}</div>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {(currentUser?.permissoes || []).includes('ADMIN') ? (
            <button onClick={() => setActiveTab('ADMIN')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'ADMIN' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
              <User size={20} /><span>Administração</span>
              {roleRequests.filter((r:any) => r.status === 'PENDING').length > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full ml-auto">{roleRequests.filter((r:any) => r.status === 'PENDING').length}</span>}
            </button>
          ) : (
            <>
              <button onClick={() => setActiveTab('PORTAL')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'PORTAL' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
                <LayoutDashboard size={20} /><span>Meu Portal</span>
              </button>

              <button onClick={() => setActiveTab('SOLICITAR_PERFIL')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'SOLICITAR_PERFIL' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
                <UserPlus size={20} /><span>Solicitar Perfil</span>
              </button>

              {(currentUser?.permissoes || []).includes('ESCALANTE') && (
                <button onClick={() => setActiveTab('ESCALANTE')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'ESCALANTE' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
                  <Plus size={20} /><span>Escalas</span>
                </button>
              )}

              {escalas.some(e => (e.comandanteMatricula === currentUser.matricula || e.auxiliarMatricula === currentUser.matricula) && (e.status === 'em_edicao' || e.status === 'esclarecimento_solicitado')) && (
                <button onClick={() => setActiveTab('COMANDANTE')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'COMANDANTE' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
                  <ClipboardList size={20} /><span>Atestar Missões</span><span className="bg-red-500 text-white text-xs px-2 rounded-full">!</span>
                </button>
              )}

              {((currentUser?.permissoes || []).includes('APROVADOR') || currentUser?.matricula === 'administrador' || escalas.some(e => isUserHomologadorForEscala(e, currentUser))) && (
                <button onClick={() => setActiveTab('APROVADOR')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'APROVADOR' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
                  <ShieldCheck size={20} /><span className="flex-1 text-left">Homologação</span>
                  {escalas.some(e => e.status === 'atestado' && isUserHomologadorForEscala(e, currentUser)) && (
                    <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">!</span>
                  )}
                </button>
              )}

              {(currentUser?.permissoes || []).includes('PAGAMENTO') && (
                <button onClick={() => setActiveTab('PAGAMENTO')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'PAGAMENTO' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
                  <Banknote size={20} /><span>Lançamento</span>
                </button>
              )}
            </>
          )}
        </nav>
        
        <div className="p-4 border-t border-cbmpa-800 bg-cbmpa-950 space-y-2">
          {needsDriveAuth ? (
            <button onClick={handleDriveLogin} className="w-full flex justify-center items-center gap-2 bg-blue-600 text-white rounded px-3 py-2 text-xs font-bold hover:bg-blue-700 transition">
              Entrar no Google Drive
            </button>
          ) : (
            <div className="w-full flex justify-center items-center gap-2 bg-green-900/30 text-green-400 rounded px-3 py-2 text-xs font-bold">
              Drive Conectado
            </div>
          )}
          <button onClick={() => setCurrentUser(null)} className="w-full flex items-center justify-center gap-2 text-gray-400 hover:text-white transition-colors py-2">
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto h-screen relative bg-gray-100 dark:bg-gray-900">
        
        {/* --- VISÃO DE PAINÉIS DO DASHBOARD --- */}
        {activeTab !== 'EDITOR' && (
          <div className="p-6 max-w-6xl mx-auto space-y-6">
            
            {activeTab === 'PORTAL' && (
              <>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><User /> Minhas Escalas Cumpridas</h2>
                <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-xl border border-gray-200 dark:border-gray-750 mb-6 flex flex-col gap-4">
                  <div className="flex items-center gap-2 font-bold text-sm text-gray-700 dark:text-gray-300">
                    <Search size={16} className="text-cbmpa-700 dark:text-yellow-500" />
                    <span>Filtros de Pesquisa</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">Ano</label>
                      <select 
                        value={filterUserAno} 
                        onChange={(e) => setFilterUserAno(e.target.value)}
                        className="w-full p-2 text-xs border rounded-lg bg-white dark:bg-gray-850 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                      >
                        <option value="">Todos os anos</option>
                        <option value="2026">2026</option>
                        <option value="2025">2025</option>
                        <option value="2024">2024</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">Mês</label>
                      <select 
                        value={filterUserMes} 
                        onChange={(e) => setFilterUserMes(e.target.value)}
                        className="w-full p-2 text-xs border rounded-lg bg-white dark:bg-gray-850 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                      >
                        <option value="">Todos os meses</option>
                        <option value="01">Janeiro</option>
                        <option value="02">Fevereiro</option>
                        <option value="03">Março</option>
                        <option value="04">Abril</option>
                        <option value="05">Maio</option>
                        <option value="06">Junho</option>
                        <option value="07">Julho</option>
                        <option value="08">Agosto</option>
                        <option value="09">Setembro</option>
                        <option value="10">Outubro</option>
                        <option value="11">Novembro</option>
                        <option value="12">Dezembro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">Tipo de Serviço</label>
                      <select 
                        value={filterUserTipoServico} 
                        onChange={(e) => setFilterUserTipoServico(e.target.value)}
                        className="w-full p-2 text-xs border rounded-lg bg-white dark:bg-gray-850 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                      >
                        <option value="">Todos os serviços</option>
                        <option value="PREVENCAO">Prevenção</option>
                        <option value="DIVERSOS">Diversos</option>
                        <option value="SERVICO_OPERACIONAL">Serviço Operacional</option>
                      </select>
                    </div>
                  </div>
                  {(filterUserAno || filterUserMes || filterUserTipoServico) && (
                    <div className="flex justify-end">
                      <button 
                        onClick={() => {
                          setFilterUserAno('');
                          setFilterUserMes('');
                          setFilterUserTipoServico('');
                        }}
                        className="text-xs text-red-600 dark:text-red-400 font-bold hover:underline flex items-center gap-1"
                      >
                        Limpar Filtros
                      </button>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {(() => {
                    const filtered = escalas.filter(e => {
                      const isMyEscala = e.formData.costSheetItems.some((m:any) => m.soldierMatricula === currentUser.matricula) || e.comandanteMatricula === currentUser.matricula;
                      if (!isMyEscala) return false;
                      if (filterUserAno) {
                        const year = e.formData.eventDate ? e.formData.eventDate.split('-')[0] : '';
                        if (year !== filterUserAno) return false;
                      }
                      if (filterUserMes) {
                        const month = e.formData.eventDate ? e.formData.eventDate.split('-')[1] : '';
                        if (month !== filterUserMes) return false;
                      }
                      if (filterUserTipoServico) {
                        if (e.formData.serviceType !== filterUserTipoServico) return false;
                      }
                      return true;
                    });
                    
                    return (
                      <>
                        <StatDashboard title="Meu Resumo Financeiro" escalas={filtered} currentUserMatricula={currentUser.matricula} />
                        <div className="space-y-3">
                          {filtered.length === 0 ? (
                            <p className="text-gray-500 italic">Nenhuma escala encontrada para os filtros aplicados.</p>
                          ) : (
                            filtered.map(escala => {
                              const isCommanderOnly = !escala.formData.costSheetItems.some((m:any) => m.soldierMatricula === currentUser.matricula);
                              const myItem = escala.formData.costSheetItems.find((m:any) => m.soldierMatricula === currentUser.matricula);
                              return (
                              <div key={escala.id} className="p-4 border rounded-xl flex flex-col md:flex-row justify-between md:items-center bg-gray-50 dark:bg-gray-900/50 gap-4 transition hover:shadow-sm">
                        <div className="flex-1">
                          <div className="font-bold flex items-center gap-2 text-base text-cbmpa-900 dark:text-yellow-500">
                             {escala.formData.operationName || escala.formData.eventName}
                             {isCommanderOnly && <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 px-2.5 py-0.5 rounded text-[10px] uppercase font-bold">Comandante</span>}
                          </div>
                          <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                             <span><strong>Data:</strong> {formatAnyDate(escala.formData.eventDate)}</span>
                             <span><strong>Comandante:</strong> {escala.formData.issuerName}</span>
                             <span><strong>Local:</strong> {escala.formData.eventLocal || 'Não informado'}</span>
                          </div>
                          
                          {(escala.status === 'lancado' || escala.paymentLaunchLabel || escala.launchedAt) && (
                             <button 
                               onClick={() => setConsultingEscalaId(escala.id)}
                               className="mt-3 flex items-center gap-2 text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/60 px-3 py-2 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/40 transition w-full md:w-auto text-left"
                             >
                               <Banknote size={14} className="text-purple-600 dark:text-purple-400 shrink-0" />
                               <span>
                                 Último envio para pagamento: <strong>{escala.launchedAt || escala.paymentLaunchLabel || 'Confirmado'}</strong> (Clique para consultar)
                               </span>
                             </button>
                          )}
                        </div>
                        <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-2">
                            <div className="flex flex-col items-end gap-1">
                               {renderBadge(escala.status)}
                               {myItem && myItem.isLaunched && escala.status !== 'lancado' && (
                                  <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shadow-sm">
                                     Pagamento Lançado
                                  </span>
                               )}
                            </div>
                            <button 
                               onClick={() => setConsultingEscalaId(escala.id)} 
                               className="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 dark:bg-gray-750 dark:hover:bg-gray-700 dark:border-gray-600 rounded-lg text-xs font-bold shadow-sm transition"
                            >
                               Consultar
                            </button>
                        </div>
                      </div>
                      );
                            })
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>



              </div>
              </>
            )}

            {activeTab === 'SOLICITAR_PERFIL' && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-center mb-4 border-b pb-4 dark:border-gray-700">
                     <div>
                        <h2 className="text-2xl font-black text-gray-950 dark:text-white flex items-center gap-2">
                           <UserPlus className="text-cbmpa-700 dark:text-yellow-500" size={24} />
                           Solicitar Perfil de Acesso
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">Selecione o perfil de acesso desejado para solicitar autorização ao administrador do sistema.</p>
                     </div>
                     <button type="button" onClick={(e) => {
                        e.preventDefault();
                        const remaining = roleRequests.filter(r => String(r.matricula) !== String(currentUser.matricula));
                        setRoleRequests(remaining);
                        localStorage.setItem('ROLE_REQUESTS', JSON.stringify(remaining));
                     }} className="text-xs text-red-600 hover:text-red-800 underline font-bold">Limpar minhas solicitações</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                     <div className="border rounded-xl p-5 bg-gray-50/50 dark:bg-gray-900/20 flex flex-col justify-between">
                        <div>
                           <div className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 w-10 h-10 rounded-lg flex items-center justify-center mb-4"><Plus size={20}/></div>
                           <h3 className="font-bold text-base mb-1">Escalante</h3>
                           <p className="text-xs text-gray-500 leading-relaxed mb-4">Permite criar, editar e publicar escalas de serviço de militares do CBMPA para jornadas extraordinárias.</p>
                           
                           {!(currentUser?.permissoes || []).includes('ESCALANTE') && !roleRequests.some(r => r.matricula === currentUser.matricula && r.role === 'ESCALANTE' && r.status === 'PENDING') && (
                              <div className="mb-4">
                                 <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                                    Selecione a sua UBM:
                                 </label>
                                 <select 
                                    value={selectedUbmForRequest}
                                    onChange={(e) => setSelectedUbmForRequest(e.target.value)}
                                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-750 text-xs text-gray-950 dark:text-white"
                                 >
                                    {UBMS.map(ubm => (
                                       <option key={ubm} value={ubm}>{ubm}</option>
                                    ))}
                                 </select>
                              </div>
                           )}
                           
                           {(currentUser?.permissoes || []).includes('ESCALANTE') && currentUser?.ubmEscalante && (
                              <div className="mb-4 p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 rounded-lg text-xs font-bold">
                                 UBM Vinculada: {currentUser.ubmEscalante}
                              </div>
                           )}
                        </div>
                        <button 
                            onClick={() => requestRole('ESCALANTE', selectedUbmForRequest)} 
                            disabled={(currentUser?.permissoes || []).includes('ESCALANTE') || roleRequests.some(r => r.matricula === currentUser.matricula && r.role === 'ESCALANTE' && r.status === 'PENDING')}
                            className="w-full py-2.5 px-4 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-xs font-bold text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition">
                            {(currentUser?.permissoes || []).includes('ESCALANTE') ? `Escalante (Ativo em ${currentUser.ubmEscalante || 'Nenhum'})` : roleRequests.some(r => r.matricula === currentUser.matricula && r.role === 'ESCALANTE' && r.status === 'PENDING') ? 'Solicitação Pendente' : 'Solicitar Perfil'}
                        </button>
                     </div>

                     <div className="border rounded-xl p-5 bg-gray-50/50 dark:bg-gray-900/20 flex flex-col justify-between">
                        <div>
                           <div className="bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 w-10 h-10 rounded-lg flex items-center justify-center mb-4"><ShieldCheck size={20}/></div>
                           <h3 className="font-bold text-base mb-1">Homologador</h3>
                           <p className="text-xs text-gray-500 leading-relaxed mb-4">Permite analisar, deliberar e homologar os relatórios enviados pelos comandantes após a execução das jornadas.</p>
                        </div>
                        <button 
                            onClick={() => requestRole('APROVADOR')} 
                            disabled={(currentUser?.permissoes || []).includes('APROVADOR') || roleRequests.some(r => r.matricula === currentUser.matricula && r.role === 'APROVADOR' && r.status === 'PENDING')}
                            className="w-full py-2.5 px-4 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-xs font-bold text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition">
                            {(currentUser?.permissoes || []).includes('APROVADOR') ? 'Homologador (Ativo)' : roleRequests.some(r => r.matricula === currentUser.matricula && r.role === 'APROVADOR' && r.status === 'PENDING') ? 'Solicitação Pendente' : 'Solicitar Perfil'}
                        </button>
                     </div>

                     <div className="border rounded-xl p-5 bg-gray-50/50 dark:bg-gray-900/20 flex flex-col justify-between">
                        <div>
                           <div className="bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 w-10 h-10 rounded-lg flex items-center justify-center mb-4"><Banknote size={20}/></div>
                           <h3 className="font-bold text-base mb-1">Pagamento</h3>
                           <p className="text-xs text-gray-500 leading-relaxed mb-4">Permite realizar o processamento, conferência e lançamento financeiro de militares aptos a receber as indenizações.</p>
                        </div>
                        <button 
                            onClick={() => requestRole('PAGAMENTO')} 
                            disabled={(currentUser?.permissoes || []).includes('PAGAMENTO') || roleRequests.some(r => r.matricula === currentUser.matricula && r.role === 'PAGAMENTO' && r.status === 'PENDING')}
                            className="w-full py-2.5 px-4 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-xs font-bold text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition">
                            {(currentUser?.permissoes || []).includes('PAGAMENTO') ? 'Pagamento (Ativo)' : roleRequests.some(r => r.matricula === currentUser.matricula && r.role === 'PAGAMENTO' && r.status === 'PENDING') ? 'Solicitação Pendente' : 'Solicitar Perfil'}
                        </button>
                     </div>
                  </div>
              </div>
            )}

            {activeTab === 'ADMIN' && (() => {
              const allRegisteredUsersMap: Record<string, any> = {};
              MOCK_USERS.forEach(m => { allRegisteredUsersMap[m.matricula] = { ...m }; });
              Object.keys(customUsersDict).forEach(mat => {
                allRegisteredUsersMap[mat] = { ...allRegisteredUsersMap[mat], ...customUsersDict[mat] };
              });
              const allRegisteredUsers = Object.values(allRegisteredUsersMap);
              const filteredAllUsers = allRegisteredUsers.filter((u: any) => {
                if (!adminUserSearch.trim()) return true;
                const q = adminUserSearch.toLowerCase().trim();
                return (
                  (u.nome || '').toLowerCase().includes(q) ||
                  (u.matricula || '').toLowerCase().includes(q) ||
                  (u.email || '').toLowerCase().includes(q) ||
                  (u.posto || '').toLowerCase().includes(q)
                );
              });

              return (
                <div className="space-y-6">
                  <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                      <div>
                        <h2 className="text-2xl font-bold flex items-center gap-2 text-cbmpa-900 dark:text-white">
                          <User className="text-cbmpa-700 dark:text-yellow-500" /> Administração de Usuários
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Gerenciamento centralizado de solicitações pendentes, perfis de acesso ativos e exclusão de contas.
                        </p>
                      </div>
                      <button 
                        type="button" 
                        onClick={handleClearRequests} 
                        className="text-xs border border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 px-3 py-2 rounded-lg font-bold flex items-center gap-1.5 transition"
                      >
                        <Trash2 size={14} /> Limpar Solicitações
                      </button>
                    </div>

                    {/* SEÇÃO 1: SOLICITAÇÕES PENDENTES */}
                    <div className="mb-8">
                      <h3 className="text-lg font-bold mb-4 font-sans text-cbmpa-900 dark:text-white flex items-center gap-2">
                        <UserPlus size={18} className="text-yellow-500" /> Solicitações de Acesso Pendentes
                        {roleRequests.filter((r:any) => r.status === 'PENDING').length > 0 && (
                          <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                            {roleRequests.filter((r:any) => r.status === 'PENDING').length}
                          </span>
                        )}
                      </h3>
                      <div className="space-y-3">
                        {roleRequests.filter((r:any) => r.status === 'PENDING').map(req => (
                          <div key={req.id} className="p-4 border rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
                            <div>
                              <div className="font-bold text-gray-900 dark:text-white">{req.nome || 'Usuário'} (Mat: {req.matricula})</div>
                              <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                                Solicitou perfil: <span className="font-bold text-cbmpa-700 dark:text-yellow-500">{req.role}</span>
                                {req.ubm && <> para a UBM: <span className="font-bold text-blue-700 dark:text-blue-400">{req.ubm}</span></>}
                              </div>
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto justify-end">
                              <button onClick={() => handleApproveRole(req.id, false)} className="px-3 py-1.5 border border-red-500 text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 font-bold text-xs transition">Recusar</button>
                              <button onClick={() => handleApproveRole(req.id, true)} className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold text-xs transition">Aprovar</button>
                            </div>
                          </div>
                        ))}
                        {roleRequests.filter((r:any) => r.status === 'PENDING').length === 0 && (
                          <div className="p-4 border rounded-xl bg-gray-50 dark:bg-gray-900/30 text-gray-500 italic text-sm text-center">
                            Nenhuma solicitação pendente no momento.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* SEÇÃO 2: PERFIS DE ACESSO ATIVOS */}
                    <div className="mb-8 border-t pt-6 border-gray-200 dark:border-gray-700">
                      <h3 className="text-lg font-bold mb-4 font-sans text-cbmpa-900 dark:text-white flex items-center gap-2">
                        <ShieldCheck size={18} className="text-green-600" /> Perfis de Acesso Ativos
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {['ESCALANTE', 'APROVADOR', 'PAGAMENTO'].map(roleName => {
                          const usersWithRole = allRegisteredUsers.filter((u: any) => (u.permissoes || []).includes(roleName));
                          return (
                            <div key={roleName} className="border rounded-xl p-4 bg-gray-50/50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-700 flex flex-col justify-between">
                              <div>
                                <div className="font-bold text-cbmpa-900 dark:text-yellow-400 mb-3 flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                                  {roleName === 'ESCALANTE' ? <Plus size={16}/> : roleName === 'APROVADOR' ? <ShieldCheck size={16}/> : <Banknote size={16}/>}
                                  Perfil: {roleName} ({usersWithRole.length})
                                </div>
                                {usersWithRole.length === 0 ? (
                                  <p className="text-xs text-gray-500 italic py-2">Nenhum usuário com este perfil.</p>
                                ) : (
                                  <div className="space-y-3">
                                    {usersWithRole.map((u: any) => (
                                      <div key={u.matricula} className="flex flex-col gap-2 p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-750 text-xs">
                                        <div className="flex justify-between items-start">
                                          <div>
                                            <span className="font-bold text-gray-900 dark:text-white">{u.nome || u.matricula}</span>
                                            <div className="text-gray-500 text-[11px]">Matrícula: {u.matricula}</div>
                                            {roleName === 'ESCALANTE' && u.ubmEscalante && (
                                              <span className="inline-block mt-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 text-[10px] font-bold rounded">
                                                {u.ubmEscalante}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                                          <button 
                                            onClick={() => handleRemoveRole(u.matricula, roleName)} 
                                            className="flex-1 py-1 px-2 text-[11px] text-red-600 hover:text-red-700 border border-red-200 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/40 rounded-md font-bold transition text-center"
                                            title="Remover acesso a este perfil"
                                          >
                                            Remover Acesso
                                          </button>
                                          {u.matricula !== 'administrador' && (
                                            <button 
                                              onClick={() => handleDeleteUser(u.matricula)} 
                                              className="py-1 px-2 text-[11px] text-white bg-red-600 hover:bg-red-700 rounded-md font-bold transition text-center"
                                              title="Excluir o usuário completamente"
                                            >
                                              Excluir Usuário
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* SEÇÃO 3: TODOS OS USUÁRIOS CADASTRADOS */}
                    <div className="border-t pt-6 border-gray-200 dark:border-gray-700">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                        <h3 className="text-lg font-bold font-sans text-cbmpa-900 dark:text-white flex items-center gap-2">
                          <Users size={18} className="text-blue-600" /> Todos os Usuários Cadastrados ({allRegisteredUsers.length})
                        </h3>
                        <div className="relative w-full sm:w-64">
                          <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                          <input 
                            type="text" 
                            placeholder="Pesquisar por nome ou matrícula..." 
                            value={adminUserSearch}
                            onChange={(e) => setAdminUserSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 text-xs border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-cbmpa-700"
                          />
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                        <table className="w-full text-left text-xs text-gray-700 dark:text-gray-300">
                          <thead className="bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-bold uppercase text-[10px]">
                            <tr>
                              <th className="p-3">Usuário / Matrícula</th>
                              <th className="p-3">Posto / E-mail</th>
                              <th className="p-3">Perfis / Permissões</th>
                              <th className="p-3 text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                            {filteredAllUsers.map((u: any) => {
                              const permissoes = u.permissoes || [];
                              return (
                                <tr key={u.matricula} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition">
                                  <td className="p-3">
                                    <div className="font-bold text-gray-900 dark:text-white">{u.nome || 'Sem Nome'}</div>
                                    <div className="text-gray-500 text-[11px]">Matrícula: <span className="font-mono">{u.matricula}</span></div>
                                  </td>
                                  <td className="p-3">
                                    <div>{u.posto || 'Não informado'}</div>
                                    <div className="text-gray-400 text-[11px]">{u.email || 'Sem e-mail'}</div>
                                  </td>
                                  <td className="p-3">
                                    {permissoes.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {permissoes.map((p: string) => (
                                          <span key={p} className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 rounded font-bold text-[10px]">
                                            {p}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 italic text-[11px]">Sem perfis especiais</span>
                                    )}
                                  </td>
                                  <td className="p-3 text-right">
                                    <div className="flex justify-end gap-2">
                                      {u.matricula !== 'administrador' ? (
                                        <button 
                                          onClick={() => handleDeleteUser(u.matricula)}
                                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-xs transition flex items-center gap-1"
                                          title="Excluir este usuário do sistema"
                                        >
                                          <Trash2 size={13} /> Excluir Usuário
                                        </button>
                                      ) : (
                                        <span className="text-[10px] text-gray-400 italic px-2 py-1">Conta Administrador Padrão</span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {filteredAllUsers.length === 0 && (
                              <tr>
                                <td colSpan={4} className="p-4 text-center text-gray-500 italic">
                                  Nenhum usuário encontrado na busca.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {activeTab === 'ESCALANTE' && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold flex items-center gap-2"><Plus /> Gerenciamento de Escalas</h2>
                  <button onClick={handleCreateNewEscala} className="bg-cbmpa-700 hover:bg-cbmpa-800 text-white px-4 py-2 rounded-lg font-bold">Criar Nova Escala</button>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-xl border border-gray-200 dark:border-gray-750 mb-6 flex flex-col gap-4">
                  <div className="flex items-center gap-2 font-bold text-sm text-gray-700 dark:text-gray-300">
                    <Search size={16} className="text-cbmpa-700 dark:text-yellow-500" />
                    <span>Filtros de Pesquisa</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">Ano</label>
                      <select 
                        value={filterEscalanteAno} 
                        onChange={(e) => setFilterEscalanteAno(e.target.value)}
                        className="w-full p-2 text-xs border rounded-lg bg-white dark:bg-gray-850 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                      >
                        <option value="">Todos</option>
                        <option value="2026">2026</option>
                        <option value="2025">2025</option>
                        <option value="2024">2024</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">Mês</label>
                      <select 
                        value={filterEscalanteMes} 
                        onChange={(e) => setFilterEscalanteMes(e.target.value)}
                        className="w-full p-2 text-xs border rounded-lg bg-white dark:bg-gray-850 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                      >
                        <option value="">Todos</option>
                        <option value="01">Janeiro</option>
                        <option value="02">Fevereiro</option>
                        <option value="03">Março</option>
                        <option value="04">Abril</option>
                        <option value="05">Maio</option>
                        <option value="06">Junho</option>
                        <option value="07">Julho</option>
                        <option value="08">Agosto</option>
                        <option value="09">Setembro</option>
                        <option value="10">Outubro</option>
                        <option value="11">Novembro</option>
                        <option value="12">Dezembro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">Tipo de Serviço</label>
                      <select 
                        value={filterEscalanteTipoServico} 
                        onChange={(e) => setFilterEscalanteTipoServico(e.target.value)}
                        className="w-full p-2 text-xs border rounded-lg bg-white dark:bg-gray-850 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                      >
                        <option value="">Todos</option>
                        <option value="PREVENCAO">Prevenção</option>
                        <option value="DIVERSOS">Diversos</option>
                        <option value="SERVICO_OPERACIONAL">Serviço Operacional</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">Militar (Nome/Mat.)</label>
                      <input 
                        type="text" 
                        placeholder="Nome ou MF..." 
                        value={filterEscalanteMilitar} 
                        onChange={(e) => setFilterEscalanteMilitar(e.target.value)}
                        className="w-full p-2 text-xs border rounded-lg bg-white dark:bg-gray-850 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">UBM de Origem</label>
                      <select 
                        value={filterEscalanteUbm} 
                        onChange={(e) => setFilterEscalanteUbm(e.target.value)}
                        className="w-full p-2 text-xs border rounded-lg bg-white dark:bg-gray-850 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                      >
                        <option value="">Todas</option>
                        {UBMS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                  {(filterEscalanteAno || filterEscalanteMes || filterEscalanteTipoServico || filterEscalanteMilitar || filterEscalanteUbm) && (
                    <div className="flex justify-end">
                      <button 
                        onClick={() => {
                          setFilterEscalanteAno('');
                          setFilterEscalanteMes('');
                          setFilterEscalanteTipoServico('');
                          setFilterEscalanteMilitar('');
                          setFilterEscalanteUbm('');
                        }}
                        className="text-xs text-red-600 dark:text-red-400 font-bold hover:underline flex items-center gap-1"
                      >
                        Limpar Filtros
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Esclarecimentos Pendentes */}
                {(() => {
                   const pendingClarifications = escalas.flatMap(e => {
                     if (e.escalanteMatricula !== currentUser.matricula) return [];
                     const items = e.formData.reportEffectiveItems || [];
                     return items.filter((i: any) => i.clarificationStatus === 'SOLICITADO').map((i: any) => ({
                         escalaId: e.id,
                         operationName: e.formData.operationName,
                         item: i
                     }));
                   });

                   if (pendingClarifications.length > 0) {
                      return (
                         <div className="mb-8">
                             <h3 className="font-bold text-lg text-orange-600 border-b border-orange-200 pb-2 mb-4 dark:text-orange-400">Esclarecimentos Solicitados pelo Homologador</h3>
                             <div className="space-y-3">
                                 {pendingClarifications.map((pc, idx) => (
                                     <div key={idx} className="p-4 border rounded-lg bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800">
                                         <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <div className="font-bold text-orange-900 dark:text-orange-300">Missão: {pc.operationName}</div>
                                                <div className="text-sm font-bold text-gray-800 mt-1">
                                                    <span className="bg-orange-500 text-white px-2 py-0.5 rounded mr-2 text-xs">{pc.item.status === 'F' ? 'FALTA' : pc.item.status === 'A' ? 'ATRASO' : 'DISPENSA'}</span>
                                                    {pc.item.soldierRank} {pc.item.soldierName} (MF: {pc.item.soldierMf})
                                                </div>
                                            </div>
                                            <button onClick={() => updateClarificationStatus(pc.escalaId, pc.item.id, 'RESOLVIDO')} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold text-sm shadow-sm transition">
                                                Solicitado/Em Correção
                                            </button>
                                         </div>
                                         <p className="text-sm text-gray-600 mt-2">
                                             Tome as providências administrativas cabíveis (ex: contato com o militar, solicitar PA/PJD). Essa alteração ficará restrita ao seu controle e não será enviada ao aplicativo do militar.
                                         </p>
                                     </div>
                                 ))}
                             </div>
                         </div>
                      );
                   }
                   return null;
                })()}

                <h3 className="font-bold text-lg text-cbmpa-800 border-b pb-2 mb-4 dark:text-gray-300">Aguardando Execução</h3>
                <div className="space-y-3 mb-8">
                  {(() => {
                    const applyFilters = (e: any) => {
                      if (!(currentUser?.permissoes || []).includes('ADMIN')) {
                        const userUbm = currentUser.ubmEscalante || currentUser.ubm;
                        if (userUbm) {
                          if (e.ubm && e.ubm !== userUbm) return false;
                          if (!e.ubm && e.escalanteMatricula !== currentUser.matricula) return false;
                        } else {
                          if (e.escalanteMatricula !== currentUser.matricula) return false;
                        }
                      }
                      if (filterEscalanteAno) {
                        const year = e.formData.eventDate ? e.formData.eventDate.split('-')[0] : '';
                        if (year !== filterEscalanteAno) return false;
                      }
                      if (filterEscalanteMes) {
                        const month = e.formData.eventDate ? e.formData.eventDate.split('-')[1] : '';
                        if (month !== filterEscalanteMes) return false;
                      }
                      if (filterEscalanteTipoServico) {
                        if (e.formData.serviceType !== filterEscalanteTipoServico) return false;
                      }
                      if (filterEscalanteMilitar) {
                        const query = filterEscalanteMilitar.toLowerCase();
                        const matchItems = e.formData.costSheetItems?.some((i: any) => 
                           (i.soldierName || '').toLowerCase().includes(query) || 
                           (i.soldierMatricula || '').toLowerCase().includes(query)
                        ) || (e.formData.issuerName || '').toLowerCase().includes(query);
                        if (!matchItems) return false;
                      }
                      if (filterEscalanteUbm) {
                        const query = filterEscalanteUbm.toLowerCase();
                        const matchUbm = e.formData.costSheetItems?.some((i: any) => 
                           (i.soldierUbm || '').toLowerCase().includes(query)
                        ) || (e.formData.eventLocal || '').toLowerCase().includes(query);
                        if (!matchUbm) return false;
                      }
                      return true;
                    };

                    const filtered = escalas.filter(e => e.status === 'em_edicao' && applyFilters(e));
                    if (filtered.length === 0) {
                      return <p className="text-sm text-gray-500 italic">Nenhuma escala aguardando execução com os filtros aplicados.</p>;
                    }

                    return filtered.map(escala => {
                    const eventStart = new Date(`${escala.formData.eventDate}T${escala.formData.eventStartTime || '00:00'}`);
                    const isPassed = new Date() > eventStart;
                    return (
                      <div key={escala.id} className={`p-4 border rounded-lg flex justify-between items-center bg-yellow-50 dark:bg-yellow-900/10 cursor-pointer ${isPassed ? 'opacity-70' : 'hover:bg-yellow-100'}`} onClick={() => {
                        if (isPassed) {
                          alert("O evento já iniciou. A escala não pode mais ser editada.");
                          return;
                        }
                        handleOpenEscala(escala, DocumentType.COST_SHEET);
                      }}>
                        <div>
                          <div className="font-bold">{escala.formData.operationName || 'Sem Nome'}</div>
                          <div className="text-sm text-gray-700 dark:text-gray-400">Data: {escala.formData.eventDate} às {escala.formData.eventStartTime} {isPassed ? '(Iniciada)' : ''}</div>
                        </div>
                        {renderBadge(escala.status)}
                      </div>
                    );
                  });
                  })()} 
                </div>

                <h3 className="font-bold text-lg text-cbmpa-800 border-b pb-2 mb-4 dark:text-gray-300">Histórico de Escalas</h3>
                <div className="space-y-3">
                  {(() => {
                    const applyFilters = (e: any) => {
                      if (!(currentUser?.permissoes || []).includes('ADMIN')) {
                        const userUbm = currentUser.ubmEscalante || currentUser.ubm;
                        if (userUbm) {
                          if (e.ubm && e.ubm !== userUbm) return false;
                          if (!e.ubm && e.escalanteMatricula !== currentUser.matricula) return false;
                        } else {
                          if (e.escalanteMatricula !== currentUser.matricula) return false;
                        }
                      }
                      if (filterEscalanteAno) {
                        const year = e.formData.eventDate ? e.formData.eventDate.split('-')[0] : '';
                        if (year !== filterEscalanteAno) return false;
                      }
                      if (filterEscalanteMes) {
                        const month = e.formData.eventDate ? e.formData.eventDate.split('-')[1] : '';
                        if (month !== filterEscalanteMes) return false;
                      }
                      if (filterEscalanteTipoServico) {
                        if (e.formData.serviceType !== filterEscalanteTipoServico) return false;
                      }
                      if (filterEscalanteMilitar) {
                        const query = filterEscalanteMilitar.toLowerCase();
                        const matchItems = e.formData.costSheetItems?.some((i: any) => 
                           (i.soldierName || '').toLowerCase().includes(query) || 
                           (i.soldierMatricula || '').toLowerCase().includes(query)
                        ) || (e.formData.issuerName || '').toLowerCase().includes(query);
                        if (!matchItems) return false;
                      }
                      if (filterEscalanteUbm) {
                        const query = filterEscalanteUbm.toLowerCase();
                        const matchUbm = e.formData.costSheetItems?.some((i: any) => 
                           (i.soldierUbm || '').toLowerCase().includes(query)
                        ) || (e.formData.eventLocal || '').toLowerCase().includes(query);
                        if (!matchUbm) return false;
                      }
                      return true;
                    };

                    const filtered = escalas.filter(e => e.status !== 'em_edicao' && applyFilters(e));
                    if (filtered.length === 0) {
                      return <p className="text-sm text-gray-500 italic">Nenhuma escala no histórico para os filtros aplicados.</p>;
                    }

                    return filtered.map(escala => (
                    <div key={escala.id} className="p-4 border rounded-lg flex justify-between items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700" onClick={() => setConsultingEscalaId(escala.id)}>
                      <div>
                        <div className="font-bold text-cbmpa-900 dark:text-yellow-500">{escala.formData.operationName || 'Sem Nome'}</div>
                        <div className="text-xs text-gray-500">Data: {formatAnyDate(escala.formData.eventDate)} | Toque para consultar (Visualização)</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {renderBadge(escala.status)}
                        <span className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline">Consultar</span>
                      </div>
                    </div>
                  ));
                  })()}
                </div>
              </div>
            )}

            {activeTab === 'COMANDANTE' && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-6">
                  <h2 className="font-bold text-yellow-800 flex items-center gap-2"><AlertTriangle size={20}/> Missões Pendentes de Relatório</h2>
                  <p className="text-sm text-yellow-700">Você foi designado como Cmt ou Aux de Cmt. Preencha o relatório para enviar à homologação.</p>
                </div>
                <div className="space-y-3">
                  {escalas.filter(e => (e.comandanteMatricula === currentUser.matricula || e.auxiliarMatricula === currentUser.matricula) && (e.status === 'em_edicao' || e.status === 'esclarecimento_solicitado')).map(escala => {
                     const evDate = escala.formData.eventDate;
                     const evTime = escala.formData.eventStartTime;
                     let hasStarted = false;
                     if (evDate && evTime) {
                        const dt = new Date(evDate + 'T' + evTime);
                        if (!isNaN(dt.getTime()) && new Date() >= dt) hasStarted = true;
                     }

                     return (
                     <div key={escala.id} className="p-4 border rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-gray-900 gap-4">
                       <div className="flex-1">
                         <div className="font-bold text-lg flex items-center gap-2">
                            {escala.formData.operationName}
                            {escala.status === 'esclarecimento_solicitado' && <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded border border-red-200">DEVOLVIDO</span>}
                            {!hasStarted && <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2 py-0.5 rounded border border-amber-200 font-semibold">Aguardando Início</span>}
                         </div>
                         <div className="text-sm text-gray-500 mb-2">Local: {escala.formData.eventLocal} | Data: {formatAnyDate(escala.formData.eventDate)} às {escala.formData.eventStartTime || '08:00'}</div>
                         
                         {!hasStarted && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-950/20 p-2 rounded border border-amber-200 mt-2">
                              Nota: O preenchimento do relatório só será liberado após o horário de início da jornada ({escala.formData.eventStartTime || '08:00'}).
                            </p>
                         )}

                         {escala.status === 'esclarecimento_solicitado' && escala.motivoDevolucao && (
                            <div className="bg-orange-50 border border-orange-200 p-2 rounded text-sm text-orange-800 mt-2 text-justify">
                              <strong>Motivo da Devolução:</strong> {escala.motivoDevolucao}
                            </div>
                         )}
                       </div>
                       <div className="flex gap-2 self-end md:self-auto">
                          <button onClick={() => setDelegationModal({isOpen: true, escalaId: escala.id})} className="border border-orange-500 text-orange-600 px-4 py-2 rounded font-bold hover:bg-orange-50 whitespace-nowrap text-sm">Delegar Função</button>
                          {hasStarted ? (
                             <button onClick={() => handleOpenEscala(escala, DocumentType.REPORT)} className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700 whitespace-nowrap text-sm">{escala.status === 'esclarecimento_solicitado' ? 'Corrigir Relatório' : 'Preencher Relatório'}</button>
                          ) : (
                             <button disabled className="bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 px-4 py-2 rounded font-bold whitespace-nowrap cursor-not-allowed text-sm">Preencher Relatório</button>
                          )}
                       </div>
                     </div>
                     );
                  })}
                </div>

                {escalas.filter(e => (e.comandanteMatricula === currentUser.matricula || e.auxiliarMatricula === currentUser.matricula) && e.status === 'atestado').length > 0 && (
                  <div className="mt-8 space-y-3">
                    <h3 className="font-bold text-lg text-cbmpa-800 border-b pb-2 mb-4 dark:text-gray-300">Aguardando Homologação</h3>
                    {escalas.filter(e => (e.comandanteMatricula === currentUser.matricula || e.auxiliarMatricula === currentUser.matricula) && e.status === 'atestado').map(escala => (
                      <div key={escala.id} className="p-4 border rounded-lg flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                        <div>
                          <div className="font-bold text-lg flex items-center gap-2">
                             {escala.formData.operationName}
                             <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded border border-blue-200">ATESTADO</span>
                          </div>
                          <div className="text-sm text-gray-500 mb-2">Local: {escala.formData.eventLocal} | Data: {escala.formData.eventDate}</div>
                        </div>
                        <div className="flex gap-2">
                           <button onClick={() => handleOpenEscala(escala, DocumentType.REPORT)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 hover:bg-gray-100 rounded font-bold">Visualizar Documentos</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Modal de Delegação */}
            {delegationModal.isOpen && (
               <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-lg w-full max-w-md shadow-xl border border-gray-200 dark:border-gray-700">
                    <h3 className="text-xl font-bold mb-4 font-sans text-cbmpa-900 dark:text-white">Delegar Função</h3>
                    <p className="mb-4 text-gray-600 dark:text-gray-300">Escolha o militar para o qual deseja transferir sua função de Cmt ou Auxiliar para esta escala.</p>
                    <input 
                       type="text" 
                       placeholder="Buscar por nome ou matrícula..." 
                       value={delegationSearch} 
                       onChange={e => setDelegationSearch(e.target.value)} 
                       className="w-full p-2 border rounded mb-4 text-black"
                    />
                    <div className="max-h-48 overflow-y-auto mb-4 border rounded">
                       {state.personnelDb.filter(s => s.nome.toLowerCase().includes(delegationSearch.toLowerCase()) || s.matricula.includes(delegationSearch)).slice(0, 10).map(s => (
                          <div key={s.matricula} onClick={() => handleDelegateFunction(s)} className="p-2 border-b hover:bg-gray-100 cursor-pointer text-black">
                             {s.posto} {s.nome} - {s.matricula}
                          </div>
                       ))}
                       {delegationSearch.length >= 3 && state.personnelDb.filter(s => s.nome.toLowerCase().includes(delegationSearch.toLowerCase()) || s.matricula.includes(delegationSearch)).length === 0 && (
                          <div className="p-2 text-gray-500">Nenhum militar encontrado.</div>
                       )}
                    </div>
                    <div className="flex justify-end">
                       <button onClick={() => { setDelegationModal({isOpen: false, escalaId: null}); setDelegationSearch(''); }} className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-100 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600">Cancelar</button>
                    </div>
                 </div>
               </div>
            )}

            {activeTab === 'APROVADOR' && !viewingPdfEscalaId && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><ShieldCheck /> Painel do Homologador</h2>

                {/* FILTROS DE PESQUISA */}
                <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-xl border border-gray-200 dark:border-gray-750 mb-6 flex flex-col gap-4">
                  <div className="flex items-center gap-2 font-bold text-sm text-gray-700 dark:text-gray-300">
                    <Search size={16} className="text-cbmpa-700 dark:text-yellow-500" />
                    <span>Filtros de Pesquisa</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">Ano</label>
                      <select 
                        value={filterHomologadorAno} 
                        onChange={(e) => setFilterHomologadorAno(e.target.value)}
                        className="w-full p-2 text-xs border rounded-lg bg-white dark:bg-gray-850 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                      >
                        <option value="">Todos</option>
                        <option value="2026">2026</option>
                        <option value="2025">2025</option>
                        <option value="2024">2024</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">Mês</label>
                      <select 
                        value={filterHomologadorMes} 
                        onChange={(e) => setFilterHomologadorMes(e.target.value)}
                        className="w-full p-2 text-xs border rounded-lg bg-white dark:bg-gray-850 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                      >
                        <option value="">Todos</option>
                        <option value="01">Janeiro</option>
                        <option value="02">Fevereiro</option>
                        <option value="03">Março</option>
                        <option value="04">Abril</option>
                        <option value="05">Maio</option>
                        <option value="06">Junho</option>
                        <option value="07">Julho</option>
                        <option value="08">Agosto</option>
                        <option value="09">Setembro</option>
                        <option value="10">Outubro</option>
                        <option value="11">Novembro</option>
                        <option value="12">Dezembro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">Tipo de Serviço</label>
                      <select 
                        value={filterHomologadorTipoServico} 
                        onChange={(e) => setFilterHomologadorTipoServico(e.target.value)}
                        className="w-full p-2 text-xs border rounded-lg bg-white dark:bg-gray-850 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                      >
                        <option value="">Todos</option>
                        <option value="PREVENCAO">Prevenção</option>
                        <option value="DIVERSOS">Diversos</option>
                        <option value="SERVICO_OPERACIONAL">Serviço Operacional</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">Militar (Nome/Mat.)</label>
                      <input 
                        type="text" 
                        placeholder="Nome ou MF..." 
                        value={filterHomologadorMilitar} 
                        onChange={(e) => setFilterHomologadorMilitar(e.target.value)}
                        className="w-full p-2 text-xs border rounded-lg bg-white dark:bg-gray-850 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">UBM de Origem</label>
                      <select 
                        value={filterHomologadorUbmOrigem} 
                        onChange={(e) => setFilterHomologadorUbmOrigem(e.target.value)}
                        className="w-full p-2 text-xs border rounded-lg bg-white dark:bg-gray-850 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                      >
                        <option value="">Todas</option>
                        {UBMS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">Alt. Serviço?</label>
                      <select 
                        value={filterHomologadorAltServico} 
                        onChange={(e) => setFilterHomologadorAltServico(e.target.value)}
                        className="w-full p-2 text-xs border rounded-lg bg-white dark:bg-gray-850 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                      >
                        <option value="">Todos</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase">Alt. Efetivo?</label>
                      <select 
                        value={filterHomologadorAltEfetivo} 
                        onChange={(e) => setFilterHomologadorAltEfetivo(e.target.value)}
                        className="w-full p-2 text-xs border rounded-lg bg-white dark:bg-gray-850 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                      >
                        <option value="">Todos</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-2 border-t pt-3 border-gray-200 dark:border-gray-700">
                     <button
                        onClick={async () => {
                          const { generateRelatorioEstatisticoPDF } = await import('./utils/pdfEstatisticas');
                          
                          const applyHomologadorFilters = (e: any) => {
                              if (filterHomologadorAno) {
                                const year = e.formData.eventDate ? e.formData.eventDate.split('-')[0] : '';
                                if (year !== filterHomologadorAno) return false;
                              }
                              if (filterHomologadorMes) {
                                const month = e.formData.eventDate ? e.formData.eventDate.split('-')[1] : '';
                                if (month !== filterHomologadorMes) return false;
                              }
                              if (filterHomologadorTipoServico) {
                                if (e.formData.serviceType !== filterHomologadorTipoServico) return false;
                              }
                              if (filterHomologadorMilitar) {
                                const query = filterHomologadorMilitar.toLowerCase();
                                const matchItems = e.formData.costSheetItems?.some((i: any) => 
                                   (i.soldierName || '').toLowerCase().includes(query) || 
                                   (i.soldierMatricula || '').toLowerCase().includes(query)
                                ) || (e.formData.issuerName || '').toLowerCase().includes(query);
                                if (!matchItems) return false;
                              }
                              if (filterHomologadorUbmOrigem) {
                                const query = filterHomologadorUbmOrigem.toLowerCase();
                                const matchUbm = e.formData.costSheetItems?.some((i: any) => 
                                   (i.soldierUbm || '').toLowerCase().includes(query)
                                );
                                if (!matchUbm) return false;
                              }
                              if (filterHomologadorAltServico) {
                                const hasServiceAlteration = e.formData.reportEffectiveItems?.some((item: any) => {
                                   const original = e.formData.costSheetItems?.find((c: any) => c.soldierMatricula === item.soldierMf);
                                   return original && original.serviceType !== item.serviceType;
                                });
                                if (filterHomologadorAltServico === 'sim' && !hasServiceAlteration) return false;
                                if (filterHomologadorAltServico === 'nao' && hasServiceAlteration) return false;
                              }
                              if (filterHomologadorAltEfetivo) {
                                const hasEffectiveAlteration = (e.formData.reportEffectiveItems?.filter((m:any) => m.hasAlteration).length || 0) > 0 || (e.formData.effectiveAlterationJustification || '').trim().length > 0;
                                if (filterHomologadorAltEfetivo === 'sim' && !hasEffectiveAlteration) return false;
                                if (filterHomologadorAltEfetivo === 'nao' && hasEffectiveAlteration) return false;
                              }
                              return true;
                          };

                          const allHomologadorEscalas = escalas.filter(e => 
                             ['atestado', 'homologado', 'lancado', 'devolvido', 'esclarecimento_solicitado'].includes(e.status) &&
                             isUserHomologadorForEscala(e, currentUser)
                          ).filter(applyHomologadorFilters);

                          const filtersObj = {
                             ano: filterHomologadorAno,
                             mes: filterHomologadorMes,
                             tipoServico: filterHomologadorTipoServico,
                             militar: filterHomologadorMilitar,
                             ubmOrigem: filterHomologadorUbmOrigem,
                             altServico: filterHomologadorAltServico,
                             altEfetivo: filterHomologadorAltEfetivo
                          };

                          const url = generateRelatorioEstatisticoPDF(allHomologadorEscalas, currentUser, filtersObj);
                          window.open(url, '_blank');
                        }}
                        className="text-xs bg-cbmpa-700 hover:bg-cbmpa-800 text-white font-bold py-1.5 px-3 rounded flex items-center gap-1 shadow-sm transition"
                     >
                       <FileText size={14} /> Gerar Relatório Estatístico
                     </button>
                    {(filterHomologadorAno || filterHomologadorMes || filterHomologadorTipoServico || filterHomologadorMilitar || filterHomologadorUbmOrigem || filterHomologadorAltServico || filterHomologadorAltEfetivo) && (
                      <button 
                        onClick={() => {
                          setFilterHomologadorAno('');
                          setFilterHomologadorMes('');
                          setFilterHomologadorTipoServico('');
                          setFilterHomologadorMilitar('');
                          setFilterHomologadorUbmOrigem('');
                          setFilterHomologadorAltServico('');
                          setFilterHomologadorAltEfetivo('');
                        }}
                        className="text-xs text-red-600 dark:text-red-400 font-bold hover:underline flex items-center gap-1"
                      >
                        Limpar Filtros
                      </button>
                    )}
                  </div>
                </div>

                {/* FILA DE HOMOLOGAÇÃO */}
                  {(() => {
                    const applyFilters = (e: any) => {
                      if (filterHomologadorAno) {
                        const year = e.formData.eventDate ? e.formData.eventDate.split('-')[0] : '';
                        if (year !== filterHomologadorAno) return false;
                      }
                      if (filterHomologadorMes) {
                        const month = e.formData.eventDate ? e.formData.eventDate.split('-')[1] : '';
                        if (month !== filterHomologadorMes) return false;
                      }
                      if (filterHomologadorTipoServico) {
                        if (e.formData.serviceType !== filterHomologadorTipoServico) return false;
                      }
                      if (filterHomologadorMilitar) {
                        const query = filterHomologadorMilitar.toLowerCase();
                        const matchItems = e.formData.costSheetItems?.some((i: any) => 
                           (i.soldierName || '').toLowerCase().includes(query) || 
                           (i.soldierMatricula || '').toLowerCase().includes(query)
                        ) || (e.formData.issuerName || '').toLowerCase().includes(query);
                        if (!matchItems) return false;
                      }
                      if (filterHomologadorUbmOrigem) {
                        const query = filterHomologadorUbmOrigem.toLowerCase();
                        const matchUbm = e.formData.costSheetItems?.some((i: any) => 
                           (i.soldierUbm || '').toLowerCase().includes(query)
                        );
                        if (!matchUbm) return false;
                      }
                      if (filterHomologadorAltServico) {
                        const hasServiceAlteration = e.formData.reportEffectiveItems?.some((item: any) => {
                           const original = e.formData.costSheetItems?.find((c: any) => c.soldierMatricula === item.soldierMf);
                           return original && original.serviceType !== item.serviceType;
                        });
                        if (filterHomologadorAltServico === 'sim' && !hasServiceAlteration) return false;
                        if (filterHomologadorAltServico === 'nao' && hasServiceAlteration) return false;
                      }
                      if (filterHomologadorAltEfetivo) {
                        const hasEffectiveAlteration = e.formData.reportEffectiveItems?.some((item: any) => 
                           ['F', 'A', 'D'].includes(item.status)
                        );
                        if (filterHomologadorAltEfetivo === 'sim' && !hasEffectiveAlteration) return false;
                        if (filterHomologadorAltEfetivo === 'nao' && hasEffectiveAlteration) return false;
                      }
                      return true;
                    };

                    const pendingList = escalas.filter(e => e.status === 'atestado' && isUserHomologadorForEscala(e, currentUser) && applyFilters(e));
                    
                    const allHomologadorEscalas = escalas.filter(e => 
                       ['atestado', 'homologado', 'lancado', 'devolvido', 'esclarecimento_solicitado'].includes(e.status) &&
                       isUserHomologadorForEscala(e, currentUser)
                    ).filter(applyFilters);

                    return (
                      <>
                        <StatDashboard title="Painel Estatístico do Homologador" escalas={allHomologadorEscalas} />
                        
                        <h3 className="font-bold text-lg text-cbmpa-800 border-b pb-2 mb-4 mt-6 dark:text-gray-300 flex items-center gap-2">
                          <Flame size={18} className="text-orange-500 shrink-0" />
                          <span>Fila de Homologação (Aguardando Parecer)</span>
                        </h3>
                        <div className="space-y-3 mb-8">
                          {pendingList.length === 0 ? (
                            <p className="text-gray-500 italic text-sm">Nenhum processo pendente de homologação com os filtros aplicados.</p>
                          ) : (
                            pendingList.map(escala => (
                      <div key={escala.id} className="p-4 border rounded-xl flex flex-col md:flex-row justify-between md:items-center bg-gray-50 dark:bg-gray-900/50 gap-4 transition hover:shadow-sm">
                        <div className="flex-1">
                          <div className="font-bold text-lg text-cbmpa-900 dark:text-yellow-500">{escala.formData.operationName || escala.formData.eventName}</div>
                          <div className="text-sm text-gray-500 flex flex-wrap gap-x-4 gap-y-1 mt-1">
                            <span><strong>Cmt:</strong> {escala.formData.issuerName}</span>
                            <span><strong>Data:</strong> {formatAnyDate(escala.formData.eventDate)}</span>
                            {escala.formData.recipient && <span><strong>Destinatário:</strong> {escala.formData.recipient}</span>}
                          </div>
                          {escala.delegatedNome && (
                            <div className="mt-2 text-xs text-purple-800 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 rounded px-2.5 py-1 inline-flex items-center gap-1.5 font-medium">
                              <UserCheck size={14} className="shrink-0 text-purple-600" />
                              <span>Delegado para: <strong>{escala.delegatedNome}</strong> ({escala.delegatedAt || 'ativo'})</span>
                              <button 
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  handleRemoveDelegation(escala.id);
                                }} 
                                className="ml-2 text-red-600 dark:text-red-400 hover:underline font-bold text-[11px]"
                              >
                                Revogar
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 self-end md:self-auto">
                          <button 
                            onClick={() => setDelegationModal({ isOpen: true, escalaId: escala.id })} 
                            className="bg-purple-600 text-white px-4 py-2.5 rounded-lg font-bold hover:bg-purple-700 transition shadow-sm text-xs flex items-center gap-1.5"
                          >
                            <UserCheck size={15} />
                            <span>{escala.delegatedNome ? 'Alterar Delegação' : 'Delegar Função'}</span>
                          </button>
                          <button onClick={() => handleViewPdf(escala)} className="bg-cbmpa-700 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-cbmpa-800 transition shadow-sm text-xs whitespace-nowrap">
                            Analisar Processo em PDF
                          </button>
                        </div>
                      </div>
                            ))
                          )}
                        </div>

                        {/* Modal de Delegação de Função */}
                        {delegationModal.isOpen && (
                          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                            <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl border dark:border-gray-700 space-y-4">
                              <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
                                <h3 className="font-bold text-lg text-cbmpa-900 dark:text-yellow-500 flex items-center gap-2">
                                  <UserCheck size={20} className="text-purple-600" />
                                  <span>Delegar Função de Homologação</span>
                                </h3>
                                <button onClick={() => setDelegationModal({ isOpen: false, escalaId: null })} className="text-gray-400 hover:text-gray-600">
                                  <X size={20} />
                                </button>
                              </div>

                              <p className="text-sm text-gray-600 dark:text-gray-300">
                                Selecione o militar que receberá autorização para analisar e aprovar a execução deste serviço em seu nome.
                              </p>

                              <div className="relative space-y-2">
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">BUSCAR MILITAR</label>
                                <input 
                                  type="text" 
                                  className="w-full p-2.5 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm" 
                                  placeholder="Matrícula ou Nome do militar..." 
                                  value={delegationSearch} 
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setDelegationSearch(val);
                                    if (val.length >= 2) {
                                      setDelegationSuggestions(filterSoldiers(val));
                                    } else {
                                      setDelegationSuggestions([]);
                                    }
                                  }} 
                                />

                                {delegationSuggestions.length > 0 && (
                                  <ul className="bg-white dark:bg-gray-800 border rounded-lg shadow-lg max-h-48 overflow-auto text-sm divide-y dark:divide-gray-700">
                                    {delegationSuggestions.map(s => (
                                      <li 
                                        key={s.matricula} 
                                        onClick={() => handleDelegateHomologacaoFunction(delegationModal.escalaId!, s)} 
                                        className="p-2.5 hover:bg-purple-50 dark:hover:bg-gray-700 cursor-pointer flex justify-between items-center"
                                      >
                                        <div>
                                          <div className="font-bold text-cbmpa-900 dark:text-gray-200">{s.posto ? s.posto.toUpperCase() + ' ' : ''}{s.nome}</div>
                                          <div className="text-xs text-gray-500">Matrícula: {s.matricula} • UBM: {s.ubm || 'CBMPA'}</div>
                                        </div>
                                        <ChevronRight size={16} className="text-purple-600" />
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>

                              <div className="flex justify-end gap-2 pt-2 border-t dark:border-gray-700">
                                <button 
                                  onClick={() => setDelegationModal({ isOpen: false, escalaId: null })} 
                                  className="px-4 py-2 border rounded-lg text-sm font-semibold hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}

                {/* HISTÓRICO DE HOMOLOGAÇÕES */}
                <h3 className="font-bold text-lg text-cbmpa-800 border-b pb-2 mb-4 dark:text-gray-300 flex items-center gap-2">
                  <History size={18} className="text-cbmpa-700 dark:text-yellow-500 shrink-0" />
                  <span>Histórico de Homologações (Consultar Pareceres)</span>
                </h3>
                <div className="space-y-3">
                  {(() => {
                    const applyFilters = (e: any) => {
                      if (filterHomologadorAno) {
                        const year = e.formData.eventDate ? e.formData.eventDate.split('-')[0] : '';
                        if (year !== filterHomologadorAno) return false;
                      }
                      if (filterHomologadorMes) {
                        const month = e.formData.eventDate ? e.formData.eventDate.split('-')[1] : '';
                        if (month !== filterHomologadorMes) return false;
                      }
                      if (filterHomologadorTipoServico) {
                        if (e.formData.serviceType !== filterHomologadorTipoServico) return false;
                      }
                      if (filterHomologadorMilitar) {
                        const query = filterHomologadorMilitar.toLowerCase();
                        const matchItems = e.formData.costSheetItems?.some((i: any) => 
                           (i.soldierName || '').toLowerCase().includes(query) || 
                           (i.soldierMatricula || '').toLowerCase().includes(query)
                        ) || (e.formData.issuerName || '').toLowerCase().includes(query);
                        if (!matchItems) return false;
                      }
                      if (filterHomologadorUbmOrigem) {
                        const query = filterHomologadorUbmOrigem.toLowerCase();
                        const matchUbm = e.formData.costSheetItems?.some((i: any) => 
                           (i.soldierUbm || '').toLowerCase().includes(query)
                        );
                        if (!matchUbm) return false;
                      }
                      if (filterHomologadorAltServico) {
                        const hasServiceAlteration = e.formData.reportEffectiveItems?.some((item: any) => {
                           const original = e.formData.costSheetItems?.find((c: any) => c.soldierMatricula === item.soldierMf);
                           return original && original.serviceType !== item.serviceType;
                        });
                        if (filterHomologadorAltServico === 'sim' && !hasServiceAlteration) return false;
                        if (filterHomologadorAltServico === 'nao' && hasServiceAlteration) return false;
                      }
                      if (filterHomologadorAltEfetivo) {
                        const hasEffectiveAlteration = e.formData.reportEffectiveItems?.some((item: any) => 
                           ['F', 'A', 'D'].includes(item.status)
                        );
                        if (filterHomologadorAltEfetivo === 'sim' && !hasEffectiveAlteration) return false;
                        if (filterHomologadorAltEfetivo === 'nao' && hasEffectiveAlteration) return false;
                      }
                      return true;
                    };

                    const historyList = escalas.filter(e => ['homologado', 'lancado', 'devolvido', 'esclarecimento_solicitado'].includes(e.status) && isUserHomologadorForEscala(e, currentUser) && applyFilters(e));
                    
                    if (historyList.length === 0) {
                      return <p className="text-gray-500 italic text-sm">Nenhuma homologação anterior encontrada para os filtros aplicados.</p>;
                    }

                    return historyList.map(escala => (
                      <div key={escala.id} className="p-4 border rounded-xl flex flex-col md:flex-row justify-between md:items-center bg-gray-50 dark:bg-gray-900/50 gap-4 transition hover:shadow-sm">
                        <div className="flex-1">
                          <div className="font-bold text-cbmpa-900 dark:text-yellow-500 flex items-center gap-2">
                            {escala.formData.operationName || escala.formData.eventName}
                          </div>
                          <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1 mt-1">
                            <span><strong>Cmt:</strong> {escala.formData.issuerName}</span>
                            <span><strong>Data:</strong> {formatAnyDate(escala.formData.eventDate)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 self-end md:self-auto">
                          {renderBadge(escala.status)}
                          <button onClick={() => setConsultingEscalaId(escala.id)} className="px-4 py-2 bg-white hover:bg-gray-100 border border-gray-300 dark:bg-gray-750 dark:hover:bg-gray-700 dark:border-gray-600 rounded-lg text-xs font-bold shadow-sm transition whitespace-nowrap">
                            Consultar Parecer
                          </button>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {activeTab === 'APROVADOR' && viewingPdfEscalaId && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                {(() => {
                  const escala = escalas.find(e => e.id === viewingPdfEscalaId);
                  if (!escala) return null;
                  const formattedDate = escala.formData.eventDate ? formatAnyDate(escala.formData.eventDate) : 'N/A';
                  return (
                    <div className="space-y-6">
                      {/* Header block */}
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-200 dark:border-gray-700 pb-4 mb-6">
                        <div>
                          <span className="text-xs font-bold text-cbmpa-700 dark:text-yellow-500 uppercase tracking-widest block mb-1">Processo de Escala e Relatório Final</span>
                          <h2 className="text-2xl font-black font-sans text-gray-900 dark:text-white flex items-center gap-2">
                            <ShieldCheck className="text-cbmpa-700 dark:text-yellow-500" size={28} />
                            Análise para Homologação
                          </h2>
                        </div>
                        <div className="flex items-center gap-2 w-full md:w-auto">
                          <button 
                            onClick={closePdfView} 
                            className="flex-grow md:flex-none justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-bold text-sm transition shadow-sm flex items-center gap-1.5"
                          >
                            Voltar
                          </button>
                          <button 
                            onClick={() => setReturnModal({isOpen: true, escalaId: viewingPdfEscalaId})} 
                            className="flex-grow md:flex-none justify-center border border-orange-500 text-orange-600 dark:text-orange-400 px-4 py-2 rounded-lg font-bold text-sm hover:bg-orange-50 dark:hover:bg-orange-950/10 transition shadow-sm flex items-center gap-1.5"
                          >
                            Devolver (Corrigir)
                          </button>
                          <button 
                            onClick={() => handleApproveEscala(viewingPdfEscalaId)} 
                            className="flex-grow md:flex-none justify-center bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg font-bold text-sm transition shadow-sm flex items-center gap-1.5"
                          >
                            Aprovar (Homologar)
                          </button>
                        </div>
                      </div>

                      {/* Texto do Memorando no cabeçalho da tela */}
                      <div className="bg-amber-50/40 dark:bg-amber-950/10 border-l-4 border-amber-500 p-5 rounded-r-xl shadow-sm mb-6">
                        <span className="text-xs font-bold text-amber-700 dark:text-yellow-500 uppercase tracking-widest block mb-2">Texto do Memorando (Ofício de Solicitação)</span>
                        <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed italic text-justify">
                          {(() => {
                            const dataStr = escala.formData.memoEventDates || (escala.formData.eventDate ? formatAnyDate(escala.formData.eventDate) : '________');
                            const nsStr = escala.formData.memoNsNum && escala.formData.memoNsYear ? `${escala.formData.memoNsNum}/${escala.formData.memoNsYear}` : (escala.formData.memoNs || '_____');
                            const bgStr = escala.formData.memoBgNum && escala.formData.memoBgYear ? `${escala.formData.memoBgNum}/${escala.formData.memoBgYear}` : (escala.formData.memoBg || '_____');
                            return MEMO_LEGAL_TEXT
                              .replace('{{DATA}}', dataStr)
                              .replace('{{NS}}', nsStr)
                              .replace('{{BG}}', bgStr);
                          })()}
                        </p>
                      </div>

                      {/* 1. Metadata Grid Card */}
                      <div className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800/80 p-5 rounded-xl border border-gray-200 dark:border-gray-700 grid grid-cols-1 md:grid-cols-3 gap-6 shadow-sm mb-6">
                        <div>
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Nome do Evento / Serviço</span>
                          <h3 className="font-extrabold text-lg text-red-700 dark:text-red-400 uppercase tracking-tight">
                            {escala.formData.operationName || escala.formData.eventName || 'Sem Nome'}
                          </h3>
                        </div>
                        <div>
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Local de Execução</span>
                          <span className="font-semibold text-gray-800 dark:text-gray-200">
                            {escala.formData.eventLocal || 'Não informado'}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Data do Serviço</span>
                          <span className="font-semibold text-gray-800 dark:text-gray-200">
                            {formattedDate}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Horário de Ativação</span>
                          <span className="font-semibold text-gray-800 dark:text-gray-200">
                            {escala.formData.eventStartTime || '08:00'} às {escala.formData.eventEndTime || '17:00'}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">UBM de Origem</span>
                          <span className="font-semibold text-gray-800 dark:text-gray-200">
                            {escala.formData.ubmOrigem || escala.formData.issuerUbm || 'COP'}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Total de Militares Escalados</span>
                          <span className="font-semibold text-gray-800 dark:text-gray-200">
                            {(escala.formData.costSheetItems || []).length} militares
                          </span>
                        </div>
                      </div>



                      {/* RELATÓRIO DO COMANDANTE (CAMPOS IMUTÁVEIS) */}
                      <div className="border-t pt-6 mt-8 space-y-6">
                        <div className="flex items-center gap-2 mb-4">
                          <ClipboardList size={22} className="text-cbmpa-700 dark:text-yellow-500" />
                          <h3 className="text-lg font-black text-gray-800 dark:text-gray-100 uppercase tracking-wide">
                            Relatório do Comandante (Campos Imutáveis para Análise)
                          </h3>
                        </div>

                        {/* 1. Referências Oficiais */}
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                          <h4 className="font-bold text-cbmpa-800 dark:text-yellow-500 text-sm border-b pb-2 mb-3">1. Referências Oficiais</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div>
                              <span className="font-bold block text-gray-500 mb-1">REFERÊNCIA (NS):</span>
                              <div className="p-2.5 border rounded bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-medium">
                                {escala.formData.memoNsNum && escala.formData.memoNsYear ? `Nota de Serviço nº ${escala.formData.memoNsNum}/${escala.formData.memoNsYear} - SEOP/COP` : (escala.formData.memoNs || 'Não informado')}
                              </div>
                            </div>
                            <div>
                              <span className="font-bold block text-gray-500 mb-1">PUBLICADO EM BG:</span>
                              <div className="p-2.5 border rounded bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-medium">
                                {escala.formData.memoBgNum && escala.formData.memoBgYear ? `Boletim Geral nº ${escala.formData.memoBgNum}/${escala.formData.memoBgYear}` : (escala.formData.memoBg || 'Não informado')}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 2. Alterações no Efetivo / Controle de Presença */}
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                          <h4 className="font-bold text-cbmpa-800 dark:text-yellow-500 text-sm border-b pb-2 mb-3">2. Alterações no Efetivo / Controle de Presença</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-50 dark:bg-gray-900 text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">
                                <tr>
                                  <th className="p-2 text-left">Militar</th>
                                  <th className="p-2 text-center">Frequência/Situação</th>
                                  <th className="p-2 text-left">Função</th>
                                  <th className="p-2 text-left">Informações Adicionais / Comprovantes</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {(() => {
                                  const roster = escala.formData.reportEffectiveItems || escala.formData.costSheetItems || [];
                                  if (roster.length === 0) {
                                    return (
                                      <tr>
                                        <td colSpan={4} className="p-4 text-center text-gray-500 italic">Nenhum militar cadastrado nesta escala.</td>
                                      </tr>
                                    );
                                  }
                                  return roster.map((item: any, idx: number) => {
                                    const posto = item.soldierRank || item.posto || '';
                                    const nome = item.soldierName || item.nome || '';
                                    const funcao = item.role || item.funcao || 'Prevenção';
                                    const status = item.status || 'P';

                                    let statusBadge = <span className="px-2 py-0.5 rounded text-[10px] font-black bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400">● PRESENTE</span>;
                                    if (status === 'F') statusBadge = <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400 animate-pulse">● FALTA</span>;
                                    if (status === 'D') statusBadge = <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400">● DISPENSA</span>;
                                    if (status === 'A') statusBadge = <span className="px-2 py-0.5 rounded text-[10px] font-black bg-orange-100 text-orange-800 dark:bg-orange-950/30 dark:text-orange-400">● ATRASO</span>;
                                    if (status === 'P/A') statusBadge = <span className="px-2 py-0.5 rounded text-[10px] font-black bg-yellow-100 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400">● PERMUTA</span>;

                                    return (
                                      <tr key={item.id || idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/40 transition">
                                        <td className="p-2 font-semibold text-gray-800 dark:text-gray-200">{posto} {nome}</td>
                                        <td className="p-2 text-center">{statusBadge}</td>
                                        <td className="p-2 text-gray-600 dark:text-gray-400">{funcao}</td>
                                        <td className="p-2 text-xs">
                                          {status === 'P/A' && (
                                            <div className="space-y-1">
                                              <div><b>Substituto:</b> {item.substituteName || 'Não informado'}</div>
                                              {item.substituteAttachment && (
                                                <button
                                                  onClick={() => openDocumentInNewTab(`ATT-SUB-${item.id}`, escala)}
                                                  className="text-[11px] text-blue-600 hover:underline font-bold flex items-center gap-1 bg-gray-50 dark:bg-gray-700 dark:text-white px-2 py-0.5 rounded border border-gray-200 dark:border-gray-600"
                                                >
                                                  <ExternalLink size={10} /> Ver Documento Anexado
                                                </button>
                                              )}
                                            </div>
                                          )}
                                          {status === 'D' && (
                                            <div className="space-y-1">
                                              <div><b>Dispensa:</b> {item.dispensaReason || 'Não informada'}</div>
                                              {item.dispensaAttachment && (
                                                <button
                                                  onClick={() => openDocumentInNewTab(`ATT-DISP-${item.id}`, escala)}
                                                  className="text-[11px] text-blue-600 hover:underline font-bold flex items-center gap-1 bg-gray-50 dark:bg-gray-700 dark:text-white px-2 py-0.5 rounded border border-gray-200 dark:border-gray-600"
                                                >
                                                  <ExternalLink size={10} /> Ver Comprovante Anexado
                                                </button>
                                              )}
                                            </div>
                                          )}
                                          {status === 'F' && (
                                            <div><b>Motivo:</b> {item.faltaJustification || 'Não informada'}</div>
                                          )}
                                          {status === 'A' && (
                                            <div><b>Justificativa:</b> {item.atrasoJustification || 'Não informada'}</div>
                                          )}
                                          {status === 'P' && <span className="text-gray-400">-</span>}
                                        </td>
                                      </tr>
                                    );
                                  });
                                })()}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* 3. Alterações no Serviço (Vítimas/Ocorrências) */}
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                          <h4 className="font-bold text-cbmpa-800 dark:text-yellow-500 text-sm border-b pb-2 mb-3">3. Alterações no Serviço (Vítimas / Ocorrências)</h4>
                          {(() => {
                            const occurrences = escala.formData.reportServiceItems || [];
                            if (occurrences.length === 0) {
                              return <p className="text-xs text-gray-500 italic">Nenhuma ocorrência ou vítima registrada durante o serviço.</p>;
                            }
                            return (
                              <div className="space-y-3">
                                {occurrences.map((occ: any, i: number) => (
                                  <div key={occ.id} className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-900/40 text-xs">
                                    <div className="font-semibold text-[10px] text-gray-500 mb-1 uppercase">Registro #{i+1}</div>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-gray-700 dark:text-gray-300">
                                      <div><b>Nome/Vítima:</b> {occ.name || 'N/A'}</div>
                                      <div><b>Idade:</b> {occ.age || 'N/A'}</div>
                                      <div><b>Sexo:</b> {occ.sex || 'N/A'}</div>
                                      <div><b>Código:</b> {occ.code || 'N/A'}</div>
                                      <div className="md:col-span-4 mt-1 border-t pt-1">
                                        <b>Condição física/Descrição:</b> <span className="text-gray-600 dark:text-gray-400">{occ.condition || 'Sem detalhes'}</span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>

                        {/* 4. Apoio Logístico */}
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                          <h4 className="font-bold text-cbmpa-800 dark:text-yellow-500 text-sm border-b pb-2 mb-3">4. Apoio Logístico</h4>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {(() => {
                              const logistics = escala.formData.reportLogistics || {};
                              const usedItems = Object.keys(logistics).filter(k => logistics[k]?.used);
                              if (usedItems.length === 0 && !escala.formData.reportOtherLogistics) {
                                return <p className="text-xs text-gray-500 italic col-span-full">Nenhum material logístico informado.</p>;
                              }
                              return (
                                <>
                                  {usedItems.map(item => (
                                    <div key={item} className="p-2 border rounded bg-gray-50 dark:bg-gray-900 text-xs flex justify-between items-center">
                                      <span className="font-semibold text-gray-700 dark:text-gray-300">{item}</span>
                                      <span className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-1.5 py-0.5 rounded font-black">{logistics[item]?.qty || 0}</span>
                                    </div>
                                  ))}
                                  {escala.formData.reportOtherLogistics && (
                                    <div className="col-span-full mt-2 p-2.5 border rounded bg-gray-50 dark:bg-gray-900 text-xs">
                                      <b>Outros Materiais:</b> <span className="text-gray-600 dark:text-gray-400">{escala.formData.reportOtherLogistics}</span>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        {/* 5. Viaturas e Embarcações */}
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                          <h4 className="font-bold text-cbmpa-800 dark:text-yellow-500 text-sm border-b pb-2 mb-3">5. Viaturas e Embarcações</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {(() => {
                              const vehicles = escala.formData.reportVehicles || {};
                              const usedVehicles = Object.keys(vehicles).filter(k => vehicles[k]?.used);
                              if (usedVehicles.length === 0 && !escala.formData.reportOtherVehicles) {
                                return <p className="text-xs text-gray-500 italic col-span-full">Nenhuma viatura ou embarcação informada.</p>;
                              }
                              return (
                                <>
                                  {usedVehicles.map(item => (
                                    <div key={item} className="p-2.5 border rounded bg-gray-50 dark:bg-gray-900 text-xs">
                                      <div className="font-bold text-gray-800 dark:text-gray-200">{item}</div>
                                      <div className="mt-1 text-gray-500 flex justify-between">
                                        <span>Qtd: <b>{vehicles[item]?.qty || 0}</b></span>
                                        <span>Origem: <b>{vehicles[item]?.origin || 'N/A'}</b></span>
                                      </div>
                                    </div>
                                  ))}
                                  {escala.formData.reportOtherVehicles && (
                                    <div className="col-span-full mt-2 p-2.5 border rounded bg-gray-50 dark:bg-gray-900 text-xs">
                                      <b>Outros Veículos:</b> <span className="text-gray-600 dark:text-gray-400">{escala.formData.reportOtherVehicles}</span>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        {/* 6. Considerações do Serviço */}
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                          <h4 className="font-bold text-cbmpa-800 dark:text-yellow-500 text-sm border-b pb-2 mb-3">6. Considerações do Serviço</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div>
                              <b>PONTOS POSITIVOS:</b>
                              <div className="p-2.5 border rounded bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 mt-1">
                                <span className={`font-bold uppercase ${escala.formData.reportPositive?.has ? 'text-green-600 font-black' : 'text-red-500 font-black'}`}>{escala.formData.reportPositive?.has ? 'SIM' : 'NÃO'}</span>
                                {escala.formData.reportPositive?.has && escala.formData.reportPositive?.text && <p className="mt-1">{escala.formData.reportPositive.text}</p>}
                              </div>
                            </div>
                            <div>
                              <b>PONTOS NEGATIVOS:</b>
                              <div className="p-2.5 border rounded bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 mt-1">
                                <span className={`font-bold uppercase ${escala.formData.reportNegative?.has ? 'text-red-500 font-black' : 'text-green-600'}`}>{escala.formData.reportNegative?.has ? 'SIM' : 'NÃO'}</span>
                                {escala.formData.reportNegative?.has && escala.formData.reportNegative?.text && <p className="mt-1">{escala.formData.reportNegative.text}</p>}
                              </div>
                            </div>
                            <div className="md:col-span-2">
                              <b>QUADRO DE ATIVIDADES SERVIÇO:</b>
                              <div className="p-2.5 border rounded bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">
                                {escala.formData.reportActivities || 'Nenhum detalhe fornecido.'}
                              </div>
                            </div>
                            <div>
                              <b>SERVIÇOS DE PREVENTIVO DE ORIENTAÇÃO E ADVERTÊNCIA:</b>
                              <div className="p-2 border rounded bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 mt-1">
                                {escala.formData.reportGuidance || 'HOUVE'}
                              </div>
                            </div>
                            <div>
                              <b>DISTRIBUIÇÃO DO EFETIVO:</b>
                              <div className="p-2 border rounded bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 mt-1">
                                {escala.formData.reportDistribution || 'CONFORME NECESSIDADE'}
                              </div>
                            </div>
                            <div className="md:col-span-2">
                              <b>SUGESTÕES:</b>
                              <div className="p-2 border rounded bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 mt-1">
                                {escala.formData.reportSuggestions || 'NADA A DECLARAR'}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Considerações Finais e Fotos */}
                        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                          <h4 className="font-bold text-cbmpa-800 dark:text-yellow-500 text-sm border-b pb-2 mb-3">Considerações Finais e Fotos</h4>
                          <div className="space-y-4 text-xs">
                            <div>
                              <b>CONSIDERAÇÕES FINAIS:</b>
                              <div className="p-2.5 border rounded bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">
                                {escala.formData.reportFinalConsiderations || 'Nenhuma consideração final registrada.'}
                              </div>
                            </div>

                            {escala.formData.reportPhotos && escala.formData.reportPhotos.filter((p: any) => p).length > 0 && (
                              <div>
                                <b>REGISTROS FOTOGRÁFICOS:</b>
                                <div className="grid grid-cols-2 gap-4 mt-2">
                                  {escala.formData.reportPhotos.filter((p: any) => p).map((photo: string, index: number) => (
                                    <div key={index} className="border p-1.5 rounded bg-gray-50 dark:bg-gray-900 flex flex-col items-center">
                                      <img src={photo} alt={`Foto do serviço ${index + 1}`} referrerPolicy="no-referrer" className="w-full h-48 object-cover rounded shadow-sm" />
                                      <span className="text-[10px] text-gray-400 mt-1.5 uppercase font-semibold">Foto #{index + 1}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Botões de Geração de Documentos e Anexos no Final */}
                      <div className="bg-gray-50 dark:bg-gray-900/40 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mt-8 animate-fade-in">
                        <h3 className="font-bold text-sm text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2 border-b pb-1.5 uppercase tracking-wider">
                          <Download size={16} className="text-cbmpa-700 dark:text-yellow-500" />
                          Documentos e Anexos para Visualização
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                          <button
                            onClick={() => openDocumentInNewTab('MEMO', escala)}
                            className="flex items-center justify-between px-3 py-2 rounded-lg border border-red-200 bg-red-50/40 hover:bg-red-50 text-red-700 dark:bg-red-950/10 dark:border-red-900/30 dark:text-red-400 font-semibold text-xs transition shadow-sm"
                          >
                            <span>1. PDF do Memorando</span>
                            <ExternalLink size={12} />
                          </button>
                          <button
                            onClick={() => openDocumentInNewTab('ESCALA', escala)}
                            className="flex items-center justify-between px-3 py-2 rounded-lg border border-amber-200 bg-amber-50/40 hover:bg-amber-50 text-amber-700 dark:bg-amber-950/10 dark:border-amber-900/30 dark:text-amber-400 font-semibold text-xs transition shadow-sm"
                          >
                            <span>2. PDF da Escala</span>
                            <ExternalLink size={12} />
                          </button>
                          {(() => {
                            const isAvailable = ['atestado', 'homologado', 'lancado'].includes(escala.status);
                            return (
                              <>
                                <button
                                  disabled={!isAvailable}
                                  title={isAvailable ? "" : "Disponível apenas após o Atestado de Execução"}
                                  onClick={() => openDocumentInNewTab('RELATORIO', escala)}
                                  className={`flex items-center justify-between px-3 py-2 rounded-lg border font-semibold text-xs transition shadow-sm ${isAvailable ? 'border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50 text-emerald-700 dark:bg-emerald-950/10 dark:border-emerald-900/30 dark:text-emerald-400' : 'opacity-40 cursor-not-allowed border-gray-200 text-gray-400 dark:bg-gray-900'}`}
                                >
                                  <span>3. PDF do Relatório</span>
                                  <ExternalLink size={12} />
                                </button>
                                <button
                                  disabled={!isAvailable}
                                  title={isAvailable ? "" : "Disponível apenas após o Atestado de Execução"}
                                  onClick={() => openDocumentInNewTab('CUSTOS', escala)}
                                  className={`flex items-center justify-between px-3 py-2 rounded-lg border font-semibold text-xs transition shadow-sm ${isAvailable ? 'border-teal-200 bg-teal-50/40 hover:bg-teal-50 text-teal-700 dark:bg-teal-950/10 dark:border-teal-900/30 dark:text-teal-400' : 'opacity-40 cursor-not-allowed border-gray-200 text-gray-400 dark:bg-gray-900'}`}
                                >
                                  <span>4. PDF de Custos</span>
                                  <ExternalLink size={12} />
                                </button>
                              </>
                            );
                          })()}

                          {escala.formData.nsAttachment && (
                            <button
                              onClick={() => openDocumentInNewTab('NS', escala)}
                              className="flex items-center justify-between px-3 py-2 rounded-lg border border-blue-200 bg-blue-50/40 hover:bg-blue-50 text-blue-700 dark:bg-blue-950/10 dark:border-blue-900/30 dark:text-blue-400 font-semibold text-xs transition shadow-sm"
                            >
                              <span>Anexo: Nota de Serviço</span>
                              <ExternalLink size={12} />
                            </button>
                          )}

                          {escala.formData.bgAttachment && (
                            <button
                              onClick={() => openDocumentInNewTab('BG', escala)}
                              className="flex items-center justify-between px-3 py-2 rounded-lg border border-purple-200 bg-purple-50/40 hover:bg-purple-50 text-purple-700 dark:bg-purple-950/10 dark:border-purple-900/30 dark:text-purple-400 font-semibold text-xs transition shadow-sm"
                            >
                              <span>Anexo: Boletim Geral</span>
                              <ExternalLink size={12} />
                            </button>
                          )}

                          {(() => {
                            const links: any[] = [];
                            if (escala.formData.reportEffectiveItems) {
                              escala.formData.reportEffectiveItems.forEach((item: any) => {
                                if (item.substituteAttachment) {
                                  links.push(
                                    <button
                                      key={`att-sub-btn-${item.id}`}
                                      onClick={() => openDocumentInNewTab(`ATT-SUB-${item.id}`, escala)}
                                      className="flex items-center justify-between px-3 py-2 rounded-lg border border-orange-200 bg-orange-50/40 hover:bg-orange-50 text-orange-700 dark:bg-orange-950/10 dark:border-orange-900/30 dark:text-orange-400 font-semibold text-xs transition shadow-sm"
                                    >
                                      <span className="truncate">Permuta: {item.soldierName}</span>
                                      <ExternalLink size={12} className="flex-shrink-0 ml-1" />
                                    </button>
                                  );
                                }
                                if (item.dispensaAttachment) {
                                  links.push(
                                    <button
                                      key={`att-disp-btn-${item.id}`}
                                      onClick={() => openDocumentInNewTab(`ATT-DISP-${item.id}`, escala)}
                                      className="flex items-center justify-between px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50 text-indigo-700 dark:bg-indigo-950/10 dark:border-indigo-900/30 dark:text-indigo-400 font-semibold text-xs transition shadow-sm"
                                    >
                                      <span className="truncate">Atestado: {item.soldierName}</span>
                                      <ExternalLink size={12} className="flex-shrink-0 ml-1" />
                                    </button>
                                  );
                                }
                              });
                            }
                            return links;
                          })()}

                          {/* Extra Google Drive Files */}
                          {(driveFiles || [])
                            .filter(f => {
                              const nameLower = f.name.toLowerCase();
                              return !nameLower.includes('memo') &&
                                     !nameLower.includes('nota') &&
                                     !nameLower.includes('boletim') &&
                                     !nameLower.includes('escala') &&
                                     !nameLower.includes('relat') &&
                                     !nameLower.includes('custo');
                            })
                            .map(f => (
                              <a 
                                key={f.id}
                                href={f.webViewLink}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 bg-slate-50/40 hover:bg-slate-50 text-slate-700 dark:bg-slate-800/40 dark:border-slate-700 dark:text-slate-300 font-semibold text-xs transition shadow-sm"
                              >
                                <span className="truncate" title={f.name}>{f.name}</span>
                                <ExternalLink size={12} className="flex-shrink-0 ml-1 text-gray-400" />
                              </a>
                            ))
                          }
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Return Modal Inside APROVADOR context */}
                {returnModal.isOpen && (
                  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg w-full max-w-lg shadow-xl border border-gray-200 dark:border-gray-700">
                        <h3 className="text-xl font-bold mb-4 font-sans text-orange-600">Devolver Relatório</h3>
                        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">Descreva detalhadamente o que o comandante deve corrigir no relatório.</p>
                        <textarea 
                           className="w-full p-3 border rounded text-sm min-h-[100px] mb-4 dark:bg-gray-700 text-black dark:text-white dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
                           value={returnReason}
                           onChange={e => setReturnReason(e.target.value)}
                           placeholder="Ex: Faltou anexar as fotos do evento e justificar as faltas..."
                        ></textarea>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => { setReturnModal({isOpen: false, escalaId: null}); setReturnReason(''); }} className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-100 dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">Cancelar</button>
                            <button onClick={handleReturnEscala} className="bg-orange-600 text-white px-6 py-2 rounded font-bold hover:bg-orange-700 disabled:opacity-50" disabled={returnReason.trim() === ''}>Confirmar Devolução</button>
                        </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'PAGAMENTO' && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><Banknote /> Prontos para Pagamento</h2>
                {pagamentoEscalaId ? (
                   <div>
                       {(() => {
                           const esc = escalas.find(e => e.id === pagamentoEscalaId);
                           if (!esc) return null;
                           const formattedDate = esc.formData.eventDate ? formatAnyDate(esc.formData.eventDate) : 'N/A';
                           return (
                               <>
                                   {/* Event/Service summary card as requested */}
                                   <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                       <div className="md:col-span-3 border-b pb-2 mb-1 flex items-center justify-between">
                                           <div>
                                               <span className="text-xs font-bold text-gray-500 uppercase block">Evento</span>
                                               <h3 className="font-bold text-lg text-cbmpa-900 dark:text-yellow-500">{esc.formData.operationName || esc.formData.eventName}</h3>
                                           </div>
                                           <div className="flex gap-2">
                                               <button onClick={() => setPagamentoEscalaId(null)} className="px-4 py-2 border rounded font-bold hover:bg-gray-50 bg-white dark:bg-gray-750 dark:border-gray-600 dark:text-white text-xs">Voltar para Lotes</button>
                                               <button onClick={() => handleLaunchAllForPayment(pagamentoEscalaId!)} className="bg-green-600 text-white px-4 py-2 rounded font-bold hover:bg-green-700 text-xs shadow-sm transition flex items-center gap-1">
                                                  <Check size={16} /> Concluir Lançamento
                                               </button>
                                           </div>
                                       </div>
                                       <div>
                                           <span className="text-xs font-bold text-gray-500 uppercase block">Local</span>
                                           <span className="font-medium text-gray-800 dark:text-gray-200">{esc.formData.eventLocal || 'Não informado'}</span>
                                       </div>
                                       <div>
                                           <span className="text-xs font-bold text-gray-500 uppercase block">Data</span>
                                           <span className="font-medium text-gray-800 dark:text-gray-200">{formattedDate}</span>
                                       </div>
                                       <div>
                                           <span className="text-xs font-bold text-gray-500 uppercase block">Horário</span>
                                           <span className="font-medium text-gray-800 dark:text-gray-200">{esc.formData.eventStartTime || '08:00'} às {esc.formData.eventEndTime || '17:00'}</span>
                                       </div>
                                       <div>
                                           <span className="text-xs font-bold text-gray-500 uppercase block">UBM de Origem</span>
                                           <span className="font-medium text-gray-800 dark:text-gray-200">{esc.formData.ubmOrigem || esc.formData.issuerUbm || 'COP'}</span>
                                       </div>
                                       <div>
                                           <span className="text-xs font-bold text-gray-500 uppercase block">Qtd. Militares</span>
                                           <span className="font-medium text-gray-800 dark:text-gray-200">{(esc.formData.costSheetItems || []).length} militares</span>
                                       </div>
                                       <div>
                                           <span className="text-xs font-bold text-gray-500 uppercase block">Lançados</span>
                                           <span className="font-medium text-gray-800 dark:text-gray-200">{esc.formData.costSheetItems?.filter((i:any) => i.isLaunched).length || 0} de {esc.formData.costSheetItems?.length || 0}</span>
                                       </div>
                                   </div>

                                   <div className="overflow-x-auto">
                                       <table className="w-full text-sm">
                                           <thead className="bg-gray-100 dark:bg-gray-700 text-xs font-bold uppercase text-gray-600 dark:text-gray-300">
                                              <tr>
                                                 <th className="p-3 text-left">MF (Matrícula)</th>
                                                 <th className="p-3 text-left">Posto/Graduação</th>
                                                 <th className="p-3 text-left">Nome do Militar</th>
                                                 <th className="p-3 text-left">Cargo/Função</th>
                                                 <th className="p-3 text-left">UBM</th>
                                                 <th className="p-3 text-center">Lançamento em Folha</th>
                                              </tr>
                                           </thead>
                                           <tbody>
                                              {getEffectiveCostItems(esc.formData).map((item: any, idx: number) => {
                                                  const isL = item.isLaunched;
                                                  return (
                                                      <tr key={item.id} className="border-b hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                                                          <td className="p-3 font-mono text-xs font-bold">{item.soldierMatricula}</td>
                                                          <td className="p-3 font-medium">{item.soldierRank || '-'}</td>
                                                          <td className="p-3 font-bold text-gray-800 dark:text-gray-100">{item.soldierName}</td>
                                                          <td className="p-3">
                                                              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${item.isCommander ? "bg-yellow-100 text-yellow-800" : item.isAuxiliar ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}`}>
                                                                  {item.isCommander ? 'Comandante' : item.isAuxiliar ? 'Aux. do Cmt' : item.role || 'Militar'}
                                                              </span>
                                                          </td>
                                                          <td className="p-3">{item.soldierUbm}</td>
                                                          <td className="p-3 text-center">
                                                              {isL ? (
                                                                  <span className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-3 py-1 text-xs font-bold rounded-full border border-green-200">Lançado</span>
                                                              ) : (
                                                                  <button onClick={async () => {
                                                                      const updatedItems = esc.formData.costSheetItems.map((i: any) => i.id === item.id ? { ...i, isLaunched: true } : i);
                                                                      const newEscala = { ...esc, formData: { ...esc.formData, costSheetItems: updatedItems } };
                                                                      const newEscalas = escalas.map(e => e.id === pagamentoEscalaId ? newEscala : e);
                                                                      
                                                                      setEscalas(newEscalas);
                                                                      localStorage.setItem(SYSTEM_ESCALAS_KEY, JSON.stringify(newEscalas));
                                                                      
                                                                      // Enviar e-mail
                                                                      const mUser = customUsersDict[item.soldierMatricula];
                                                                      if (mUser && mUser.email) {
        await fetch('/api/send-email', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
               to: mUser.email,
               subject: 'Aviso de Lançamento de Extraordinária - Pagamento',
               html: `<p>A extraordinária referente à operação <b>${esc.formData.operationName}</b> foi lançada na sua folha de pagamento.</p><p>Acesse o sistema para conferência no seu painel.</p>`
           })
        }).then(async res => { if (!res.ok) alert("Aviso: Falha ao enviar notificação por e-mail."); }).catch(e => alert("Erro ao tentar enviar e-mail de notificação."));
                                                                      }
                                                                  }} className="bg-blue-600 text-white px-4 py-1.5 rounded font-bold hover:bg-blue-700 text-xs shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]">Lançar em Folha</button>
                                                              )}
                                                          </td>
                                                      </tr>
                                                  );
                                              })}
                                           </tbody>
                                       </table>
                                   </div>
                               </>
                           );
                       })()}
                   </div>
                ) : (
                   <div className="space-y-3">
                     {escalas.filter(e => e.status === 'homologado' || e.status === 'lancado').map(escala => {
                        const isAllLaunched = escala.status === 'lancado' || (escala.formData.costSheetItems?.length > 0 && escala.formData.costSheetItems.every((i: any) => i.isLaunched));
                        return (
                          <div key={escala.id} className={`p-4 border rounded-lg flex justify-between items-center ${isAllLaunched ? 'border-green-300 bg-green-50/60 dark:bg-green-950/20' : 'border-amber-200 bg-amber-50/50 dark:bg-amber-950/20'}`}>
                            <div>
                              <div className="font-bold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                                  {escala.formData.operationName}
                                  {isAllLaunched && (
                                    <span className="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase border border-green-300 flex items-center gap-1">
                                      <Check size={12} className="text-green-700" /> Lançado em Folha
                                    </span>
                                  )}
                              </div>
                              <div className="text-sm text-gray-500 flex gap-4 mt-1">
                                  <span>Planilha Consolidada ({escala.formData.costSheetItems.length} militares)</span>
                                  <span>Lançados: {escala.formData.costSheetItems.filter((i:any) => i.isLaunched).length} / {escala.formData.costSheetItems.length}</span>
                               </div>
                            </div>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => setPagamentoEscalaId(escala.id)} 
                                className={isAllLaunched 
                                  ? "bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-bold flex items-center gap-1.5 text-xs transition shadow-sm" 
                                  : "bg-yellow-500 hover:bg-yellow-400 text-cbmpa-900 px-4 py-2 rounded font-bold text-xs transition shadow-sm"
                                }
                              >
                                {isAllLaunched ? (
                                  <>
                                    <Check size={16} className="text-white" />
                                    <span>✓ Lançado em Folha</span>
                                  </>
                                ) : (
                                  <span>Selecionar Lote</span>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      
                      {escalas.filter(e => e.status === "homologado" || e.status === "lancado").length === 0 && (
                        <div className="text-gray-500 text-center py-8">Nenhum lote pronto para pagamento no momento.</div>
                     )}
                   </div>
                )}
              </div>
            )}

          </div>
        )}


        {/* --- O SEU EDITOR ORIGINAL (FORMULÁRIOS) --- */}
        {activeTab === 'EDITOR' && (
          <div className="p-4 md:p-8 pb-32">
            
            {/* Modal de Comandante Mantido */}
            {showWarNameModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-2xl w-96 border border-gray-200 dark:border-gray-600">
                  <h3 className="text-lg font-bold mb-4 text-cbmpa-900 dark:text-white">Definir Comandante</h3>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Informe o Nome de Guerra</label>
                  <input type="text" value={tempWarName} onChange={(e) => setTempWarName(e.target.value)} className="w-full p-2 border rounded mb-6 dark:bg-gray-700" placeholder="Ex: SILVA" autoFocus />
                  <div className="flex justify-end space-x-2">
                    <button onClick={() => setShowWarNameModal(false)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
                    <button onClick={confirmCommander} className="px-4 py-2 text-sm bg-cbmpa-600 text-white rounded font-medium">Confirmar</button>
                  </div>
                </div>
              </div>
            )}

            {/* Barra de Consultas/Anexos (Sem abas extras para o Escalante) */}
            {currentUser?.permissoes?.includes('ESCALANTE') && editingEscalaId && escalas.find(e => e.id === editingEscalaId) && (
              <div className="max-w-7xl mx-auto flex flex-col gap-2 mb-4">
                  <div className="flex items-center gap-2 px-2 bg-white dark:bg-gray-800 p-2 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                      <span className="text-xs font-bold text-gray-500 uppercase">Consultas: </span>
                      <button onClick={() => {
                          window.open(generateEscalaOnlyPDF(state, false, currentUser, escalas.find(e => e.id === editingEscalaId)?.escalaApprovalLabel) as string, '_blank');
                      }} className="text-xs font-bold text-blue-600 hover:underline">Escala Aprovada (PDF)</button>
                      
                      {escalas.find(e => e.id === editingEscalaId)?.formData.nsAttachment && (
                          <>
                            <span className="text-gray-300">|</span>
                            <a href={escalas.find(e => e.id === editingEscalaId)?.formData.nsAttachment} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 hover:underline">Nota de Serviço (NS)</a>
                          </>
                      )}
                      
                      {escalas.find(e => e.id === editingEscalaId)?.formData.bgAttachment && (
                          <>
                            <span className="text-gray-300">|</span>
                            <a href={escalas.find(e => e.id === editingEscalaId)?.formData.bgAttachment} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 hover:underline">Boletim Geral (BG)</a>
                          </>
                      )}
                  </div>
              </div>
            )}

            <div className="max-w-7xl mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-6 space-y-8">
                <fieldset disabled={!isEditable} className="min-w-0 border-0 p-0 m-0">
                {/* --- SEUS FORMULÁRIOS ORIGINAIS (Renderizados condicionalmente com base no currentDoc) --- */}
                {state.currentDoc === DocumentType.MEMO && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-blue-50 dark:bg-gray-800/50 rounded-lg p-6 border border-blue-100 dark:border-gray-700">
                       <h3 className="text-sm font-bold text-cbmpa-900 dark:text-white mb-4 flex items-center gap-2">
                          <User size={16} /> NOME DO COMANDANTE DA PREVENÇÃO
                       </h3>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="md:col-span-2 relative">
                             <label className="label">NOME DO COMANDANTE (BUSCA OU DIGITE)</label>
                             <div className="relative">
                                <input 
                                  type="text" 
                                  className="input pl-9" 
                                  placeholder="Digite nome ou matrícula..." 
                                  value={issuerSearchTerm}
                                  onChange={handleIssuerSearchChange}
                                />
                                <Search className="absolute left-2.5 top-2.5 text-gray-400" size={16} />
                             </div>
                             {showIssuerSuggestions && (
                               <ul className="absolute z-50 w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-48 overflow-auto mt-1">
                                  {issuerSuggestions.map(s => (
                                    <li key={s.matricula} onClick={() => selectIssuer(s)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer text-sm border-b border-gray-100 dark:border-gray-600 last:border-0">
                                       <div className="font-bold">{s.posto} {s.nome}</div>
                                       <div className="text-xs text-gray-500 dark:text-gray-400">Mat: {s.matricula}</div>
                                    </li>
                                  ))}
                               </ul>
                             )}
                          </div>
                          
                          <div className="hidden">
                             <input type="text" value={state.formData.issuerName} readOnly />
                             <input type="text" value={state.formData.issuerMatricula} readOnly />
                             <input type="text" value={state.formData.issuerUbm} readOnly />
                          </div>

                          <div>
                             <label className="label">NOME DE GUERRA</label>
                             <input type="text" className="input" placeholder="Ex: SILVA" value={state.formData.issuerWarName} onChange={(e) => handleInputChange('issuerWarName', e.target.value)} />
                          </div>
                          <div>
                             <label className="label">POSTO/GRADUAÇÃO</label>
                             <select className="input" value={state.formData.issuerRank} onChange={(e) => handleInputChange('issuerRank', e.target.value)}>
                                {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                             </select>
                          </div>
                       </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-lg p-0 space-y-4">
                       <div className="relative">
                         <label className="label">NOME DO DESTINATÁRIO (BUSCA OU DIGITE)</label>
                         <div className="relative">
                            <input type="text" className="input pl-9" placeholder="Ex: Cel Fulano de Tal" value={recipientSearchTerm} onChange={handleRecipientSearchChange} />
                            <Search className="absolute left-2.5 top-2.5 text-gray-400" size={16} />
                         </div>
                         {showRecipientSuggestions && (
                           <ul className="absolute z-50 w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-48 overflow-auto mt-1">
                             {recipientSuggestions.map(s => (
                               <li key={s.matricula} onClick={() => selectRecipient(s)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer text-sm">
                                 {s.posto} {s.nome}
                               </li>
                             ))}
                           </ul>
                         )}
                       </div>
                       <div>
                         <label className="label">FUNÇÃO DO DESTINATÁRIO</label>
                         <input type="text" className="input" placeholder="Ex: Comandante Operacional do CBMPA" value={state.formData.recipientCargo} onChange={(e) => handleInputChange('recipientCargo', e.target.value)} />
                       </div>
                    </div>

                    <div className="bg-yellow-50 dark:bg-gray-900/30 rounded-lg p-4 border border-yellow-100 dark:border-gray-700">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="grid grid-cols-1 gap-2">
                             <div>
                               <label className="label flex items-center justify-between">
                                 <span>NS (NOTA DE SERVIÇO) Nº / ANO</span>
                                 {state.formData.nsAttachment && <a href={state.formData.nsAttachment} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-xs">Ver Anexo</a>}
                               </label>
                               <div className="flex flex-col gap-2">
                                 <div className="flex gap-2">
                                    <input type="text" className="input flex-1" placeholder="Nº" value={state.formData.memoNsNum} onChange={(e) => handleInputChange('memoNsNum', e.target.value)} />
                                    <input type="text" className="input w-24" placeholder="2025" value={state.formData.memoNsYear} onChange={(e) => handleInputChange('memoNsYear', e.target.value)} />
                                 </div>
                                 <button onClick={() => handleFileUploadToDrive('NS')} className="flex items-center justify-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-700 p-2 rounded dark:bg-gray-600 dark:text-white w-full text-xs font-bold transition-colors" title="Anexar NS">
                                    <Upload size={14} /> ANEXAR
                                 </button>
                               </div>
                             </div>
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                             <div>
                               <label className="label flex items-center justify-between">
                                 <span>BG (BOLETIM GERAL) Nº / ANO</span>
                                 {state.formData.bgAttachment && <a href={state.formData.bgAttachment} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-xs">Ver Anexo</a>}
                               </label>
                               <div className="flex flex-col gap-2">
                                 <div className="flex gap-2">
                                    <input type="text" className="input flex-1" placeholder="Nº" value={state.formData.memoBgNum} onChange={(e) => handleInputChange('memoBgNum', e.target.value)} />
                                    <input type="text" className="input w-24" placeholder="2025" value={state.formData.memoBgYear} onChange={(e) => handleInputChange('memoBgYear', e.target.value)} />
                                 </div>
                                 <button onClick={() => handleFileUploadToDrive('BG')} className="flex items-center justify-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-700 p-2 rounded dark:bg-gray-600 dark:text-white w-full text-xs font-bold transition-colors" title="Anexar BG">
                                    <Upload size={14} /> ANEXAR
                                 </button>
                               </div>
                             </div>
                          </div>
                       </div>
                       
                       <div className="mt-4">
                          <div className="max-w-md">
                            <label className="label">ADICIONAR DATA INDIVIDUAL</label>
                            <div className="flex gap-2">
                              <input type="date" className="input" value={tempDateInput} onChange={(e) => setTempDateInput(e.target.value)} />
                              <button onClick={addMemoDate} className="bg-cbmpa-600 hover:bg-cbmpa-700 text-white px-4 rounded font-bold flex items-center gap-2 text-sm whitespace-nowrap">
                                  <Plus size={18}/> Adicionar
                              </button>
                            </div>
                          </div>
                       </div>
                       <div className="flex flex-wrap gap-2 mt-4">
                          {(state.formData.memoDatesList || []).map(date => (
                             <span key={date} className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-3 py-1 rounded text-sm font-medium flex items-center gap-2">
                                {formatAnyDate(date)}
                                <button onClick={() => removeMemoDate(date)} className="text-red-500 hover:text-red-700"><X size={14}/></button>
                             </span>
                          ))}
                        </div>
                    </div>
                  </div>
                )}

                {state.currentDoc === DocumentType.COST_SHEET && (
                  <div className="space-y-6">
                    {/* 1. Formulário Principal (Dados da Escala e Adição de Militares) */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700 shadow-sm border-l-4 border-l-cbmpa-500 space-y-6">
                      <h3 className="font-bold text-gray-600 dark:text-gray-300 uppercase">CRIAR ESCALA E ADICIONAR MILITARES</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">NOME DO EVENTO</label>
                            <input type="text" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={state.formData.operationName} onChange={(e) => handleInputChange('operationName', e.target.value)} />
                         </div>
                         <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">UBM DE ORIGEM</label>
                            <select className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={state.formData.ubmOrigem} onChange={(e) => handleInputChange('ubmOrigem', e.target.value)}>
                               <option value="">Selecione a UBM</option>
                               {UBMS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                         </div>
                         <div className="relative md:col-span-2">
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1 flex items-center justify-between">
                              <span>DESTINATÁRIO / HOMOLOGADOR DO PROCESSO</span>
                              {(state.formData.recipientMatricula || state.formData.homologadorMatricula) && (
                                <span className="text-cbmpa-600 dark:text-yellow-500 font-semibold">
                                  Matrícula: {state.formData.recipientMatricula || state.formData.homologadorMatricula}
                                </span>
                              )}
                            </label>
                            <input 
                              type="text" 
                              className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
                              placeholder="Buscar por nome ou matrícula do militar destinatário/homologador..." 
                              value={recipientSearchTerm || homologadorSearchTerm} 
                              onChange={handleRecipientSearchChange} 
                            />
                            {showRecipientSuggestions && (
                              <ul className="absolute z-50 bg-white dark:bg-gray-800 border rounded shadow-lg max-h-48 overflow-auto w-full mt-1 divide-y dark:divide-gray-700">
                                {recipientSuggestions.map(s => (
                                  <li 
                                    key={s.matricula} 
                                    onClick={() => selectRecipient(s)} 
                                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm flex justify-between items-center"
                                  >
                                    <div>
                                      <span className="font-bold text-cbmpa-900 dark:text-yellow-500">{s.posto ? s.posto.toUpperCase() + ' ' : ''}{s.nome}</span>
                                      <span className="text-xs text-gray-500 block">UBM: {s.ubm || 'CBMPA'}</span>
                                    </div>
                                    <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded font-mono">Mat: {s.matricula}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                         </div>
                         <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">FUNÇÃO DO DESTINATÁRIO (TEXTO LIVRE)</label>
                            <input type="text" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Ex: Comandante Geral do CBMPA" value={state.formData.recipientCargo || ''} onChange={(e) => handleInputChange('recipientCargo', e.target.value)} />
                         </div>
                         <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">TIPO DE SERVIÇO DA ESCALA</label>
                            <select 
                              className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white font-semibold"
                              value={state.formData.serviceType || 'PREVENCAO'}
                              onChange={(e) => {
                                const newType = e.target.value;
                                handleInputChange('serviceType', newType);
                                setNewCostItem(prev => ({ ...prev, serviceType: newType }));
                              }}
                            >
                              <option value="PREVENCAO">Prevenção Desportiva</option>
                              <option value="DIVERSOS">Serviços Diversos</option>
                              <option value="GUARDA_VIDAS">Guarda Vidas</option>
                              <option value="CORTE_VEGETAL">Corte de Vegetal</option>
                            </select>
                         </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                         <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">DATA DO EVENTO</label>
                            <input type="date" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={state.formData.eventDate} onChange={(e) => handleInputChange('eventDate', e.target.value)} />
                         </div>
                         <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">LOCAL DO EVENTO</label>
                            <input type="text" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Ex: Estádio Mangueirāo" value={state.formData.eventLocal} onChange={(e) => handleInputChange('eventLocal', e.target.value)} />
                         </div>
                         <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">UNIFORME</label>
                            <input type="text" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Ex: 4º A (Operacional)" value={state.formData.uniform || ''} onChange={(e) => handleInputChange('uniform', e.target.value)} />
                         </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1 flex items-center justify-between">
                              <span>Nº DA NOTA DE SERVIÇO (NS)</span>
                              {state.formData.nsAttachment && <a href={state.formData.nsAttachment} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">Ver Anexo</a>}
                            </label>
                            <div className="flex flex-col gap-2">
                              <input type="text" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={state.formData.memoNsNum} onChange={(e) => handleInputChange('memoNsNum', e.target.value)} />
                              <button type="button" onClick={() => handleFileUploadToDrive('NS')} className="flex items-center justify-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-700 p-2 rounded dark:bg-gray-600 dark:text-white w-full text-xs font-bold transition-colors">
                                 <Upload size={14} /> ANEXAR
                              </button>
                            </div>
                         </div>
                         <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1 flex items-center justify-between">
                              <span>Nº DO BG</span>
                              {state.formData.bgAttachment && <a href={state.formData.bgAttachment} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">Ver Anexo</a>}
                            </label>
                            <div className="flex flex-col gap-2">
                              <input type="text" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={state.formData.memoBgNum} onChange={(e) => handleInputChange('memoBgNum', e.target.value)} />
                              <button type="button" onClick={() => handleFileUploadToDrive('BG')} className="flex items-center justify-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-700 p-2 rounded dark:bg-gray-600 dark:text-white w-full text-xs font-bold transition-colors">
                                 <Upload size={14} /> ANEXAR
                              </button>
                            </div>
                         </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                         <div><label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">HORA INÍCIO</label><input type="time" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={state.formData.eventStartTime} onChange={(e) => handleInputChange('eventStartTime', e.target.value)} /></div>
                         <div><label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">HORA TÉRMINO</label><input type="time" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={state.formData.eventEndTime} onChange={(e) => handleInputChange('eventEndTime', e.target.value)} /></div>
                      </div>

                      <div>
                         <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">OBSERVAÇÃO (OPCIONAL)</label>
                         <textarea 
                            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
                            placeholder="Insira qualquer observação relevante..." 
                            rows={2}
                            value={state.formData.escalaObs || ''} 
                            onChange={(e) => handleInputChange('escalaObs', e.target.value)} 
                         />
                      </div>
                      
                      <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                         <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                           <div className="md:col-span-5 relative">
                               <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">BUSCAR MILITAR</label>
                               <input type="text" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Matrícula ou Nome..." value={costSearchTerm} onChange={handleCostSearchChange} />
                               {showCostSuggestions && (
                                 <ul className="absolute z-50 bg-white dark:bg-gray-800 border rounded shadow-lg max-h-40 overflow-auto w-full mt-1">
                                   {costSuggestions.map(s => <li key={s.matricula} onClick={() => selectCostSoldier(s)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm">{s.posto} {s.nome}</li>)}
                                 </ul>
                               )}
                           </div>
                           <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">UBM</label>
                                <select className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={newCostItem.ubm} onChange={(e) => setNewCostItem({...newCostItem, ubm: e.target.value})}>
                                   {UBMS.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                           </div>
                           <div className="md:col-span-3">
                                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">TIPO DE SERVIÇO</label>
                                <select 
                                  className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white text-xs font-semibold"
                                  value={newCostItem.serviceType || state.formData.serviceType || 'PREVENCAO'}
                                  onChange={(e) => setNewCostItem({...newCostItem, serviceType: e.target.value})}
                                >
                                  <option value="PREVENCAO">Prevenção Desportiva</option>
                                  <option value="DIVERSOS">Serviços Diversos</option>
                                  <option value="GUARDA_VIDAS">Guarda Vidas</option>
                                  <option value="CORTE_VEGETAL">Corte de Vegetal</option>
                                </select>
                           </div>
                           <div className="md:col-span-2 flex items-end">
                             <button type="button" onClick={addSoldierToRoster} className="w-full bg-cbmpa-600 text-white px-3 py-2 rounded font-bold hover:bg-cbmpa-700 flex items-center justify-center gap-1 transition-colors text-xs">
                               <Plus size={16} /> Adicionar
                             </button>
                           </div>
                         </div>
                      </div>
                    </div>

                    {/* 2. Lista de Militares Adicionados - Na parte debaixo */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700 shadow-sm border-t-4 border-t-cbmpa-500 space-y-4">
                      <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm uppercase flex justify-between items-center pb-2 border-b">
                        <span>Militares na Escala ({(state.formData.costSheetItems || []).length})</span>
                        <span className="text-xs bg-cbmpa-50 dark:bg-cbmpa-950 text-cbmpa-600 dark:text-cbmpa-400 px-2.5 py-0.5 rounded-full font-semibold">Tropa Ativa</span>
                      </h3>
                      
                      {(state.formData.costSheetItems || []).length > 0 ? (
                        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                          <table className="w-full text-sm">
                             <thead className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase text-xs sticky top-0">
                                <tr>
                                   <th className="p-2.5 text-left text-xs">MATRÍCULA</th>
                                   <th className="p-2.5 text-left text-xs">MILITAR</th>
                                   <th className="p-2.5 text-left text-xs">FUNÇÃO</th>
                                   <th className="p-2.5 text-left text-xs">TIPO DE SERVIÇO</th>
                                   <th className="p-2.5 text-center text-xs">AÇÃO</th>
                                </tr>
                             </thead>
                             <tbody>
                                {(state.formData.costSheetItems || []).map((item, index) => (
                                   <tr key={item.id} className={`border-b border-gray-100 dark:border-gray-700 ${item.isCommander ? "bg-yellow-50 dark:bg-yellow-950/20" : item.isAuxiliar ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}>
                                      <td className="p-2.5 text-xs font-mono">{item.soldierMatricula}</td>
                                      <td className="p-2.5">
                                        <div className="font-bold text-gray-900 dark:text-gray-100 text-xs">{item.soldierRank} {item.soldierName}</div>
                                        <div className="text-[10px] text-gray-500">{item.soldierUbm}</div>
                                      </td>
                                      <td className="p-2.5">
                                         <select className="w-full p-1.5 border rounded dark:bg-gray-700 text-xs dark:border-gray-600 dark:text-white" value={item.role || (item.isCommander ? 'Comandante' : item.isAuxiliar ? 'Aux. do Cmt' : '')} onChange={(e) => updateRole(item.id, e.target.value, 'COST')}>
                                            <option value="">Selecione...</option>
                                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                         </select>
                                      </td>
                                      <td className="p-2.5">
                                         <select 
                                           className="w-full p-1.5 border rounded dark:bg-gray-700 text-xs dark:border-gray-600 dark:text-white font-medium"
                                           value={item.serviceType || 'PREVENCAO'}
                                           onChange={(e) => {
                                             const newType = e.target.value;
                                             setState(prev => ({
                                               ...prev,
                                               formData: {
                                                 ...prev.formData,
                                                 costSheetItems: prev.formData.costSheetItems.map(i => i.id === item.id ? { ...i, serviceType: newType as any } : i)
                                               }
                                             }));
                                           }}
                                         >
                                           <option value="PREVENCAO">Prevenção Desportiva</option>
                                           <option value="DIVERSOS">Serviços Diversos</option>
                                           <option value="GUARDA_VIDAS">Guarda Vidas</option>
                                           <option value="CORTE_VEGETAL">Corte de Vegetal</option>
                                         </select>
                                      </td>
                                      <td className="p-2.5 text-center">
                                        <button type="button" onClick={() => removeCostItem(item.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>
                                      </td>
                                   </tr>
                                ))}
                             </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-gray-400 text-center py-12 text-sm">
                          <p className="font-medium">Nenhum militar adicionado ainda.</p>
                          <p className="text-xs text-gray-500 mt-1">Busque um militar no formulário acima e clique em "+ Adicionar à escala".</p>
                        </div>
                      )}
                    </div>

                    {/* 3. Botões de Ação no final do Formulário */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-wrap justify-between items-center gap-4">
                      <button 
                        type="button" 
                        onClick={() => setActiveTab('ESCALANTE')} 
                        className="px-6 py-2.5 text-gray-600 dark:text-gray-300 font-bold hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600 transition-colors"
                      >
                        Cancelar / Voltar
                      </button>
                      
                      <div className="flex flex-wrap items-center gap-3">
                        <button 
                          type="button" 
                          onClick={() => {
                            const currE = escalas.find(e => e.id === editingEscalaId);
                            window.open(generateEscalaOnlyPDF(state, false, currentUser, currE?.escalaApprovalLabel) as string, '_blank');
                          }} 
                          className="border border-red-600 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 px-5 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-colors"
                        >
                          <Download size={18} /> Ver PDF Final
                        </button>
                        
                        {(() => {
                          const evDate = state.formData.eventDate;
                          const evTime = state.formData.eventStartTime;
                          let isOpen = true;
                          if (evDate && evTime) {
                            const dt = new Date(`${evDate}T${evTime}`);
                            if (!isNaN(dt.getTime()) && new Date() >= dt) isOpen = false;
                          }
                          
                          if (isOpen) {
                            return (
                              <button 
                                type="button" 
                                onClick={() => saveEscalaWorkflow('em_edicao', 'Escala salva com sucesso!', false)} 
                                className="bg-cbmpa-700 hover:bg-cbmpa-800 text-white px-8 py-2.5 rounded-lg font-bold shadow-sm transition-all hover:scale-[1.01]"
                              >
                                Salvar Escala
                              </button>
                            );
                          } else {
                            return (
                              <div className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-4 py-2.5 rounded-lg font-bold border border-red-200 dark:border-red-800">
                                Escala Fechada (Evento Iniciado)
                              </div>
                            );
                          }
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {state.currentDoc === DocumentType.REPORT && (
                  <div className="space-y-6">
                     
                     <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm border-t-4 border-t-cbmpa-800">
                        <h3 className="font-bold text-cbmpa-800 border-b pb-2 mb-3 text-sm">1. Dados Iniciais (Sincronizado com Planilha)</h3>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3">
                           <div className="md:col-span-6">
                              <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">NOME DO EVENTO</label>
                              <input type="text" className="w-full p-1.5 text-xs border rounded dark:bg-gray-700 bg-gray-50 text-gray-600 cursor-not-allowed" value={state.formData.operationName || state.formData.eventName} readOnly />
                           </div>
                           <div className="md:col-span-6 bg-red-50 dark:bg-red-950/20 p-1.5 rounded border border-red-100 dark:border-red-900/50 flex items-center justify-center">
                              <div className="text-xs font-bold text-red-700 dark:text-red-300 text-center uppercase">
                                 COMANDANTE: {state.formData.issuerName || 'NÃO SELECIONADO NA SEÇÃO 2'}
                              </div>
                           </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3">
                           <div className="md:col-span-3">
                              <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">DATA</label>
                              <input type="date" className="w-full p-1.5 text-xs border rounded dark:bg-gray-700 bg-gray-50 text-gray-600 cursor-not-allowed" value={state.formData.eventDate} readOnly />
                           </div>
                           <div className="md:col-span-3">
                              <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">DIA DA SEMANA</label>
                              <input type="text" className="w-full p-1.5 text-xs border rounded dark:bg-gray-700 bg-gray-50 text-gray-600 cursor-not-allowed" value={state.formData.eventDayOfWeek} readOnly />
                           </div>
                           <div className="md:col-span-3">
                              <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">LOCAL</label>
                              <input type="text" className="w-full p-1.5 text-xs border rounded dark:bg-gray-700 bg-gray-50 text-gray-600 cursor-not-allowed" value={state.formData.eventLocal} readOnly />
                           </div>
                           <div className="md:col-span-3">
                              <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">UNIFORME</label>
                              <input type="text" className="w-full p-1.5 text-xs border rounded dark:bg-gray-700 bg-gray-50 text-gray-600 cursor-not-allowed" value={state.formData.uniform || ''} readOnly />
                           </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3">
                           <div className="md:col-span-3">
                              <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">HORA INÍCIO</label>
                              <div className="flex items-center">
                                 <input type="time" className="w-full p-1.5 text-xs border rounded-l dark:bg-gray-700 bg-gray-50 text-gray-600 cursor-not-allowed" value={state.formData.eventStartTime} readOnly />
                                 <span className="p-1.5 border-y border-r rounded-r bg-gray-50 dark:bg-gray-700 text-gray-500"><Clock size={14}/></span>
                              </div>
                           </div>
                           <div className="md:col-span-3">
                              <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">HORA FIM</label>
                              <div className="flex items-center">
                                 <input type="time" className="w-full p-1.5 text-xs border rounded-l dark:bg-gray-700 bg-gray-50 text-gray-600 cursor-not-allowed" value={state.formData.eventEndTime} readOnly />
                                 <span className="p-1.5 border-y border-r rounded-r bg-gray-50 dark:bg-gray-700 text-gray-500"><Clock size={14}/></span>
                              </div>
                           </div>
                           <div className="md:col-span-3">
                              <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">REGISTRO PPE</label>
                              <input type="text" className="w-full p-1.5 text-xs border rounded border-blue-300 dark:bg-gray-700" value={state.formData.siscobNumber} onChange={e => handleInputChange('siscobNumber', e.target.value)} />
                           </div>
                           <div className="md:col-span-3">
                              <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase">ESTIMATIVA PÚBLICO</label>
                              <input type="number" className="w-full p-1.5 text-xs border rounded border-blue-300 dark:bg-gray-700" value={state.formData.eventPublicEstimate} onChange={e => handleInputChange('eventPublicEstimate', e.target.value)} />
                           </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3 p-3 bg-amber-50/70 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                           <div className="md:col-span-6">
                              <label className="block text-[10px] font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase flex items-center justify-between">
                                 <span>Nota de Serviço (NS)</span>
                                 {state.formData.nsAttachment ? (
                                    <a href={state.formData.nsAttachment} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-[11px] font-bold">Ver Anexo NS</a>
                                 ) : (
                                    <span className="text-amber-700 text-[10px] font-bold">Pendente de Anexo</span>
                                 )}
                              </label>
                              <div className="flex gap-2">
                                 <input 
                                    type="text" 
                                    className="w-full p-1.5 text-xs border rounded dark:bg-gray-700 bg-white dark:text-white" 
                                    placeholder="Nº da Nota de Serviço"
                                    value={state.formData.memoNsNum || ''} 
                                    onChange={(e) => handleInputChange('memoNsNum', e.target.value)} 
                                 />
                                 <button 
                                    type="button" 
                                    onClick={() => handleFileUploadToDrive('NS')} 
                                    className="flex items-center gap-1 px-3 py-1 bg-cbmpa-600 hover:bg-cbmpa-700 text-white rounded text-xs font-bold transition shrink-0"
                                 >
                                    <Upload size={12} /> {state.formData.nsAttachment ? 'Alterar NS' : 'Anexar NS'}
                                 </button>
                              </div>
                           </div>

                           <div className="md:col-span-6">
                              <label className="block text-[10px] font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase flex items-center justify-between">
                                 <span>Boletim Geral (BG) de Publicação</span>
                                 {state.formData.bgAttachment ? (
                                    <a href={state.formData.bgAttachment} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-[11px] font-bold">Ver Anexo BG</a>
                                 ) : (
                                    <span className="text-amber-700 text-[10px] font-bold">Pendente de Anexo</span>
                                 )}
                              </label>
                              <div className="flex gap-2">
                                 <input 
                                    type="text" 
                                    className="w-full p-1.5 text-xs border rounded dark:bg-gray-700 bg-white dark:text-white" 
                                    placeholder="Nº do Boletim Geral"
                                    value={state.formData.memoBgNum || ''} 
                                    onChange={(e) => handleInputChange('memoBgNum', e.target.value)} 
                                 />
                                 <button 
                                    type="button" 
                                    onClick={() => handleFileUploadToDrive('BG')} 
                                    className="flex items-center gap-1 px-3 py-1 bg-cbmpa-600 hover:bg-cbmpa-700 text-white rounded text-xs font-bold transition shrink-0"
                                 >
                                    <Upload size={12} /> {state.formData.bgAttachment ? 'Alterar BG' : 'Anexar BG'}
                                 </button>
                              </div>
                           </div>
                        </div>
                     </div>

                     {/* O seu Relatório original, aprimorado com Permuta */}
                     <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
                        <h3 className="font-bold text-cbmpa-800 border-b pb-2 mb-3 text-sm">2. Alterações no Efetivo / Controle de Presença</h3>
                        <p className="text-[11px] text-gray-500 mb-3">As informações abaixo foram importadas automaticamente da Escala criada.</p>
                        
                        <div className="overflow-visible">
                           <table className="w-full text-xs">
                              <thead className="bg-gray-100 text-[10px] font-bold uppercase text-gray-600">
                                 <tr>
                                    <th className="p-1 text-left">Nome e Posto</th>
                                    <th className="p-1 text-center w-40">Situação (P, F, D, A, Pmt)</th>
                                    <th className="p-1 text-left">Função</th>
                                 </tr>
                              </thead>
                              <tbody>
                                 {(state.formData.reportEffectiveItems || []).map((item, index) => (
                                    <React.Fragment key={item.id}>
                                      <tr className={`border-b border-gray-100 ${item.isCommander ? "bg-yellow-50" : ""} ${item.isAuxiliar ? "bg-blue-50" : ""}`}>
                                         <td className="p-1 font-medium">{item.soldierRank} {item.soldierName}</td>
                                         <td className="p-1 text-center">
                                            <select className="w-full p-0.5 border rounded text-xs" value={item.status} onChange={(e) => handleEffectiveStatusChange(item.id, 'status', e.target.value)}>
                                               <option value="P">PRESENTE</option>
                                               <option value="F">FALTA</option>
                                               <option value="D">DISPENSA</option>
                                               <option value="A">ATRASO</option>
                                               <option value="P/A">PERMUTA/AUTORIZAÇÃO</option>
                                            </select>
                                         </td>
                                         <td className="p-1">
                                            <select className="w-full p-0.5 border rounded dark:bg-gray-700 text-xs" value={item.role || (item.isCommander ? 'Comandante' : item.isAuxiliar ? 'Aux. do Cmt' : '')} onChange={(e) => updateRole(item.id, e.target.value, 'REPORT')}>
                                               <option value="">Selecione Função...</option>
                                               {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                         </td>
                                      </tr>
                                      {/* IMPLEMENTAÇÃO DOS CAMPOS DE PERMUTA, DISPENSA E FALTA AQUI */}
                                      {item.status === 'P/A' && (
                                        <tr className="bg-orange-50 border-b border-orange-100">
                                          <td colSpan={3} className="p-2">
                                            <div className="flex flex-col md:flex-row gap-3 items-end">
                                              <div className="flex-1 relative">
                                                <label className="block text-[10px] font-bold text-orange-800 mb-1">Nome e Matrícula do Substituto</label>
                                                <div className="relative">
                                                   <input type="text" placeholder="Digite nome ou matrícula..." className="w-full p-1.5 border border-orange-300 rounded text-xs pl-7" 
                                                          value={item.substituteName || ''} 
                                                          onFocus={() => {
                                                            setActiveSubstituteId(item.id);
                                                            setSubstituteSuggestions(state.personnelDb.slice(0, 15));
                                                          }}
                                                          onBlur={() => setTimeout(() => setActiveSubstituteId(null), 150)}
                                                          onChange={(e) => handleSubstituteSearchChange(item.id, e)} />
                                                   <Search className="absolute left-2 top-2.5 text-gray-400" size={12} />
                                                </div>
                                                {activeSubstituteId === item.id && substituteSuggestions.length > 0 && (
                                                   <ul className="absolute z-[999] w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-48 overflow-auto mt-1">
                                                      {substituteSuggestions.map(s => (
                                                        <li key={s.matricula} onMouseDown={() => selectSubstitute(item.id, s)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer text-xs border-b border-gray-100 dark:border-gray-600 last:border-0 relative">
                                                           <div className="font-bold">{s.posto} {s.nome}</div>
                                                           <div className="text-[10px] text-gray-500 dark:text-gray-400">Mat: {s.matricula}</div>
                                                        </li>
                                                      ))}
                                                   </ul>
                                                )}
                                              </div>
                                              <div className="flex-1">
                                                <label className="block text-[10px] font-bold text-orange-800 mb-1">Documento Autorizativo</label>
                                                <div className="flex items-center gap-2">
                                                   <button 
                                                     type="button"
                                                     onClick={() => handleItemFileUploadToDrive(item.id, 'substituteAttachment')}
                                                     className="flex items-center gap-1 px-2.5 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded text-[11px] font-bold transition-colors shadow-sm"
                                                   >
                                                      <Upload size={11} /> Anexar Documento
                                                   </button>
                                                   {item.substituteAttachment && (
                                                      <a 
                                                        href={item.substituteAttachment} 
                                                        target="_blank" 
                                                        referrerPolicy="no-referrer"
                                                        rel="noreferrer" 
                                                        className="text-[11px] text-blue-600 hover:underline font-bold flex items-center gap-1 bg-white px-2 py-1 rounded border border-gray-200 shadow-sm"
                                                      >
                                                        Ver Documento Anexado
                                                      </a>
                                                   )}
                                                </div>
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                      {item.status === 'D' && (
                                        <tr className="bg-yellow-50 border-b border-yellow-100">
                                          <td colSpan={4} className="p-2">
                                            <div className="flex flex-col md:flex-row gap-3 items-end">
                                              <div className="flex-1">
                                                <label className="block text-[10px] font-bold text-yellow-800 mb-1">Observação do Motivo (Dispensa)</label>
                                                <input type="text" placeholder="Ex: Dispensa médica..." className="w-full p-1.5 border border-yellow-300 rounded text-xs" 
                                                       value={item.dispensaReason || ''} onChange={(e) => handleEffectiveStatusChange(item.id, 'dispensaReason', e.target.value)} />
                                              </div>
                                              <div className="flex-1">
                                                <label className="block text-[10px] font-bold text-yellow-800 mb-1">Documento de Dispensa (ex: Atestado, se houver)</label>
                                                <div className="flex items-center gap-2">
                                                   <button 
                                                     type="button"
                                                     onClick={() => handleItemFileUploadToDrive(item.id, 'dispensaAttachment')}
                                                     className="flex items-center gap-1 px-2.5 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-[11px] font-bold transition-colors shadow-sm"
                                                   >
                                                      <Upload size={11} /> Anexar Atestado/Doc
                                                   </button>
                                                   {item.dispensaAttachment && (
                                                      <a 
                                                        href={item.dispensaAttachment} 
                                                        target="_blank" 
                                                        referrerPolicy="no-referrer"
                                                        rel="noreferrer" 
                                                        className="text-[11px] text-blue-600 hover:underline font-bold flex items-center gap-1 bg-white px-2 py-1 rounded border border-gray-200 shadow-sm"
                                                      >
                                                        Ver Comprovante Anexado
                                                      </a>
                                                   )}
                                                </div>
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                      {item.status === 'F' && (
                                        <tr className="bg-red-50 border-b border-red-100">
                                          <td colSpan={4} className="p-2">
                                            <div className="flex flex-col md:flex-row gap-3 items-end">
                                              <div className="flex-1">
                                                <label className="block text-[10px] font-bold text-red-800 mb-1">Justificativa da Falta (se houver)</label>
                                                <input type="text" placeholder="Ex: Informou que perdeu ônibus..." className="w-full p-1.5 border border-red-300 rounded text-xs" 
                                                       value={item.faltaJustification || ''} onChange={(e) => handleEffectiveStatusChange(item.id, 'faltaJustification', e.target.value)} />
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                     </div>

                     {/* Section 3: Vítimas / Ocorrências */}
                     <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
                        <h3 className="font-bold text-cbmpa-800 border-b pb-2 mb-3 text-sm">3. Alterações no Serviço (Vítimas/Ocorrências)</h3>
                        
                        {(state.formData.reportServiceItems || []).map((item, index) => (
                           <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3 bg-gray-50 dark:bg-gray-900/50 p-3 rounded border border-gray-200 dark:border-gray-700 relative">
                              <button onClick={() => handleRemoveServiceItem(item.id)} className="absolute top-2 right-2 text-red-500 hover:bg-red-100 p-1 rounded"><Trash2 size={14} /></button>
                              
                              <div className="md:col-span-5">
                                 <label className="block text-[10px] font-bold text-gray-600 mb-1">NOME VÍTIMA</label>
                                 <input type="text" className="w-full p-1.5 text-xs border rounded dark:bg-gray-700" value={item.name} onChange={e => handleServiceItemChange(item.id, 'name', e.target.value)} />
                              </div>
                              <div className="md:col-span-2">
                                 <label className="block text-[10px] font-bold text-gray-600 mb-1">IDADE</label>
                                 <input type="text" placeholder="Ex: 25" className="w-full p-1.5 text-xs border rounded dark:bg-gray-700" value={item.age} onChange={e => handleServiceItemChange(item.id, 'age', e.target.value)} />
                              </div>
                              <div className="md:col-span-2">
                                 <label className="block text-[10px] font-bold text-gray-600 mb-1">SEXO</label>
                                 <select className="w-full p-1.5 text-xs border rounded dark:bg-gray-700" value={item.sex} onChange={e => handleServiceItemChange(item.id, 'sex', e.target.value)}>
                                    <option value="M">M</option>
                                    <option value="F">F</option>
                                 </select>
                              </div>
                              <div className="md:col-span-3">
                                 <label className="block text-[10px] font-bold text-gray-600 mb-1">ESTADO</label>
                                 <select className="w-full p-1.5 text-xs border rounded dark:bg-gray-700" value={item.condition} onChange={e => handleServiceItemChange(item.id, 'condition', e.target.value)}>
                                    <option value="ILESA">ILESA</option>
                                    <option value="FERIDA">FERIDA</option>
                                    <option value="FATAL">FATAL</option>
                                 </select>
                              </div>
                              <div className="md:col-span-12">
                                 <label className="block text-[10px] font-bold text-gray-600 mb-1">CÓD</label>
                                 <select className="w-full p-1.5 text-xs border rounded dark:bg-gray-700" value={item.code} onChange={e => handleServiceItemChange(item.id, 'code', e.target.value)}>
                                    <option value="1 - ESCORIAÇÃO">1 - ESCORIAÇÃO</option>
                                    <option value="2 - CRIANÇA ENCONTRADA">2 - CRIANÇA ENCONTRADA</option>
                                    <option value="3 - PESSOA FERIDA">3 - PESSOA FERIDA</option>
                                    <option value="4 - PESSOA ALCOOLIZADA">4 - PESSOA ALCOOLIZADA</option>
                                    <option value="5 - MAL SÚBITO">5 - MAL SÚBITO</option>
                                    <option value="6 - CURATIVOS">6 - CURATIVOS</option>
                                    <option value="7 - CEFALÉIA">7 - CEFALÉIA</option>
                                    <option value="8 - TRANSP. DE EMERGÊNCIAS">8 - TRANSP. DE EMERGÊNCIAS</option>
                                    <option value="9 - INSOLAÇÃO">9 - INSOLAÇÃO</option>
                                    <option value="10 - HEMORRAGIAS">10 - HEMORRAGIAS</option>
                                    <option value="11 - CARDIORESPIRATÓRIO">11 - CARDIORESPIRATÓRIO</option>
                                    <option value="12 - ACID. COM OBJ. PERFUROCORTANTE">12 - ACID. COM OBJ. PERFUROCORTANTE</option>
                                    <option value="13 - FRATURA / LUXAÇÃO/ENTORSE">13 - FRATURA / LUXAÇÃO/ENTORSE</option>
                                    <option value="14 - LESÃO POR ARMA BRANCA">14 - LESÃO POR ARMA BRANCA</option>
                                    <option value="15 - LESÃO POR ARMA DE FOGO">15 - LESÃO POR ARMA DE FOGO</option>
                                    <option value="16 - BUSCAS">16 - BUSCAS</option>
                                    <option value="17 - CONTENÇÃO DE PAC. PSIQUIÁTRICO">17 - CONTENÇÃO DE PAC. PSIQUIÁTRICO</option>
                                    <option value="18 - AFOGAMENTO (ESPECIFICAR O GRAU)">18 - AFOGAMENTO (ESPECIFICAR O GRAU)</option>
                                    <option value="19 - ACIDENTE COM ANIMAIS">19 - ACIDENTE COM ANIMAIS</option>
                                    <option value="20 - OUTROS">20 - OUTROS</option>
                                 </select>
                              </div>
                           </div>
                        ))}
                        
                        <div className="flex justify-end">
                           <button onClick={handleAddServiceItem} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 rounded text-xs flex items-center gap-2">
                              <Plus size={14} /> ADICIONAR OCORRÊNCIA
                           </button>
                        </div>

                        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-1 text-[10px] text-gray-500 bg-gray-50 dark:bg-gray-900/50 p-4 rounded border border-gray-200 dark:border-gray-700">
                           <div>1-ESCORIAÇÃO</div>
                           <div>2-CRIANÇA ENCONTRADA</div>
                           <div>3-PESSOA FERIDA</div>
                           <div>4-PESSOA ALCOOLIZADA</div>
                           <div>5-MAL SÚBITO</div>
                           <div>6-CURATIVOS</div>
                           <div>7-CEFALÉIA</div>
                           <div>8-TRANSP. DE EMERGÊNCIAS</div>
                           <div>9-INSOLAÇÃO</div>
                           <div>10-HEMORRAGIAS</div>
                           <div>11-CARDIORESPIRATÓRIO</div>
                           <div>12-ACID. COM OBJ. PERFUROCORTANTE</div>
                           <div>13-FRATURA / LUXAÇÃO/ENTORSE</div>
                           <div>14-LESÃO POR ARMA BRANCA</div>
                           <div>15-LESÃO POR ARMA DE FOGO</div>
                           <div>16-BUSCAS</div>
                           <div>17-CONTENÇÃO DE PAC. PSIQUIÁTRICO</div>
                           <div>18-AFOGAMENTO (ESPECIFICAR O GRAU)</div>
                           <div>19-ACIDENTE COM ANIMAIS</div>
                           <div>20-OUTROS</div>
                        </div>
                     </div>

                     {/* Apoio Logístico */}
                     <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
                         <h3 className="font-bold text-cbmpa-800 border-b pb-2 mb-4">4. Apoio Logístico</h3>
                         <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {REPORT_LOGISTICS_ITEMS.filter(i => i !== 'OUTROS').map(item => (
                               <div key={item} onClick={() => toggleLogisticsItem(item)} className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-all ${state.formData.reportLogistics[item]?.used ? 'bg-cbmpa-50 border-cbmpa-200' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-gray-300'}`}>
                                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${state.formData.reportLogistics[item]?.used ? 'bg-cbmpa-600 border-cbmpa-600' : 'bg-white border-gray-400'}`}>
                                     {state.formData.reportLogistics[item]?.used && <Check size={12} className="text-white" />}
                                  </div>
                                  <span className="text-xs font-medium flex-1 dark:text-gray-200">{item}</span>
                                  {state.formData.reportLogistics[item]?.used && (
                                     <input 
                                       type="text" 
                                       className="w-10 h-6 text-xs text-center border rounded dark:bg-gray-800 dark:text-white"
                                       placeholder="Qtd"
                                       onClick={(e) => e.stopPropagation()}
                                       value={state.formData.reportLogistics[item]?.qty || ''}
                                       onChange={(e) => updateLogisticsQty(item, e.target.value)}
                                     />
                                  )}
                               </div>
                            ))}
                         </div>
                         <div className="mt-4">
                            <label className="label">OUTROS (ESPECIFICAR)</label>
                            <input type="text" className="input" value={state.formData.reportOtherLogistics || ''} onChange={(e) => handleInputChange('reportOtherLogistics', e.target.value)} />
                         </div>
                     </div>

                     {/* Viaturas */}
                     <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm border-l-4 border-l-red-500">
                         <h3 className="font-bold text-cbmpa-800 border-b pb-2 mb-4 text-base">5. Viaturas e Embarcações</h3>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {REPORT_VEHICLE_ITEMS.map(item => {
                               const isChecked = !!state.formData.reportVehicles[item]?.used;
                               return (
                                  <div 
                                     key={item} 
                                     onClick={() => toggleVehicleItem(item)} 
                                     className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                        isChecked 
                                           ? 'bg-red-50/70 border-red-400 dark:bg-red-950/20 dark:border-red-500 shadow-sm' 
                                           : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-gray-300'
                                     }`}
                                  >
                                     <div className="flex items-center gap-3">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                           isChecked ? 'bg-red-600 border-red-600' : 'bg-white border-gray-400 dark:bg-gray-800 dark:border-gray-500'
                                        }`}>
                                           {isChecked && <Check size={14} className="text-white font-bold" />}
                                        </div>
                                        <span className={`text-xs font-medium flex-1 ${
                                           isChecked ? 'text-red-950 dark:text-red-100' : 'text-gray-700 dark:text-gray-200'
                                        }`}>{item}</span>
                                     </div>
                                     {isChecked && (
                                        <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                                           <input 
                                              type="text" 
                                              className="w-16 p-1.5 text-xs text-center border rounded bg-white dark:bg-gray-800 dark:text-white border-gray-300 dark:border-gray-600"
                                              placeholder="Qtd"
                                              value={state.formData.reportVehicles[item]?.qty || ''}
                                              onChange={(e) => updateVehicleQty(item, e.target.value)}
                                           />
                                           <input 
                                              type="text" 
                                              className="flex-1 p-1.5 text-xs border rounded bg-white dark:bg-gray-800 dark:text-white border-gray-300 dark:border-gray-600"
                                              placeholder="Origem (Ex: 1º GBM)"
                                              value={state.formData.reportVehicles[item]?.origin || ''}
                                              onChange={(e) => updateVehicleOrigin(item, e.target.value)}
                                           />
                                        </div>
                                     )}
                                  </div>
                               );
                            })}
                         </div>
                         <div className="mt-4">
                            <label className="label">OUTROS (ESPECIFICAR)</label>
                            <input type="text" className="input" value={state.formData.reportOtherVehicles || ''} onChange={(e) => handleInputChange('reportOtherVehicles', e.target.value)} />
                         </div>
                     </div>

                     {/* 6. Considerações do Serviço */}
                     <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm border-t-4 border-t-cbmpa-800">
                        <h3 className="font-bold text-cbmpa-800 border-b pb-2 mb-3 text-sm">6. Considerações do Serviço</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                           <div>
                              <div className="flex items-center justify-between mb-1">
                                 <label className="block text-[10px] font-bold text-gray-600">PONTOS POSITIVOS:</label>
                                 <div className="flex bg-gray-200 rounded overflow-hidden">
                                     <button type="button" onClick={() => handleInputChange('reportPositive', { ...state.formData.reportPositive, has: true })} className={`px-2 py-0.5 text-[10px] font-bold ${state.formData.reportPositive?.has ? 'bg-green-600 text-white' : 'text-gray-600'}`}>SIM</button>
                                     <button type="button" onClick={() => handleInputChange('reportPositive', { ...state.formData.reportPositive, has: false })} className={`px-2 py-0.5 text-[10px] font-bold ${!state.formData.reportPositive?.has ? 'bg-red-600 text-white' : 'text-gray-600'}`}>NÃO</button>
                                 </div>
                              </div>
                              <input type="text" className="w-full p-1.5 text-xs border rounded dark:bg-gray-700 disabled:opacity-50" placeholder="Quais?" disabled={!state.formData.reportPositive?.has} value={state.formData.reportPositive?.text || ''} onChange={(e) => handleInputChange('reportPositive', { ...state.formData.reportPositive, text: e.target.value })} />
                           </div>
                           <div>
                              <div className="flex items-center justify-between mb-1">
                                 <label className="block text-[10px] font-bold text-gray-600">PONTOS NEGATIVOS:</label>
                                 <div className="flex bg-gray-200 rounded overflow-hidden">
                                     <button type="button" onClick={() => handleInputChange('reportNegative', { ...state.formData.reportNegative, has: true })} className={`px-2 py-0.5 text-[10px] font-bold ${state.formData.reportNegative?.has ? 'bg-green-600 text-white' : 'text-gray-600'}`}>SIM</button>
                                     <button type="button" onClick={() => handleInputChange('reportNegative', { ...state.formData.reportNegative, has: false })} className={`px-2 py-0.5 text-[10px] font-bold ${!state.formData.reportNegative?.has ? 'bg-red-600 text-white' : 'text-gray-600'}`}>NÃO</button>
                                 </div>
                              </div>
                              <input type="text" className="w-full p-1.5 text-xs border rounded dark:bg-gray-700 disabled:opacity-50" placeholder="Quais?" disabled={!state.formData.reportNegative?.has} value={state.formData.reportNegative?.text || ''} onChange={(e) => handleInputChange('reportNegative', { ...state.formData.reportNegative, text: e.target.value })} />
                           </div>
                        </div>

                        <div className="space-y-3">
                           <div>
                              <label className="block text-[10px] font-bold text-gray-600 mb-1">QUADRO DE ATIVIDADES SERVIÇO</label>
                              <textarea className="w-full p-1.5 border rounded text-xs dark:bg-gray-700" rows={4} value={state.formData.reportActivities || ''} onChange={(e) => handleInputChange('reportActivities', e.target.value)}></textarea>
                           </div>
                           <div>
                              <label className="block text-[10px] font-bold text-gray-600 mb-1">SERVIÇOS DE PREVENTIVO DE ORIENTAÇÃO E ADVERTÊNCIA</label>
                              <input type="text" className="w-full p-1.5 text-xs border rounded dark:bg-gray-700" value={state.formData.reportGuidance || ''} onChange={(e) => handleInputChange('reportGuidance', e.target.value)} placeholder="HOUVE" />
                           </div>
                           <div>
                              <label className="block text-[10px] font-bold text-gray-600 mb-1">DISTRIBUIÇÃO DO EFETIVO</label>
                              <input type="text" className="w-full p-1.5 text-xs border rounded dark:bg-gray-700" value={state.formData.reportDistribution || ''} onChange={(e) => handleInputChange('reportDistribution', e.target.value)} placeholder="CONFORME NECESSIDADE" />
                           </div>
                           <div>
                              <label className="block text-[10px] font-bold text-gray-600 mb-1">SUGESTÕES</label>
                              <input type="text" className="w-full p-1.5 text-xs border rounded dark:bg-gray-700" value={state.formData.reportSuggestions || ''} onChange={(e) => handleInputChange('reportSuggestions', e.target.value)} placeholder="NADA A DECLARAR" />
                           </div>
                        </div>
                     </div>

                     {/* O resto do seu formulário (Considerações Finais, Fotos) continua operando igual via state.formData */}
                     <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <h3 className="font-bold text-cbmpa-800 border-b pb-2 mb-4">Considerações Finais e Fotos</h3>
                        <textarea className="w-full p-3 border rounded mb-4" rows={4} placeholder="Digite as considerações finais..." value={state.formData.reportFinalConsiderations || ''} onChange={(e) => handleInputChange('reportFinalConsiderations', e.target.value)}></textarea>
                        
                        <div className="grid grid-cols-2 gap-4">
                           {(state.formData.reportPhotos || []).map((photo, index) => (
                              <div key={index} className="border p-2 rounded relative">
                                <label className="block text-xs font-bold mb-1">FOTO {index + 1}</label>
                                <input type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, index)} className="text-xs w-full mb-2" />
                                {photo && <img src={photo} alt="" className="w-full h-32 object-cover rounded" />}
                              </div>
                           ))}
                        </div>
                     </div>

                                     {/* Botões de Ação do Relatório */}
                     <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-wrap justify-between items-center gap-4 mt-6">
                        <button type="button" onClick={() => setActiveTab('PORTAL')} className="px-6 py-2.5 text-gray-600 dark:text-gray-300 font-bold hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600 transition-colors">Cancelar / Voltar</button>
                        <div className="flex flex-wrap items-center gap-3">
                           <button type="button" onClick={() => {
                             const currE = escalas.find(e => e.id === editingEscalaId);
                             window.open(generatePDF(state, currE), '_blank');
                           }} className="border border-red-600 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 px-5 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-colors">
                             <Download size={18}/> Ver PDF Final
                           </button>
                           {(() => {
                             const escala = escalas.find(e => e.id === editingEscalaId);
                             const isCmtOrAux = escala?.comandanteMatricula === currentUser.matricula || escala?.auxiliarMatricula === currentUser.matricula;
                             if (isCmtOrAux && ['em_edicao', 'esclarecimento_solicitado'].includes(escala?.status || '')) {
                               return (
                                 <div className="flex gap-3">
                                   <button type="button" onClick={() => saveEscalaWorkflow(escala.status, 'Relatório salvo com sucesso!', true)} className="bg-cbmpa-700 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-cbmpa-800 transition-colors">
                                     Salvar Relatório
                                   </button>
                                   <button type="button" onClick={() => setShowAtestarConfirmModal(editingEscalaId)} className="bg-green-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-green-700 transition-colors">
                                     Atestar Serviço
                                   </button>
                                 </div>
                               );
                             }
                             return null;
                           })()}
                        </div>
                     </div>
                  </div>
                )}

{/* --- SEÇÃO DE RASTREABILIDADE / ASSINATURAS DO SISTEMA --- */}
                {editingEscalaId && escalas.find(e => e.id === editingEscalaId) && (
                  <div className="mt-8 bg-gray-50 dark:bg-gray-800/80 p-4 rounded-xl border border-gray-200 dark:border-gray-700 text-sm">
                     <h3 className="font-bold text-gray-700 dark:text-gray-300 border-b pb-2 mb-3 flex items-center gap-2">
                        <ShieldCheck size={16} /> Registros de Sistema
                     </h3>
                     <div className="space-y-2 font-mono text-xs text-gray-600 dark:text-gray-400">
                       {escalas.find(e => e.id === editingEscalaId)?.escalaApprovalLabel && (
                         <div className="flex gap-2"><span>[ESCALA]</span> <span>{escalas.find(e => e.id === editingEscalaId)?.escalaApprovalLabel}</span></div>
                       )}
                       {escalas.find(e => e.id === editingEscalaId)?.executionApprovalLabel && (
                         <div className="flex gap-2 text-blue-600 dark:text-blue-400"><span>[RELATÓRIO]</span> <span>{escalas.find(e => e.id === editingEscalaId)?.executionApprovalLabel}</span></div>
                       )}
                       {escalas.find(e => e.id === editingEscalaId)?.homologationLabel && (
                         <div className="flex gap-2 text-green-600 dark:text-green-400"><span>[HOMOLOGAÇÃO]</span> <span>{escalas.find(e => e.id === editingEscalaId)?.homologationLabel}</span></div>
                       )}
                       {escalas.find(e => e.id === editingEscalaId)?.paymentLaunchLabel && (
                         <div className="flex gap-2 text-purple-600 dark:text-purple-400"><span>[LANÇAMENTO]</span> <span>{escalas.find(e => e.id === editingEscalaId)?.paymentLaunchLabel}</span></div>
                       )}
                     </div>
                  </div>
                )}
                </fieldset>
              </div>
            </div>

            

          </div>
        )}

        {/* Modal de Consulta de Escala (Totalmente Read-Only) */}
        {consultingEscalaId && (
          (() => {
            const esc = escalas.find(e => e.id === consultingEscalaId);
            if (!esc) return null;
            const formattedDate = esc.formData.eventDate ? formatAnyDate(esc.formData.eventDate) : 'N/A';
            return (
              <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm p-4 sm:p-6 flex justify-center items-start">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl w-full max-w-4xl shadow-2xl border border-gray-200 dark:border-gray-700 my-4 sm:my-8">
                   <div className="flex justify-between items-center mb-4 border-b pb-4 border-gray-200 dark:border-gray-700">
                      <div>
                         <span className="text-[10px] font-bold text-cbmpa-700 dark:text-yellow-500 uppercase tracking-widest block mb-1">Visualização e Consulta de Escala</span>
                         <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                            <ClipboardList className="text-cbmpa-700 dark:text-yellow-500" size={24} />
                            {esc.formData.operationName || esc.formData.eventName || 'Sem Nome'}
                         </h2>
                      </div>
                      <button onClick={() => setConsultingEscalaId(null)} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white p-2">
                         <X size={24} />
                      </button>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-sm">
                      <div className="bg-gray-50 dark:bg-gray-900/40 p-3 rounded-lg border dark:border-gray-700">
                         <span className="text-xs text-gray-400 font-bold block uppercase mb-1">Local</span>
                         <span className="font-semibold text-gray-800 dark:text-gray-200">{esc.formData.eventLocal || 'Não informado'}</span>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-900/40 p-3 rounded-lg border dark:border-gray-700">
                         <span className="text-xs text-gray-400 font-bold block uppercase mb-1">Data / Horário</span>
                         <span className="font-semibold text-gray-800 dark:text-gray-200">{formattedDate} - {esc.formData.eventStartTime || '08:00'} às {esc.formData.eventEndTime || '17:00'}</span>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-900/40 p-3 rounded-lg border dark:border-gray-700">
                         <span className="text-xs text-gray-400 font-bold block uppercase mb-1">UBM de Origem</span>
                         <span className="font-semibold text-gray-800 dark:text-gray-200">{esc.formData.ubmOrigem || esc.formData.issuerUbm || 'COP'}</span>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-900/40 p-3 rounded-lg border dark:border-gray-700">
                         <span className="text-xs text-gray-400 font-bold block uppercase mb-1">Status da Jornada</span>
                         <div className="mt-1">{renderBadge(esc.status)}</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-900/40 p-3 rounded-lg border dark:border-gray-700 md:col-span-2">
                         <span className="text-xs text-gray-400 font-bold block uppercase mb-1">Controle de Pagamento</span>
                         <span className="font-semibold text-gray-800 dark:text-gray-200 block mt-1">
                            {esc.launchedByLabel ? `Lançado por: ${esc.launchedByLabel}` : esc.launchedByName ? `Lançado por: ${esc.launchedByName} em ${esc.launchedAt}` : 'Aguardando processamento de pagamento'}
                         </span>
                      </div>
                   </div>

                   {/* Links para os Documentos Finais do App */}
                   <div className="mb-6 p-4 bg-red-50/30 dark:bg-red-950/10 rounded-lg border border-red-100 dark:border-red-900/30">
                      <span className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wider block mb-3">Documentos Oficiais Gerados</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                         <button onClick={() => openDocumentInNewTab('MEMO', esc)} className="bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 border text-gray-700 dark:text-gray-200 p-2.5 rounded font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition"><FileText size={14} className="text-red-600"/> Memorando</button>
                         <button onClick={() => openDocumentInNewTab('ESCALA', esc)} className="bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 border text-gray-700 dark:text-gray-200 p-2.5 rounded font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition"><FileText size={14} className="text-blue-600"/> Escala</button>
                         
                         {(() => {
                            const isAvailable = esc.status === 'atestado' || esc.status === 'homologado' || esc.status === 'lancado';
                            return (
                               <>
                                 <button 
                                   disabled={!isAvailable} 
                                   title={isAvailable ? "" : "Disponível apenas após o Atestado de Execução"}
                                   onClick={() => openDocumentInNewTab('RELATORIO', esc)} 
                                   className={`bg-white dark:bg-gray-900 border text-gray-700 dark:text-gray-200 p-2.5 rounded font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition ${isAvailable ? 'hover:bg-gray-50 dark:border-gray-700' : 'opacity-40 cursor-not-allowed border-gray-100'}`}
                                 >
                                   <FileText size={14} className={isAvailable ? "text-green-600" : "text-gray-400"}/> 
                                   Relatório
                                 </button>
                                 <button 
                                   disabled={!isAvailable} 
                                   title={isAvailable ? "" : "Disponível apenas após o Atestado de Execução"}
                                   onClick={() => openDocumentInNewTab('CUSTOS', esc)} 
                                   className={`bg-white dark:bg-gray-900 border text-gray-700 dark:text-gray-200 p-2.5 rounded font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition ${isAvailable ? 'hover:bg-gray-50 dark:border-gray-700' : 'opacity-40 cursor-not-allowed border-gray-100'}`}
                                 >
                                   <FileText size={14} className={isAvailable ? "text-purple-600" : "text-gray-400"}/> 
                                   Planilha Custos
                                 </button>
                               </>
                            );
                         })()}
                      </div>
                   </div>

                   {/* Efetivo militar */}
                   <div className="mb-6">
                    {/* Registro de Assinaturas e Autenticidade Digital */}
                    {(esc.escalaApprovalLabel || esc.executionApprovalLabel || esc.homologationLabel || esc.paymentLaunchLabel) && (
                       <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900/60 rounded-lg border border-gray-200 dark:border-gray-700">
                          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-3">Registro de Autenticação Digital (Rastreabilidade)</span>
                          <div className="space-y-2.5 text-xs font-mono">
                             {esc.escalaApprovalLabel && (
                                <div className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                                   <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded font-bold uppercase text-[10px] shrink-0">[ESCALA]</span>
                                   <span className="mt-0.5">{esc.escalaApprovalLabel}</span>
                                </div>
                             )}
                             {esc.executionApprovalLabel && (
                                <div className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                                   <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded font-bold uppercase text-[10px] shrink-0">[RELATÓRIO]</span>
                                   <span className="mt-0.5">{esc.executionApprovalLabel}</span>
                                </div>
                             )}
                             {esc.homologationLabel && (
                                <div className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                                   <span className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-2 py-0.5 rounded font-bold uppercase text-[10px] shrink-0">[HOMOLOGAÇÃO]</span>
                                   <span className="mt-0.5">{esc.homologationLabel}</span>
                                </div>
                             )}
                             {esc.paymentLaunchLabel && (
                                <div className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                                   <span className="bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 px-2 py-0.5 rounded font-bold uppercase text-[10px] shrink-0">[LANÇAMENTO]</span>
                                   <span className="mt-0.5">{esc.paymentLaunchLabel}</span>
                                </div>
                             )}
                          </div>
                       </div>
                    )}

                      <h4 className="font-bold text-sm text-gray-700 dark:text-gray-300 mb-2 border-b pb-1">Militares Escalados</h4>
                      <div className="max-h-60 overflow-y-auto border dark:border-gray-700 rounded-lg">
                         <table className="w-full text-xs text-left">
                            <thead className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold uppercase">
                               <tr>
                                  <th className="p-2">MF (Matrícula)</th>
                                  <th className="p-2">Posto/Graduação</th>
                                  <th className="p-2">Nome do Militar</th>
                                  <th className="p-2">Função</th>
                                  <th className="p-2 text-center">Status de Lançamento</th>
                               </tr>
                            </thead>
                            <tbody>
                               {(esc.formData.costSheetItems || []).map((m: any) => (
                                  <tr key={m.id} className="border-b dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-900/40">
                                     <td className="p-2 font-mono">{m.soldierMatricula}</td>
                                     <td className="p-2">{m.soldierRank}</td>
                                     <td className="p-2 font-bold">{m.soldierName}</td>
                                     <td className="p-2">{m.isCommander ? 'Comandante' : m.isAuxiliar ? 'Aux. do Cmt' : m.role || 'Militar'}</td>
                                     <td className="p-2 text-center">
                                        {m.isLaunched ? (
                                           <span className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Lançado</span>
                                        ) : (
                                           <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Pendente</span>
                                        )}
                                     </td>
                                  </tr>
                               ))}
                            </tbody>
                         </table>
                      </div>
                   </div>

                   <div className="flex justify-end gap-2 border-t pt-4 dark:border-gray-700">
                      <button onClick={() => setConsultingEscalaId(null)} className="px-6 py-2 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white rounded-lg font-bold hover:bg-gray-200 dark:hover:bg-gray-600 text-sm transition">Fechar Consulta</button>
                   </div>
                </div>
              </div>
            );
          })()
        )}

        {/* Modal de Confirmação de Atesto de Execução */}
        {showAtestarConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
             <div className="bg-white dark:bg-gray-800 p-6 rounded-xl w-full max-w-md shadow-2xl border border-gray-200 dark:border-gray-700">
                <div className="text-red-600 dark:text-red-400 mb-4 flex justify-center">
                   <AlertTriangle size={48} className="animate-pulse" />
                </div>
                <h3 className="text-lg font-bold text-center text-gray-900 dark:text-white mb-2">Atestar Execução do Serviço</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 text-justify mb-6 leading-relaxed">
                   <strong>Atenção:</strong> Ao atestar a execução, o relatório de serviço será assinado eletronicamente por você e enviado ao Homologador para aprovação final. 
                   <span className="block mt-2 font-bold text-red-600 dark:text-red-400">Esta ação é irreversível e você não poderá fazer nenhuma alteração posterior nos dados do relatório ou da escala.</span>
                   Deseja realmente assinar eletronicamente e concluir?
                </p>
                <div className="flex gap-3 justify-end">
                   <button onClick={() => setShowAtestarConfirmModal(null)} className="flex-1 px-4 py-2 border rounded-lg font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">Cancelar</button>
                   <button onClick={async () => {
                      const id = showAtestarConfirmModal;
                      setShowAtestarConfirmModal(null);
                      await saveEscalaWorkflow('atestado', 'Relatório assinado e enviado para homologação!');
                   }} className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition">Atestar e Enviar</button>
                </div>
             </div>
          </div>
        )}
      </main>
    </div>
  );
};
export default App;