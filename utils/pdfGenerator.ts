
import { AppState, DocumentType } from '../types';
import { MEMO_LEGAL_TEXT, REPORT_LOGISTICS_ITEMS, REPORT_VEHICLE_ITEMS, OCCURRENCE_CODES } from '../constants';
import { CBMPA_LOGO_BASE64, DEFESA_CIVIL_LOGO_BASE64 } from './logoBase64';

const { jsPDF } = window.jspdf;

const getAbbreviatedRank = (rank: string): string => {
  const r = (rank || '').toUpperCase().trim();
  if (!r || r === '-') return '-';

  // Extract core abbreviation
  let core = '';
  if (r.includes('TENENTE CORONEL') || r.includes('TENENTE-CORONEL') || r.includes('TCEL') || r.includes('TEN CORONEL') || r.includes('T.CEL')) {
    core = 'TCEL';
  } else if (r.includes('CORONEL') || r.includes('CEL')) {
    core = 'CEL';
  } else if (r.includes('MAJOR') || r.includes('MAJ')) {
    core = 'MAJ';
  } else if (r.includes('CAPITÃO') || r.includes('CAPITAO') || r.includes('CAP')) {
    core = 'CAP';
  } else if (
    r.includes('1º TENENTE') || r.includes('1O TENENTE') || r.includes('1 TENENTE') ||
    r.includes('1º TEN') || r.includes('1O TEN') || r.includes('1 TEN')
  ) {
    core = '1º TEN';
  } else if (
    r.includes('2º TENENTE') || r.includes('2O TENENTE') || r.includes('2 TENENTE') ||
    r.includes('2º TEN') || r.includes('2O TEN') || r.includes('2 TEN')
  ) {
    core = '2º TEN';
  } else if (
    r.includes('SUBTENENTE') || r.includes('SUB TENENTE') || r.includes('SUB-TENENTE') ||
    r.includes('SUB TEN') || r.includes('ST')
  ) {
    core = 'SUB TEN';
  } else if (
    r.includes('1º SARGENTO') || r.includes('1O SARGENTO') || r.includes('1 SARGENTO') ||
    r.includes('1º SGT') || r.includes('1O SGT') || r.includes('1 SGT')
  ) {
    core = '1º SGT';
  } else if (
    r.includes('2º SARGENTO') || r.includes('2O SARGENTO') || r.includes('2 SARGENTO') ||
    r.includes('2º SGT') || r.includes('2O SGT') || r.includes('2 SGT')
  ) {
    core = '2º SGT';
  } else if (
    r.includes('3º SARGENTO') || r.includes('3O SARGENTO') || r.includes('3 SARGENTO') ||
    r.includes('3º SGT') || r.includes('3O SGT') || r.includes('3 SGT')
  ) {
    core = '3º SGT';
  } else if (r.includes('CABO') || r.includes('CB')) {
    core = 'CB';
  } else if (r.includes('SOLDADO') || r.includes('SD')) {
    core = 'SD';
  } else {
    // Fallback if no known rank found
    return r;
  }

  // Determine cadre
  let cadre = '';
  if (r.includes('QOABM')) {
    cadre = 'QOABM';
  } else if (r.includes('QOCBM')) {
    cadre = 'QOCBM';
  } else if (r.includes('QOSBM')) {
    cadre = 'QOSBM';
  } else if (r.includes('QOBM')) {
    cadre = 'QOBM';
  } else if (r.includes('QPBM')) {
    cadre = 'QPBM';
  } else if (r.includes('QBM')) {
    // If original had QBM (which was used for praças in RANKS), map to QPBM
    if (['SUB TEN', '1º SGT', '2º SGT', '3º SGT', 'CB', 'SD'].includes(core)) {
      cadre = 'QPBM';
    } else {
      cadre = 'QOBM';
    }
  } else {
    // Guess based on core rank if not specified
    const isOfficer = ['CEL', 'TCEL', 'MAJ', 'CAP', '1º TEN', '2º TEN'].includes(core);
    cadre = isOfficer ? 'QOBM' : 'QPBM';
  }

  return `${core} ${cadre}`;
};

export const getUbmOrigemFullName = (ubm: string): string => {
  const u = (ubm || '').toUpperCase().trim();
  if (!u || u === 'COP') return 'COMANDO OPERACIONAL';

  if (u === 'QCG') return 'QUARTEL DO COMANDO GERAL';
  if (u.includes('AJG')) return 'AJUDÂNCIA GERAL DO QCG';
  if (u.includes('CSMV/MOP') || u.includes('CSMV')) return 'CENTRO DE SUPRIMENTO E MANUTENÇÃO DE VIATURAS E MATERIAIS OPERACIONAIS';
  if (u === 'CFAE') return 'CENTRO DE FORMAÇÃO, APERFEIÇOAMENTO E ESPECIALIZAÇÃO';
  if (u === 'ABM') return 'ACADEMIA BOMBEIRO MILITAR';
  if (u === 'CAT') return 'CENTRO DE ATIVIDADES TÉCNICAS';

  if (u.includes('GBM')) {
    return u.replace('GBM', 'GRUPAMENTO BOMBEIRO MILITAR').trim();
  }
  if (u.includes('GPA')) {
    return u.replace('GPA', 'GRUPAMENTO DE PROTEÇÃO AMBIENTAL').trim();
  }
  if (u.includes('GMAF')) {
    return u.replace('GMAF', 'GRUPAMENTO MARÍTIMO FLUVIAL').trim();
  }
  if (u.includes('GBS')) {
    return u.replace('GBS', 'GRUPAMENTO DE BUSCA E SALVAMENTO').trim();
  }
  if (u.includes('GSE')) {
    return u.replace('GSE', 'GRUPAMENTO DE SOCORRO E EMERGÊNCIA').trim();
  }

  return u;
};

const formatDateShortDDMM = (dStr: string) => {
  if (!dStr) return '';
  const clean = dStr.trim();
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length >= 2) return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
  }
  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
  }
  return clean;
};

const addCbmpaHeader = (doc: any, isLandscape = false, fontSizeOverride?: number, state?: AppState) => {
  const centerX = isLandscape ? 148.5 : 105;
  
  // Draw CBMPA Logo on the left
  try {
    doc.addImage(CBMPA_LOGO_BASE64, 'PNG', 15, 10, 18, 18);
  } catch (e) {
    console.error("Error drawing CBMPA logo:", e);
  }

  // Draw Defesa Civil Logo right next to it, sized and aligned proportionally
  try {
    doc.addImage(DEFESA_CIVIL_LOGO_BASE64, 'PNG', 35, 11.5, 15, 15);
  } catch (e) {
    console.error("Error drawing Defesa Civil logo:", e);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSizeOverride || (isLandscape ? 10 : 11));
  doc.setTextColor(0, 0, 0);
  
  doc.text("CORPO DE BOMBEIROS MILITAR DO PARÁ E", centerX, 14, { align: "center" });
  doc.text("COORDENADORIA ESTADUAL DE DEFESA CIVIL", centerX, 19, { align: "center" });
  
  const ubmOrigem = state?.formData?.ubmOrigem || state?.formData?.issuerUbm || '';
  const ubmText = getUbmOrigemFullName(ubmOrigem);
  doc.text(ubmText, centerX, 24, { align: "center" });
};

const formatDateFull = (dateStr: string) => {
  if (!dateStr) return "";
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  
  const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('pt-BR', options).toUpperCase();
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "";
  const clean = dateStr.trim();
  if (clean.includes('/')) return clean;
  const parts = clean.split('-');
  if (parts.length === 2) {
    const months = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    const idx = parseInt(parts[1], 10) - 1;
    return `${months[idx] || parts[1]}/${parts[0]}`;
  }
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  return clean;
};

const formatCurrency = (val: number) => {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const getDatesInRangeForPDF = (startStr?: string, endStr?: string) => {
  if (!startStr || !endStr) return [];
  try {
    const current = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');
    if (isNaN(current.getTime()) || isNaN(end.getTime()) || current > end) return [];
    
    const dates: { iso: string; formatted: string; weekDay: string }[] = [];
    const daysOfWeek = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'];
    let count = 0;
    while (current <= end && count < 62) {
      const iso = current.toISOString().split('T')[0];
      const day = String(current.getDate()).padStart(2, '0');
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const year = current.getFullYear();
      const formatted = `${day}/${month}/${year}`;
      const weekDay = daysOfWeek[current.getDay()];
      dates.push({ iso, formatted, weekDay });
      current.setDate(current.getDate() + 1);
      count++;
    }
    return dates;
  } catch {
    return [];
  }
};

const isDateMatchForPDF = (itemDateStr: string, targetDay: { iso: string; formatted: string }) => {
  if (!itemDateStr) return false;
  const clean = itemDateStr.trim();
  if (!clean) return false;
  if (clean === targetDay.formatted || clean === targetDay.iso) return true;

  if (clean.includes('-')) {
    const [y, m, day] = clean.split('-');
    if (y && m && day) {
      const formattedFromIso = `${day.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
      if (formattedFromIso === targetDay.formatted) return true;
    }
  } else if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 2) {
      const shortTarget = targetDay.formatted.substring(0, 5);
      if (`${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}` === shortTarget) return true;
    } else if (parts.length === 3) {
      const formattedFromSlash = `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
      if (formattedFromSlash === targetDay.formatted) return true;
    }
  }
  return false;
};

const getShiftForDayForPDF = (item: any, targetDay: { iso: string; formatted: string }) => {
  if (!item.dayShifts) return item.shift || '1º Turno';
  if (item.dayShifts[targetDay.formatted]) return item.dayShifts[targetDay.formatted];
  if (item.dayShifts[targetDay.iso]) return item.dayShifts[targetDay.iso];
  
  for (const k of Object.keys(item.dayShifts)) {
    if (isDateMatchForPDF(k, targetDay)) {
      return item.dayShifts[k];
    }
  }
  return item.shift || '1º Turno';
};

const toTitleCase = (str: string) => {
  if (!str) return "";
  return str.toLowerCase().split(' ').map((word, index) => {
    if (index === 0) return word.charAt(0).toUpperCase() + word.slice(1);
    if (['ii', 'iii', 'iv'].includes(word)) return word.toUpperCase();
    if (['da', 'de', 'do', 'das', 'dos', 'e'].includes(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
};

const drawSignatureWithBoldHighlight = (doc: any, name: string, warName: string, rank: string, x: number, y: number) => {
  const rankUpper = getAbbreviatedRank(rank);
  const nameTitleCase = toTitleCase((name || '').trim());
  const warNameClean = (warName || '').trim().replace(/\./g, '');
  
  const fullWords = nameTitleCase.split(' ');
  const warTokens = warNameClean.toLowerCase().split(' ');

  let segments: { text: string, bold: boolean }[] = [];

  fullWords.forEach((word, index) => {
    if (index > 0) segments.push({ text: " ", bold: false });
    const lowerWord = word.toLowerCase();
    const matchingToken = warTokens.find(token => {
      if (token === lowerWord) return true;
      if (token.length === 1 && lowerWord.startsWith(token)) return true;
      return false;
    });

    if (matchingToken) {
      if (matchingToken.length === 1 && lowerWord.length > 1) {
        segments.push({ text: word.charAt(0), bold: true });
        segments.push({ text: word.slice(1), bold: false });
      } else {
        segments.push({ text: word, bold: true });
      }
    } else {
      segments.push({ text: word, bold: false });
    }
  });

  segments.push({ text: " – ", bold: false });
  segments.push({ text: rankUpper, bold: true });

  doc.setFontSize(11);
  let totalWidth = 0;
  segments.forEach(seg => {
    doc.setFont("helvetica", seg.bold ? "bold" : "normal");
    totalWidth += doc.getTextWidth(seg.text);
  });

  let currentX = x - (totalWidth / 2);
  segments.forEach(seg => {
    doc.setFont("helvetica", seg.bold ? "bold" : "normal");
    doc.text(seg.text, currentX, y);
    currentX += doc.getTextWidth(seg.text);
  });
};

export const addTraceabilityFooters = (doc: any, isLandscape: boolean, extraData?: any, currentUbm?: string) => {
  const pageCount = doc.internal.getNumberOfPages();
  const width = isLandscape ? 297 : 210;
  const height = isLandscape ? 210 : 297;
  const centerX = width / 2;
  const ubmText = getUbmOrigemFullName(currentUbm || 'COP');

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 140);
    
    // Draw UBM name centered at footer margin
    let currentY = height - 12;
    doc.text(ubmText, centerX, currentY, { align: 'center' });
  }
};

import { getEffectiveCostItems } from "./costHelpers";

export const generateEscalaOnlyPDF = (
  state: AppState, 
  returnBlob: boolean = false, 
  escalante?: any, 
  escalaApprovalLabel?: string,
  periodFilter?: { startDate?: string; endDate?: string }
) => {
  const { formData } = state;
  const doc = new jsPDF();
  addCbmpaHeader(doc, false, 9, state);
  
  const isContinuousService = formData.serviceType === 'DIVERSOS';

  // Faixa de título destacada
  const title = `PREVENÇÃO DURANTE O EVENTO ${formData.operationName?.toUpperCase() || formData.servicoDiversosSubTipo?.toUpperCase() || formData.eventName?.toUpperCase() || ''}`;
  doc.setFillColor(248, 218, 69);
  doc.rect(14, 30, 182, 8, 'F');
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(title, 105, 35.5, { align: 'center' });

  // Bloco de informações do serviço
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("LOCAL:", 14, 45);
  doc.setFont("helvetica", "normal");
  doc.text(formData.eventLocal || '-', 30, 45);

  let currentY = 50;

  if (isContinuousService) {
    doc.setFont("helvetica", "bold");
    doc.text("TURNOS:", 14, currentY);
    doc.setFont("helvetica", "normal");
    
    const shiftsText = (formData.shifts && formData.shifts.length > 0)
      ? formData.shifts.map((s, idx) => `${s.name || `${idx + 1}º Turno`}: ${s.startTime || '07:00'} às ${s.endTime || '13:00'}`).join(' | ')
      : '1º Turno: 07:00 às 13:00 | 2º Turno: 13:00 às 19:00';
    
    const splitShifts = doc.splitTextToSize(shiftsText, 150);
    doc.text(splitShifts, 32, currentY);
    currentY += (splitShifts.length * 4.5) + 1.5;

    doc.setFont("helvetica", "bold");
    doc.text("PERÍODO:", 14, currentY);
    doc.setFont("helvetica", "normal");
    
    const filterStart = periodFilter?.startDate;
    const filterEnd = periodFilter?.endDate;
    const isFilteredPeriod = Boolean(filterStart || filterEnd);

    const pIni = filterStart ? formatDate(filterStart) : (formData.periodoInicio ? formatDate(formData.periodoInicio) : '-');
    const pFim = filterEnd ? formatDate(filterEnd) : (formData.periodoFim ? formatDate(formData.periodoFim) : '-');
    const refM = formData.referenciaMes ? ` | MÊS DE REF: ${formData.referenciaMes}` : '';
    const partialLabel = isFilteredPeriod ? ' (DIVULGAÇÃO DO PERÍODO DA TROPA)' : '';

    doc.text(`${pIni} A ${pFim}${refM}${partialLabel}`, 32, currentY);
    currentY += 5;

    doc.setFont("helvetica", "bold");
    doc.text("UNIFORME:", 14, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(formData.uniform || "4º A - PRONTIDÃO COMPLETO;", 36, currentY);
    currentY += 8;

    // Obter dias do período
    let datesList = getDatesInRangeForPDF(
      filterStart || formData.periodoInicio,
      filterEnd || formData.periodoFim
    );
    
    const uniqueFormattedDates = new Map<string, { iso: string; formatted: string; weekDay: string }>();
    datesList.forEach(d => { if (d.formatted) uniqueFormattedDates.set(d.formatted, d); });

    (formData.costSheetItems || []).forEach(item => {
      const itemDates = item.datesList && item.datesList.length > 0
        ? item.datesList
        : (item.date ? item.date.split(',').map((s: string) => s.trim()) : []);
      itemDates.forEach(dStr => {
        const formatted = formatDate(dStr);
        if (formatted && !formatted.includes('undefined')) {
          const parts = formatted.split('/');
          const iso = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dStr;
          
          if (isFilteredPeriod) {
            if (filterStart && iso < filterStart) return;
            if (filterEnd && iso > filterEnd) return;
          }

          if (!uniqueFormattedDates.has(formatted)) {
            const daysOfWeek = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'];
            let weekDay = '';
            if (iso) {
              const dt = new Date(iso + 'T00:00:00');
              if (!isNaN(dt.getTime())) weekDay = daysOfWeek[dt.getDay()];
            }
            uniqueFormattedDates.set(formatted, { iso, formatted, weekDay });
          }
        }
      });
    });

    datesList = Array.from(uniqueFormattedDates.values()).sort((a, b) => {
      const parseDate = (str: string) => {
        const p = str.split('/');
        return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : str;
      };
      return parseDate(a.formatted).localeCompare(parseDate(b.formatted));
    });

    datesList.forEach((d) => {
      if (currentY > 230) {
        doc.addPage();
        addCbmpaHeader(doc, false, 9, state);
        currentY = 35;
      }

      // Banner do Dia
      doc.setFillColor(240, 240, 240);
      doc.rect(14, currentY, 182, 6, 'F');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.text(`ESCALA DO DIA ${d.formatted}${d.weekDay ? ` - ${d.weekDay}` : ''}`, 105, currentY + 4.2, { align: 'center' });
      currentY += 7;

      // Militares escalados no dia d
      const dayItems = (formData.costSheetItems || []).filter(item => {
        const itemDates = item.datesList && item.datesList.length > 0
          ? item.datesList
          : (item.date ? item.date.split(',').map(s => s.trim()) : []);
        return itemDates.some(idStr => isDateMatchForPDF(idStr, d));
      });

      dayItems.sort((a, b) => {
        const shiftA = getShiftForDayForPDF(a, d);
        const shiftB = getShiftForDayForPDF(b, d);
        return shiftA.localeCompare(shiftB, undefined, { numeric: true });
      });

      const tableData: any = [];
      dayItems.forEach((item) => {
        let roleStr = item.role || (item.isCommander ? 'Comandante' : (item.isAuxiliar ? 'Aux. do Cmt' : ''));
        if (!roleStr && formData.serviceType === 'DIVERSOS') {
          const sub = formData.servicoDiversosSubTipo || '';
          if (sub === 'Reforço da Guarda') roleStr = 'Componente da Guarda';
          else if (sub === 'Reforço Operacional') roleStr = 'Componente de GU';
          else if (sub === 'Reforço Administrativo') roleStr = 'Reforço adm';
          else if (sub === 'Guarda-vidas') roleStr = 'Guarda-vidas';
          else roleStr = 'Componente';
        }
        if (!roleStr) roleStr = 'Componente';

        const itemTurn = getShiftForDayForPDF(item, d);
        tableData.push([
          itemTurn.toUpperCase(),
          getAbbreviatedRank(item.soldierRank || '-'),
          (item.soldierName || '').toUpperCase(),
          item.soldierMatricula,
          item.soldierUbm || formData.ubmOrigem || formData.issuerUbm || 'CBMPA',
          roleStr.toUpperCase()
        ]);
      });

      if (dayItems.length === 0) {
        tableData.push([
          { content: 'NENHUM MILITAR ESCALADO NESTE DIA', colSpan: 6, styles: { halign: 'center', fontStyle: 'italic', textColor: [120, 120, 120] } }
        ]);
      } else {
        tableData.push([
          { content: 'EFETIVO DO DIA', colSpan: 5, styles: { halign: 'center', fillColor: [248, 218, 69], fontStyle: 'bold' } },
          { content: `${dayItems.length}`, styles: { halign: 'center', fillColor: [248, 218, 69], fontStyle: 'bold' } }
        ]);
      }

      (doc as any).autoTable({
        startY: currentY,
        head: [['TURNO', 'GRADUAÇÃO', 'NOME DO MILITAR', 'MF', 'UBM', 'FUNÇÃO']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2, textColor: [0, 0, 0] },
        headStyles: { fillColor: [248, 218, 69], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
          0: { halign: 'center', cellWidth: 25 },
          1: { halign: 'center', cellWidth: 25 },
          2: { halign: 'left' },
          3: { halign: 'center', cellWidth: 22 },
          4: { halign: 'center', cellWidth: 20 },
          5: { halign: 'center', cellWidth: 25 }
        }
      });

      currentY = (doc as any).lastAutoTable.finalY + 6;
    });

  } else {
    // Serviço normal (tabela única)
    doc.setFont("helvetica", "bold");
    doc.text("HORÁRIO:", 14, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(`${formData.eventStartTime || '-'} às ${formData.eventEndTime || '-'}`, 34, currentY);

    doc.setFont("helvetica", "bold");
    doc.text("UNIFORME:", 14, currentY + 5);
    doc.setFont("helvetica", "normal");
    doc.text(formData.uniform || "4º A - PRONTIDÃO COMPLETO;", 36, currentY + 5);

    // Subtítulo de data/turno
    doc.setFillColor(240, 240, 240);
    doc.rect(14, currentY + 10, 182, 6, 'F');
    doc.setFont("helvetica", "bold");
    const endTimeStr = formData.eventEndTime ? `ÀS ${formData.eventEndTime}` : 'AO TÉRMINO DO EVENTO';
    doc.text(`${formatDateFull(formData.eventDate)} - TURNO (${formData.eventStartTime || '-'} ${endTimeStr})`, 105, currentY + 14, { align: 'center' });

    // Tabela
    const tableData: any = [];
    (formData.costSheetItems || []).forEach((item, index) => {
      let roleStr = item.role || (item.isCommander ? 'CMT' : (item.isAuxiliar ? 'AUXILIAR' : 'PREVENÇÃO'));
      tableData.push([
        (index + 1).toString(),
        getAbbreviatedRank(item.soldierRank || '-'),
        (item.soldierName || '').toUpperCase(),
        item.soldierMatricula,
        item.soldierUbm,
        roleStr.toUpperCase()
      ]);
    });
    
    tableData.push([
      { content: 'EFETIVO TOTAL', colSpan: 5, styles: { halign: 'center', fillColor: [248, 218, 69], fontStyle: 'bold' } },
      { content: `${(formData.costSheetItems || []).length}`, styles: { halign: 'center', fillColor: [248, 218, 69], fontStyle: 'bold' } }
    ]);

    (doc as any).autoTable({
      startY: currentY + 20,
      head: [['ORDEM', 'GRADUAÇÃO', 'NOME DO MILITAR', 'MF', 'UBM', 'FUNÇÃO']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2, textColor: [0, 0, 0] },
      headStyles: { fillColor: [248, 218, 69], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        1: { halign: 'center', cellWidth: 25 },
        2: { halign: 'left' },
        3: { halign: 'center', cellWidth: 25 },
        4: { halign: 'center', cellWidth: 22 },
        5: { halign: 'center', cellWidth: 25 }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY;
  }

  const finalY = currentY + 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  
  if (formData.memoNsNum && formData.memoNsYear) {
    doc.setFont("helvetica", "bold");
    const bgText = (formData.memoBgNum && formData.memoBgYear) ? ` | BG Nº ${formData.memoBgNum}/${formData.memoBgYear}` : '';
    doc.text(`FONTE: NOTA SERVIÇO: ${formData.memoNsNum}/${formData.memoNsYear} - SEOP/COP${bgText}`, 14, finalY + 10);
    doc.setFont("helvetica", "normal");
  }
  
  let dateToUse = new Date();
  if (formData.eventDate) {
    const parsed = new Date(formData.eventDate + 'T00:00:00');
    if (!isNaN(parsed.getTime())) {
      dateToUse = parsed;
    }
  }
  const monthNames = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
  const dateFullStr = `BELÉM/PA, ${dateToUse.getDate()} DE ${monthNames[dateToUse.getMonth()]} DE ${dateToUse.getFullYear()}.`;
  
  let signatureY = finalY + 35;
  if (signatureY > 255) {
    doc.addPage();
    addCbmpaHeader(doc, false, 9, state);
    signatureY = 45;
  }
  doc.text(dateFullStr, 196, signatureY - 25, { align: 'right' });

  // Signature
  const customUsers = JSON.parse(localStorage.getItem('CUSTOM_USERS_DB') || '{}');
  const escMatricula = escalante?.matricula || state.formData.issuerMatricula;
  const cachedUser = customUsers[escMatricula];
  
  const escFullName = cachedUser?.nome || escalante?.nome || state.formData.issuerName || '';
  const escWarName = cachedUser?.nomeGuerra || escalante?.nomeGuerra || state.formData.issuerWarName || '';
  const escRank = escalante?.posto || state.formData.issuerRank || '';
  
  const ubmOrigem = (state.formData.ubmOrigem || state.formData.issuerUbm || 'COP').trim();
  
  drawSignatureWithBoldHighlight(doc, escFullName, escWarName, escRank, 105, signatureY);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const signatureLine2 = `Escalante do ${ubmOrigem}`;
  doc.text(signatureLine2, 105, signatureY + 5, { align: 'center' });

  let labelText = escalaApprovalLabel || '';
  if (!labelText) {
    const escNameStr = (escFullName || 'Escalante').toUpperCase();
    const dateNowStr = new Date().toLocaleDateString('pt-BR') + ', ' + new Date().toLocaleTimeString('pt-BR');
    labelText = `Escala aprovada por ${escNameStr} - ${getAbbreviatedRank(escRank)} dia ${dateNowStr}`;
  }
  if (!labelText.startsWith('[ESCALA]')) {
    labelText = `[ESCALA] ${labelText}`;
  }
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text(labelText, 105, signatureY + 22, { align: 'center' });

  addTraceabilityFooters(doc, false, escalaApprovalLabel, ubmOrigem);

  return returnBlob ? doc.output('blob') : doc.output('bloburl');
};

export const generatePDF = (state: AppState, extraData?: any, returnBlob: boolean = false) => {
  const { formData } = state;
  const today = new Date();
  const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const dateString = `${today.getDate()} DE ${months[today.getMonth()]} DE ${today.getFullYear()}`;

  if (state.currentDoc === DocumentType.MEMO) {
    const doc = new jsPDF();
    addCbmpaHeader(doc, false, undefined, state);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    const startY = 45;
    const leftMargin = 25;

    let recipientText = formData.recipient || (formData.homologadorNome ? `${formData.homologadorPosto || ''} ${formData.homologadorNome}` : '') || '';
    if (recipientText.includes(' - ')) {
      const parts = recipientText.split(' - ');
      const namePart = parts[0].trim();
      const rankPart = parts[1].trim();
      recipientText = `${namePart.toUpperCase()} - ${getAbbreviatedRank(rankPart)}`;
    } else if (recipientText.includes(' – ')) {
      const parts = recipientText.split(' – ');
      const namePart = parts[0].trim();
      const rankPart = parts[1].trim();
      recipientText = `${namePart.toUpperCase()} - ${getAbbreviatedRank(rankPart)}`;
    } else {
      recipientText = recipientText.toUpperCase();
    }
    const recipientLine = `Ao Srº ${recipientText}`;
    doc.text(recipientLine, leftMargin, startY);

    const recipientCargoText = (formData.recipientCargo || formData.homologadorFuncao || '').trim().toUpperCase();
    doc.text(recipientCargoText, leftMargin, startY + 5);
    doc.text("Assunto: Solicitação de Pagamento de Jornada Op. Extraordinária", leftMargin, startY + 15);
    doc.text("Anexo:", leftMargin, startY + 25);
    doc.text("    Relatório de prevenção", leftMargin, startY + 30);
    doc.text("    Planilha de pagamento", leftMargin, startY + 35);
    doc.text("    Escala de serviço", leftMargin, startY + 40);
    doc.text(`    NS ${formData.memoNs || '_____'} – SEOP/COP`, leftMargin, startY + 45);
    doc.text(`    BG de publicação Nº ${formData.memoBg || '_____'}`, leftMargin, startY + 50);
    doc.text("Senhor Comandante,", leftMargin, startY + 70);
    
    let memoDataText = '';
    if (formData.serviceType === 'DIVERSOS') {
      const mesRef = formData.referenciaMes || (formData.periodoInicio ? formData.periodoInicio.slice(0, 7) : '');
      if (mesRef) {
        const parts = mesRef.split('-');
        memoDataText = `no período de ${parts[1]}/${parts[0]}`;
      } else {
        memoDataText = `no período de ${formData.periodoInicio ? formatDate(formData.periodoInicio) : ''} a ${formData.periodoFim ? formatDate(formData.periodoFim) : ''}`;
      }
    } else {
      memoDataText = `realizada ${formData.memoEventDates || (formData.eventDate ? formatDate(formData.eventDate) : '________')}`;
    }

    const legalText = MEMO_LEGAL_TEXT
      .replace('realizada {{DATA}}', memoDataText)
      .replace('{{DATA}}', formData.memoEventDates || (formData.eventDate ? formatDate(formData.eventDate) : '________'))
      .replace('{{NS}}', formData.memoNs || '_____')
      .replace('{{BG}}', formData.memoBg || '_____');
    const splitBody = doc.splitTextToSize(legalText, 160);
    doc.text(splitBody, leftMargin, startY + 80, { align: "justify", maxWidth: 160 });
    const endOfTextY = startY + 80 + (splitBody.length * 5);
    doc.text("Respeitosamente,", leftMargin, endOfTextY + 15);
    const sigY = endOfTextY + 50;
    
    const customUsers = JSON.parse(localStorage.getItem('CUSTOM_USERS_DB') || '{}');
    const cmdMat = formData.issuerMatricula;
    const cmdCachedUser = customUsers[cmdMat];
    const cmdWarName = cmdCachedUser?.nomeGuerra || formData.issuerWarName || '';
    
    drawSignatureWithBoldHighlight(doc, formData.issuerName, cmdWarName, formData.issuerRank, 105, sigY);
    doc.setFont("helvetica", "normal");
    doc.text("Comandante da Prevenção", 105, sigY + 5, { align: "center" });
    
    // Registro do memorando uns 3cm abaixo do campo de assinatura
    let memoLabelText = (extraData && typeof extraData === 'object' && extraData.escalaApprovalLabel) ? extraData.escalaApprovalLabel : '';
    if (!memoLabelText) {
      const cmdNameStr = (formData.issuerName || 'Comandante').toUpperCase();
      const dateNowStr = new Date().toLocaleDateString('pt-BR') + ', ' + new Date().toLocaleTimeString('pt-BR');
      memoLabelText = `Memorando emitido por ${cmdNameStr} - ${getAbbreviatedRank(formData.issuerRank || '')} dia ${dateNowStr}`;
    }
    if (!memoLabelText.startsWith('[MEMORANDO]')) {
      memoLabelText = `[MEMORANDO] ${memoLabelText}`;
    }
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text(memoLabelText, 105, sigY + 22, { align: "center" });

    addTraceabilityFooters(doc, false, extraData, formData.ubmOrigem);
    return returnBlob ? doc.output('blob') : doc.output('bloburl');
  }

  else if (state.currentDoc === DocumentType.COST_SHEET) {
    const doc = new jsPDF({ orientation: 'landscape' });
    
    const effectiveItems = getEffectiveCostItems(formData);
    const aggregatedMap = new Map();
    effectiveItems.forEach(item => {
      const key = item.soldierMatricula;
      if (!aggregatedMap.has(key)) {
        aggregatedMap.set(key, {
          ...item,
          datesList: item.datesList && item.datesList.length > 0 ? [...item.datesList] : (item.date ? [item.date] : []),
          qtyDiversos: item.serviceType === 'DIVERSOS' ? item.quantity : 0,
          qtyPrev: item.serviceType === 'PREVENCAO' ? item.quantity : 0,
          qtyGV: item.serviceType === 'GUARDA_VIDAS' ? item.quantity : 0,
          qtyCorte: item.serviceType === 'CORTE_VEGETAL' ? item.quantity : 0,
          totalQty: item.quantity
        });
      } else {
        const existing = aggregatedMap.get(key);
        const newDates = item.datesList && item.datesList.length > 0 ? item.datesList : (item.date ? [item.date] : []);
        existing.datesList = [...new Set([...existing.datesList, ...newDates])];
        if (item.serviceType === 'DIVERSOS') existing.qtyDiversos += item.quantity;
        if (item.serviceType === 'PREVENCAO') existing.qtyPrev += item.quantity;
        if (item.serviceType === 'GUARDA_VIDAS') existing.qtyGV += item.quantity;
        if (item.serviceType === 'CORTE_VEGETAL') existing.qtyCorte += item.quantity;
        existing.totalQty += item.quantity;
        if (item.isCommander) existing.isCommander = true;
      }
    });

    const aggregatedItems = Array.from(aggregatedMap.values());
    const tableRows = aggregatedItems.map((item, index) => {
      const totalVal = item.totalQty * item.unitValue;
      let dateDisplay = item.datesList ? item.datesList.sort().map((d: string) => formatDateShortDDMM(d)).join('\n') : '-';
      return [
        (index + 1).toString(), item.soldierMatricula, getAbbreviatedRank(item.soldierRank || ''), item.soldierName, item.soldierUbm, item.totalQty.toString(),
        dateDisplay, item.qtyDiversos.toString(), item.qtyPrev.toString(), item.qtyGV.toString(), item.qtyCorte.toString(), formatCurrency(item.unitValue), formatCurrency(totalVal)
      ];
    });

    const totalQty = effectiveItems.reduce((acc, i) => acc + Number(i.quantity), 0);
    const totalVal = effectiveItems.reduce((acc, i) => acc + (i.quantity * i.unitValue), 0);
    const totalDiversosVal = effectiveItems.filter(i => i.serviceType === 'DIVERSOS').reduce((a, b) => a + (b.unitValue * b.quantity), 0);
    const totalPrevVal = effectiveItems.filter(i => i.serviceType === 'PREVENCAO').reduce((a, b) => a + (b.unitValue * b.quantity), 0);
    const totalGvVal = effectiveItems.filter(i => i.serviceType === 'GUARDA_VIDAS').reduce((a, b) => a + (b.unitValue * b.quantity), 0);
    const totalCorteVal = effectiveItems.filter(i => i.serviceType === 'CORTE_VEGETAL').reduce((a, b) => a + (b.unitValue * b.quantity), 0);

    const firstPageSize = 12; // Limite na 1ª página com cabeçalho
    const nextPagesSize = 22; // Limite nas demais páginas sem cabeçalho
    
    let startIdx = 0;
    let pageNum = 0;

    while (startIdx < tableRows.length) {
      if (pageNum > 0) doc.addPage();
      
      const isFirstPage = pageNum === 0;
      const currentChunkSize = isFirstPage ? firstPageSize : nextPagesSize;
      const currentChunk = tableRows.slice(startIdx, startIdx + currentChunkSize);
      startIdx += currentChunkSize;
      
      const isLastChunk = startIdx >= tableRows.length;

      let tableStartY = 15;
      if (isFirstPage) {
        addCbmpaHeader(doc, true, undefined, state);
        doc.setFillColor(230, 230, 230);
        doc.rect(10, 30, 277, 12, 'F'); 
        doc.setDrawColor(0);
        doc.rect(10, 30, 277, 12);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("RELAÇÃO DOS BOMBEIROS MILITARES DO SERVIÇO DE COMPLENTAÇÃO DE JORNADA OPERACIONAL LEI Nº 6.830 DE 13 DE FEVEREIRO DE 2006", 148.5, 35, { align: "center", maxWidth: 270 });
        const selectedTypes = new Set(effectiveItems.map(i => i.serviceType).filter(Boolean));
        if (formData.serviceType) selectedTypes.add(formData.serviceType);
        const isDiv = selectedTypes.has('DIVERSOS');
        const isPrev = selectedTypes.has('PREVENCAO') || selectedTypes.size === 0;
        const isGv = selectedTypes.has('GUARDA_VIDAS');
        const isCorte = selectedTypes.has('CORTE_VEGETAL');
        const checkboxesText = `TIPO DE SERVIÇO:   ${isDiv ? '[X]' : '[ ]'} SERVIÇOS DIVERSOS   ${isPrev ? '[X]' : '[ ]'} PREVENÇÃO DESPORTIVA   ${isGv ? '[X]' : '[ ]'} GUARDA VIDAS   ${isCorte ? '[X]' : '[ ]'} CORTE DE VEGETAL`;

        doc.setFillColor(235, 235, 235);
        doc.rect(10, 42, 277, 10, 'F');
        doc.rect(10, 42, 277, 10);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text(`${formData.operationName || 'OPERAÇÃO'} - NS Nº ${formData.memoNs || '____'}`, 148.5, 46, { align: "center" });
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.text(checkboxesText, 148.5, 50, { align: "center" });
        tableStartY = 54;
      }

      if (isLastChunk) {
        currentChunk.push(['', '', 'TOTAL DE JORNADAS EXTRAORDINARIAS', '', '', totalQty.toString(), '', '', '', '', '', '', formatCurrency(totalVal)]);
      }

      doc.autoTable({
        startY: tableStartY,
        head: [[
          { content: 'SERVIÇOS COP', colSpan: 6, styles: { halign: 'center' } },
          { content: 'TIPOS DE SERVIÇO E DIAS TRABALHADOS', colSpan: 6, styles: { halign: 'center' } },
          { content: '', colSpan: 1 }
        ], [
          'ORD', 'MF', 'POSTO GRADUAÇÃO', 'NOME DO MILITAR', 'UBM', 'QTD', 
          'DATA', 'SERVIÇOS\nDIVERSOS', 'PREVENÇÃO\nDESPORTIVA', 'GUARDA\nVIDAS', 'CORTE\nVEGETAL', 
          'VALOR\nUNITÁRIO', 'VALOR\nTOTAL'
        ]],
        body: currentChunk,
        theme: 'grid',
        styles: { fontSize: 7, halign: 'center', valign: 'middle', cellPadding: 1, lineColor: [0, 0, 0], lineWidth: 0.1, textColor: 0 },
        headStyles: { fillColor: [255, 255, 0], textColor: 0, fontStyle: 'bold', lineColor: 0 },
        columnStyles: { 3: { halign: 'left', cellWidth: 70 } },
        margin: { left: 10, right: 10 }
      });

      if (isLastChunk) {
        
        // --- Add observação here before the final table ---
        let finalTableY = doc.lastAutoTable.finalY + 5;
        if (formData.escalaObs && formData.escalaObs.trim() !== '') {
           doc.setFont("helvetica", "bold");
           doc.setFontSize(8);
           doc.text(`OBSERVAÇÕES: ${formData.escalaObs}`, 10, finalTableY, { maxWidth: 277 });
           
           // adjust finalTableY so the next table doesn't overlap
           let obsLines = doc.splitTextToSize(`OBSERVAÇÕES: ${formData.escalaObs}`, 277);
           finalTableY += (obsLines.length * 4) + 2; 
        }

        if (extraData) {
           doc.setFont("helvetica", "italic");
           doc.setFontSize(8);
           const labels = [];
           if (extraData.escalaApprovalLabel) labels.push(`[ESCALA] ${extraData.escalaApprovalLabel}`);
           if (extraData.executionApprovalLabel) labels.push(`[RELATÓRIO] ${extraData.executionApprovalLabel}`);
           if (extraData.homologationLabel) labels.push(`[HOMOLOGAÇÃO] ${extraData.homologationLabel}`);
           if (extraData.paymentLaunchLabel) labels.push(`[LANÇAMENTO] ${extraData.paymentLaunchLabel}`);
           
           labels.forEach(lbl => {
               doc.text(lbl, 10, finalTableY, { maxWidth: 277 });
               let approvalLines = doc.splitTextToSize(lbl, 277);
               finalTableY += (approvalLines.length * 4) + 1; 
           });
           finalTableY += 1;
        }
        if (formData.ubmOrigem) {
           doc.setFont("helvetica", "bold");
           doc.setFontSize(8);
           doc.text(`UBM DE ORIGEM: ${getUbmOrigemFullName(formData.ubmOrigem)}`, 10, finalTableY, { maxWidth: 277 });
           finalTableY += 6; 
        }

        doc.autoTable({
          startY: finalTableY,
          head: [
            [{ content: 'QUANTIDADE E TIPO DE SERVIÇO', colSpan: 5, styles: { halign: 'center' } }, { content: '', colSpan: 1 }],
            ['SERVIÇOS DIVERSOS', 'PREVENÇÃO DESPORTIVA', 'GUARDA VIDAS', 'CORTE DE VEGETAL', 'TOTAL DA PLANILHA']
          ],
          body: [
            [formatCurrency(totalDiversosVal), formatCurrency(totalPrevVal), formatCurrency(totalGvVal), formatCurrency(totalCorteVal), formatCurrency(totalVal)],
            [
              totalVal > 0 ? (totalDiversosVal/totalVal * 100).toFixed(2) + '%' : '0%',
              totalVal > 0 ? (totalPrevVal/totalVal * 100).toFixed(2) + '%' : '0%',
              totalVal > 0 ? (totalGvVal/totalVal * 100).toFixed(2) + '%' : '0%',
              totalVal > 0 ? (totalCorteVal/totalVal * 100).toFixed(2) + '%' : '0%',
              "100%"
            ]
          ],
          theme: 'grid',
          styles: { fontSize: 7, halign: 'center', fontStyle: 'bold', lineColor: 0, textColor: 0 },
          headStyles: { fillColor: [255, 255, 0], textColor: 0 },
          margin: { left: 10, right: 10 },
          tableWidth: 'wrap'
        });

        const summaryTableY = doc.lastAutoTable.finalY;
        const commander = (formData.costSheetItems || []).find(i => i.isCommander);
        const cmtName = commander ? commander.soldierName : formData.issuerName;
        const cmtWarName = formData.issuerWarName;
        const cmtRank = commander ? commander.soldierRank : formData.issuerRank;

        doc.setFillColor(255, 255, 0);
        doc.rect(10, summaryTableY, 277, 8, 'F');
        doc.rect(10, summaryTableY, 277, 8);
        doc.setFontSize(9);
        doc.text("CUSTO TOTAL", 40, summaryTableY + 5);
        doc.text(formatCurrency(totalVal), 250, summaryTableY + 5, { align: "right" });
        
        const dateY = summaryTableY + 14; 
        doc.setFontSize(8);
        doc.text(`BELÉM-PA, ${dateString.toUpperCase()}`, 280, dateY, { align: "right" });
        
        const customUsers = JSON.parse(localStorage.getItem('CUSTOM_USERS_DB') || '{}');
        const cmdMat = commander ? commander.soldierMatricula : formData.issuerMatricula;
        const cmdCachedUser = customUsers[cmdMat];
        const resolvedCmtWarName = cmdCachedUser?.nomeGuerra || cmtWarName || '';
        
        const signatureY = dateY + 20; 
        drawSignatureWithBoldHighlight(doc, cmtName, resolvedCmtWarName, cmtRank, 148.5, signatureY);
        doc.setFont("helvetica", "normal");
        doc.text("COMANDANTE DA PREVENÇÃO", 148.5, signatureY + 4, { align: "center" });

        // Registro da planilha uns 3cm abaixo do campo de assinatura
        let planLabelText = (extraData && typeof extraData === 'object' && (extraData.homologationLabel || extraData.escalaApprovalLabel)) 
          ? (extraData.homologationLabel || extraData.escalaApprovalLabel) : '';
        if (!planLabelText) {
          const cmtNameStr = (cmtName || 'Comandante').toUpperCase();
          const dateNowStr = new Date().toLocaleDateString('pt-BR') + ', ' + new Date().toLocaleTimeString('pt-BR');
          planLabelText = `Planilha homologada por ${cmtNameStr} - ${getAbbreviatedRank(cmtRank || '')} dia ${dateNowStr}`;
        }
        if (!planLabelText.startsWith('[PLANILHA]')) {
          planLabelText = `[PLANILHA] ${planLabelText}`;
        }
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(0, 0, 0);
        doc.text(planLabelText, 148.5, signatureY + 22, { align: "center" });
      }
      pageNum++;
    }
    addTraceabilityFooters(doc, true, extraData, formData.ubmOrigem);
    return returnBlob ? doc.output('blob') : doc.output('bloburl');
  }

  else if (state.currentDoc === DocumentType.REPORT) {
    const doc = new jsPDF();
    addCbmpaHeader(doc, false, undefined, state);
    
    const effList = formData.reportEffectiveItems || [];
    const counts = {
      f: effList.filter(i => i.status === 'F').length,
      pa: effList.filter(i => i.status === 'P/A').length,
      d: effList.filter(i => i.status === 'D').length,
      a: effList.filter(i => i.status === 'A').length,
      total: effList.length
    };

    doc.setFillColor(255, 255, 0);
    doc.rect(10, 32, 190, 10, 'F');
    doc.setDrawColor(0);
    doc.rect(10, 32, 190, 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("RELATÓRIO DE PREVENÇÃO – JORNADA OPERACIONAL EXTRAORDINÁRIA", 105, 38.5, { align: "center" });

    let currentY = 45;
    const drawSectionHeader = (title: string, y: number, width = 190, x = 10) => {
      doc.setFillColor(220, 220, 220);
      doc.rect(x, y, width, 6, 'F');
      doc.rect(x, y, width, 6);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(title, x + (width / 2), y + 4.5, { align: "center" });
      return y + 6;
    };
    const drawGridRow = (y: number, height: number, cols: { width: number, label: string, value: string }[]) => {
      let currentX = 10;
      doc.setFontSize(8);
      cols.forEach((col) => {
         doc.setDrawColor(0);
         doc.rect(currentX, y, col.width, height);
         doc.setFont("helvetica", "bold");
         doc.text(col.label, currentX + 2, y + 4);
         doc.setFont("helvetica", "normal");
         const labelWidth = doc.getTextWidth(col.label);
         doc.text(col.value || "", currentX + 2 + labelWidth + 2, y + 4);
         currentX += col.width;
      });
      return y + height;
    };

    currentY = drawSectionHeader("1. DADOS INICIAIS", currentY);
    currentY = drawGridRow(currentY, 7, [{ width: 190, label: "NOME DO EVENTO:", value: formData.operationName || formData.eventName || '' }]);
    currentY = drawGridRow(currentY, 7, [
        { width: 140, label: "CMT. DA PREVENÇÃO:", value: `${getAbbreviatedRank(formData.issuerRank || '')} ${formData.issuerName}` },
        { width: 50, label: "UBM:", value: formData.issuerUbm }
    ]);
    currentY = drawGridRow(currentY, 7, [{ width: 190, label: "LOCAL DO EVENTO:", value: formData.eventLocal }]);
    if (formData.serviceType === 'DIVERSOS') {
      const periodStr = formData.referenciaMes 
        ? `${formData.referenciaMes.split('-').reverse().join('/')}` 
        : (formData.periodoInicio ? `${formatDate(formData.periodoInicio)} A ${formatDate(formData.periodoFim)}` : 'N/A');
      currentY = drawGridRow(currentY, 7, [
        { width: 190, label: "PERÍODO DO EVENTO (MÊS/ANO):", value: periodStr }
      ]);
    } else {
      currentY = drawGridRow(currentY, 7, [
        { width: 95, label: "DATA DO EVENTO:", value: formatDate(formData.eventDate) },
        { width: 95, label: "DIA DA SEMANA:", value: formData.eventDayOfWeek }
      ]);
    }
    currentY = drawGridRow(currentY, 7, [{ width: 190, label: "HORÁRIO NO EVENTO:", value: formData.serviceType === 'DIVERSOS' ? "TURNOS DE TRABALHO" : `${formData.eventStartTime} AS ${formData.eventEndTime}` }]);
    currentY = drawGridRow(currentY, 7, [
        { width: 95, label: "TOTAL EFETIVO:", value: `${counts.total} BM's` }, 
        { width: 95, label: "REFERÊNCIA:", value: `NS Nº ${formData.memoNs || '_____'}` }
    ]);
    currentY = drawGridRow(currentY, 7, [{ width: 190, label: "", value: `Nº FALTAS: (${counts.f}) - Nº PERMUTA: (${counts.pa}) - Nº DISPENSA: (${counts.d}) - Nº ATRASO: (${counts.a})` }]);
    currentY = drawGridRow(currentY, 7, [
        { width: 95, label: "MÉDIA ESTIMADA DE PÚBLICO:", value: formData.eventPublicEstimate },
        { width: 95, label: "Nº PPE:", value: formData.siscobNumber }
    ]);
    currentY = drawGridRow(currentY, 7, [{ width: 190, label: "ANEXOS:", value: "ESCALA GERAL/CÓPIA DA NOTA/ ORDEM DE SERVIÇO." }]);
    currentY += 2;

    const isDiversos = formData.serviceType === 'DIVERSOS';
    const hasEffChanges = (formData.reportEffectiveItems || []).some((i: any) => i.status !== 'P' || i.substituteName);
    currentY = drawSectionHeader(`2. ALTERAÇÕES NO EFETIVO EMPREGADO - SIM (${hasEffChanges ? 'X' : ' '}) NÃO (${!hasEffChanges ? 'X' : ' '})`, currentY);
    
    const reportHeaders = isDiversos 
      ? [['ORD', 'POST/GRAD', 'NOME GUERRA DO MILITAR', 'UBM', 'MF (OBRIGATÓRIO)', 'DIAS TRABALHADOS (DD/MM)']]
      : [['ORD', 'POST/GRAD', 'NOME GUERRA DO MILITAR', 'UBM', 'MF (OBRIGATÓRIO)', 'P', 'F', 'D', 'P/A', 'A']];

    const reportEffectiveList = (formData.reportEffectiveItems && formData.reportEffectiveItems.length > 0)
      ? formData.reportEffectiveItems
      : (formData.costSheetItems || []);

    doc.autoTable({
      startY: currentY,
      head: reportHeaders,
      body: reportEffectiveList.map((item: any, i: number) => {
        let rank = getAbbreviatedRank(item.soldierRank || '');
        let name = item.soldierName || '';
        let mf = item.soldierMf || item.soldierMatricula || '';

        if (item.status === 'P/A' && item.substituteName) {
          let subNameRaw = item.substituteName.trim();
          let subMf = item.substituteMf || item.substituteMatricula || '';

          if (!subMf && subNameRaw.includes('MF:')) {
            const match = subNameRaw.match(/MF:\s*(\d+)/i);
            if (match) subMf = match[1];
            subNameRaw = subNameRaw.replace(/\(MF:.*?\)/gi, '').trim();
          } else if (!subMf && subNameRaw.includes('-')) {
            const parts = subNameRaw.split('-');
            if (parts.length > 1 && /^\d+$/.test(parts[1].trim())) {
              subMf = parts[1].trim();
              subNameRaw = parts[0].trim();
            }
          }

          if (subMf) mf = subMf;

          if (item.substituteRank) {
            rank = getAbbreviatedRank(item.substituteRank);
            name = item.substituteWarName || subNameRaw;
          } else {
            const words = subNameRaw.split(/\s+/);
            if (words.length > 1) {
              const candidateRank = words[0];
              const maybeRank = getAbbreviatedRank(candidateRank);
              if (maybeRank && maybeRank !== candidateRank.toUpperCase()) {
                rank = maybeRank;
                name = words.slice(1).join(' ');
              } else {
                name = subNameRaw;
              }
            } else {
              name = subNameRaw;
            }
          }
        }

        if (isDiversos) {
          const datesArr = item.datesList && item.datesList.length > 0 
            ? item.datesList 
            : (item.date ? item.date.split(',').map((s: string) => s.trim()) : []);
          const workedDaysDDMM = datesArr.map((d: string) => formatDateShortDDMM(d)).join(', ');
          return [
            (i+1).toString(),
            rank,
            name,
            item.soldierUbm || 'COP',
            mf,
            workedDaysDDMM || '-'
          ];
        }

        return [
          (i+1).toString(),
          rank,
          name,
          item.soldierUbm || 'COP',
          mf,
          item.status === 'P' ? 'X' : '',
          item.status === 'F' ? 'X' : '',
          item.status === 'D' ? 'X' : '',
          item.status === 'P/A' ? 'X' : '',
          item.status === 'A' ? 'X' : ''
        ];
      }),
      theme: 'grid',
      styles: { fontSize: 7, halign: 'center', lineColor: 0, textColor: 0 },
      headStyles: { fillColor: [220, 220, 220], textColor: 0 },
      margin: { left: 10, right: 10 },
    });
    currentY = doc.lastAutoTable.finalY + 1;
    doc.setFontSize(6);
    doc.text("LEGENDA: P(PRESENÇA) - F(FALTA) - D(DISPENSA) - P/A(PERMUTA/AUTORIZAÇÃO) - A(ATRASO)", 10, currentY + 2);
    currentY += 4;

    const hasSvcChanges = (formData.reportServiceItems || []).some((i: any) => i.name || i.code);
    currentY = drawSectionHeader(`3. ALTERAÇÕES NO SERVIÇO - SIM (${hasSvcChanges ? 'X' : ' '}) NÃO (${!hasSvcChanges ? 'X' : ' '})`, currentY);
    doc.autoTable({
      startY: currentY,
      head: [['ORD', 'NOME', 'ID', 'SEXO (M)(F)', 'ILS', 'FD', 'FTL', 'CÓDIGO']],
      body: (formData.reportServiceItems || []).map((item, i) => {
        const cond = (item.condition || '').toUpperCase().trim();
        const isIlesa = cond.includes('ILS') || cond.includes('ILESA') || cond === 'I';
        const isFerida = cond.includes('FD') || cond.includes('FERID') || cond === 'F';
        const isFatal = cond.includes('FTL') || cond.includes('FATAL') || cond === 'FT';
        return [
          (i+1).toString(), item.name, item.age, item.sex,
          isIlesa ? 'X' : '', isFerida ? 'X' : '', isFatal ? 'X' : '', item.code
        ];
      }),
      theme: 'grid',
      styles: { fontSize: 7, halign: 'center', lineColor: 0, textColor: 0 },
      headStyles: { fillColor: [220, 220, 220], textColor: 0 },
      margin: { left: 10, right: 10 },
    });
    currentY = doc.lastAutoTable.finalY + 2;
    doc.setFontSize(6);
    const codesText = OCCURRENCE_CODES.map(c => `${c.code}-${c.desc}`).join(' - ');
    const splitCodes = doc.splitTextToSize("CÓDIGO OCORRÊNCIAS: " + codesText, 190);
    doc.text(splitCodes, 10, currentY + 2);
    currentY += (splitCodes.length * 3) + 2;

    if (currentY > 200) { doc.addPage(); currentY = 20; }

    const hasLogChanges = Object.values(formData.reportLogistics || {}).some((v: any) => v?.used) || !!formData.reportOtherLogistics;
    currentY = drawSectionHeader(`4. APOIO LOGÍSTICO - SIM (${hasLogChanges ? 'X' : ' '}) NÃO (${!hasLogChanges ? 'X' : ' '})`, currentY);
    const allLogItems = [...REPORT_LOGISTICS_ITEMS];
    if (formData.reportOtherLogistics) allLogItems.push('OUTROS: ' + formData.reportOtherLogistics);
    const halfLen = Math.ceil(allLogItems.length / 2);
    const logRows = [];
    for (let i = 0; i < halfLen; i++) {
        const leftItem = allLogItems[i];
        const rightItem = allLogItems[i + halfLen];
        const row = [];
        const leftData = formData.reportLogistics[leftItem] || { used: false, qty: '' };
        if (leftItem && leftItem.startsWith('OUTROS')) { leftData.used = true; leftData.qty = '1'; }
        row.push(leftItem); row.push(leftData.used ? 'X' : ''); row.push(!leftData.used ? 'X' : ''); row.push(leftData.qty);
        if (rightItem) {
            const rightData = formData.reportLogistics[rightItem] || { used: false, qty: '' };
            if (rightItem.startsWith('OUTROS')) { rightData.used = true; rightData.qty = '1'; }
            row.push(rightItem); row.push(rightData.used ? 'X' : ''); row.push(!rightData.used ? 'X' : ''); row.push(rightData.qty);
        } else { row.push('', '', '', ''); }
        logRows.push(row);
    }

    doc.autoTable({
      startY: currentY,
      head: [['MATERIAL', 'S', 'N', 'QTD', 'MATERIAL', 'S', 'N', 'QTD']],
      body: logRows,
      theme: 'grid',
      styles: { fontSize: 7, halign: 'center', lineColor: 0, textColor: 0, cellPadding: 1 },
      headStyles: { fillColor: [220, 220, 220], textColor: 0 },
      columnStyles: { 0: { halign: 'left', cellWidth: 40 }, 4: { halign: 'left', cellWidth: 40 } },
      margin: { left: 10, right: 10 },
    });
    currentY = doc.lastAutoTable.finalY + 1;
    doc.setFontSize(6);
    doc.text("LEGENDA: S -SIM / N - NÃO / QTD - QUANTIDADE", 10, currentY + 2);
    currentY += 4;

    if (currentY > 230) { doc.addPage(); currentY = 20; }
    const hasVtrChanges = Object.values(formData.reportVehicles || {}).some((v: any) => v?.used) || !!formData.reportOtherVehicles;
    currentY = drawSectionHeader(`5. VIATURAS/EMBARCAÇÕES E AERONAVES - SIM (${hasVtrChanges ? 'X' : ' '}) NÃO (${!hasVtrChanges ? 'X' : ' '})`, currentY);
    const allVtrItems = [...REPORT_VEHICLE_ITEMS];
    if (formData.reportOtherVehicles) allVtrItems.push('OUTROS: ' + formData.reportOtherVehicles);
    const halfVtrLen = Math.ceil(allVtrItems.length / 2);
    const vtrRows = [];
    for (let i = 0; i < halfVtrLen; i++) {
        const leftItem = allVtrItems[i];
        const rightItem = allVtrItems[i + halfVtrLen];
        const row = [];
        const leftData = formData.reportVehicles[leftItem] || { used: false, qty: '', origin: '' };
        if (leftItem && leftItem.startsWith('OUTROS')) { leftData.used = true; leftData.qty = '1'; }
        row.push(leftItem); row.push(leftData.used ? 'X' : ''); row.push(!leftData.used ? 'X' : ''); row.push(leftData.qty); row.push(leftData.origin);
        if (rightItem) {
            const rightData = formData.reportVehicles[rightItem] || { used: false, qty: '', origin: '' };
            if (rightItem.startsWith('OUTROS')) { rightData.used = true; rightData.qty = '1'; }
            row.push(rightItem); row.push(rightData.used ? 'X' : ''); row.push(!rightData.used ? 'X' : ''); row.push(rightData.qty); row.push(rightData.origin);
        } else { row.push('', '', '', '', ''); }
        vtrRows.push(row);
    }
    
    doc.autoTable({
      startY: currentY,
      head: [['MATERIAL', 'S', 'N', 'QTD', 'ORIGEM', 'MATERIAL', 'S', 'N', 'QTD', 'ORIGEM']],
      body: vtrRows,
      theme: 'grid',
      styles: { fontSize: 6, halign: 'center', lineColor: 0, textColor: 0, cellPadding: 1 },
      headStyles: { fillColor: [220, 220, 220], textColor: 0 },
      columnStyles: { 0: { halign: 'left', cellWidth: 35 }, 4: { halign: 'left', cellWidth: 15 }, 5: { halign: 'left', cellWidth: 35 }, 9: { halign: 'left', cellWidth: 15 } },
      margin: { left: 10, right: 10 },
    });
    currentY = doc.lastAutoTable.finalY + 4;

    if (currentY > 230) { doc.addPage(); currentY = 20; }
    currentY = drawSectionHeader("6. CONSIDERAÇÕES DO SERVIÇO", currentY);
    doc.setDrawColor(0);
    const sec6StartY = currentY; 
    doc.setFontSize(8);
    
    const drawDynamicFieldRow = (label: string, text: string, textX: number, maxWidth: number, drawLineBelow = true) => {
      doc.setFont("helvetica", "bold");
      doc.text(label, 12, currentY + 5);
      doc.setFont("helvetica", "normal");
      
      const safeText = text || '';
      const splitText = doc.splitTextToSize(safeText, maxWidth);
      
      doc.text(splitText, textX, currentY + 5, { align: "justify", maxWidth: maxWidth });
      
      const blockHeight = Math.max(5, splitText.length * 4);
      currentY += blockHeight + 3; 
      
      if (drawLineBelow) {
          doc.line(10, currentY, 200, currentY);
      }
    };

    // 1. PONTOS POSITIVOS
    const positiveText = `SIM (${formData.reportPositive.has ? 'X' : ' '}) NÃO (${!formData.reportPositive.has ? 'X' : ' '}) - SE SIM, QUAIS: ${formData.reportPositive.text}`;
    drawDynamicFieldRow("PONTOS POSITIVO:", positiveText, 50, 145, false);
    
    // 2. PONTOS NEGATIVOS
    const negativeText = `SIM (${formData.reportNegative.has ? 'X' : ' '}) NÃO (${!formData.reportNegative.has ? 'X' : ' '}) - SE SIM, QUAIS: ${formData.reportNegative.text}`;
    drawDynamicFieldRow("PONTOS NEGATIVO:", negativeText, 50, 145, true);

    // 3. QUADRO DE ATIVIDADES
    doc.setFont("helvetica", "bold");
    doc.text("QUADRO DE ATIVIDADES SERVIÇO:", 12, currentY + 5);
    doc.setFont("helvetica", "normal");
    const activitiesText = formData.reportActivities || '';
    const splitActivities = doc.splitTextToSize(activitiesText, 185);
    doc.text(splitActivities, 12, currentY + 9, { align: "justify", maxWidth: 185 });
    currentY += 9 + (splitActivities.length * 4);
    doc.line(10, currentY, 200, currentY);

    // 4. SERVIÇOS DE PREVENTIVO
    drawDynamicFieldRow("SERVIÇOS DE PREVENTIVO DE ORIENTAÇÃO E ADVERTÊNCIA:", formData.reportGuidance || '', 110, 85, true);

    // 5. DISTRIBUIÇÃO DO EFETIVO
    drawDynamicFieldRow("DISTRIBUIÇÃO DO EFETIVO:", formData.reportDistribution || '', 60, 135, true);

    // 6. SUGESTÕES
    drawDynamicFieldRow("SUGESTÕES:", formData.reportSuggestions || '', 40, 155, false);

    doc.rect(10, sec6StartY, 190, currentY - sec6StartY);

    currentY += 5; 

    // 7. REGISTRO FOTOGRÁFICO
    if (currentY > 210) { doc.addPage(); currentY = 20; }
    currentY = drawSectionHeader("7. REGISTRO FOTOGRÁFICO", currentY);
    const photos = (formData.reportPhotos || []).filter((p: string) => p && p.startsWith('data:image'));
    if (photos.length > 0) {
      let photoX = 12;
      let photoY = currentY + 3;
      photos.forEach((photo: string, idx: number) => {
        try {
          doc.addImage(photo, 'JPEG', photoX, photoY, 85, 60);
          photoX += 92;
          if (photoX > 150) {
            photoX = 12;
            photoY += 66;
            if (photoY > 210 && idx < photos.length - 1) {
              doc.addPage();
              photoY = 20;
            }
          }
        } catch (e) {
          console.error("Error adding photo to pdf", e);
        }
      });
      currentY = photoY + 68;
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.text("SEM REGISTROS FOTOGRÁFICOS ANEXADOS.", 12, currentY + 6);
      currentY += 12;
    }

    // 8. CONSIDERAÇÕES FINAIS
    if (currentY > 230) { doc.addPage(); currentY = 20; }
    currentY = drawSectionHeader("8. CONSIDERAÇÕES FINAIS", currentY);
    
    const finalConsiderations = formData.reportFinalConsiderations || 'NADA A DECLARAR';
    const splitFinal = doc.splitTextToSize(finalConsiderations, 185);
    
    const boxHeight = Math.max(25, (splitFinal.length * 4) + 6);
    doc.rect(10, currentY, 190, boxHeight);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(splitFinal, 12, currentY + 5, { align: "justify", maxWidth: 185 });
    
    currentY += boxHeight + 5;
    
    if (currentY > 230) { doc.addPage(); currentY = 40; }
    doc.setFontSize(9);
    doc.text(`BELÉM – PA, ${dateString}`, 190, currentY, { align: "right" });

    currentY += 30; 
    const customUsers = JSON.parse(localStorage.getItem('CUSTOM_USERS_DB') || '{}');
    const cmdMat = formData.issuerMatricula;
    const cmdCachedUser = customUsers[cmdMat];
    const cmdWarName = cmdCachedUser?.nomeGuerra || formData.issuerWarName || '';
    
    drawSignatureWithBoldHighlight(doc, formData.issuerName, cmdWarName, formData.issuerRank, 105, currentY);
    doc.setFont("helvetica", "normal");
    doc.text("CMT DA OPERAÇÃO/EXTRAORDINÁRIA", 105, currentY + 5, { align: "center" });

    // Registro do relatório uns 3cm abaixo do campo de assinatura (nome do comandante, data e hora)
    let repLabelText = (extraData && typeof extraData === 'object' && extraData.executionApprovalLabel) ? extraData.executionApprovalLabel : '';
    if (!repLabelText) {
      const cmtNameStr = (formData.issuerName || 'Comandante').toUpperCase();
      const dateNowStr = new Date().toLocaleDateString('pt-BR') + ', ' + new Date().toLocaleTimeString('pt-BR');
      repLabelText = `Relatório atestado por ${cmtNameStr} - ${getAbbreviatedRank(formData.issuerRank || '')} dia ${dateNowStr}`;
    }
    if (!repLabelText.startsWith('[RELATÓRIO]')) {
      repLabelText = `[RELATÓRIO] ${repLabelText}`;
    }
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text(repLabelText, 105, currentY + 22, { align: "center" });

    addTraceabilityFooters(doc, false, extraData, formData.ubmOrigem);
    return returnBlob ? doc.output('blob') : doc.output('bloburl');
  }
};
