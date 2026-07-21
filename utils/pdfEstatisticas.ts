import { getEffectiveCostItems } from "./costHelpers";
import { AppState, DocumentType, Soldier, CostSheetItem } from '../types';
import { CBMPA_LOGO_BASE64, DEFESA_CIVIL_LOGO_BASE64 } from './logoBase64';

const { jsPDF } = window.jspdf;

export const generateRelatorioEstatisticoPDF = (escalas: any[], currentUser: any, filtersApplied: any) => {
  const doc = new jsPDF('landscape');
  let currentY = 15;

  // Header Logos
  doc.addImage(CBMPA_LOGO_BASE64, 'PNG', 15, currentY, 20, 25);
  doc.addImage(DEFESA_CIVIL_LOGO_BASE64, 'PNG', 260, currentY, 20, 25);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("CORPO DE BOMBEIROS MILITAR DO PARÁ", 148, currentY + 5, { align: "center" });
  doc.text("COMANDO OPERACIONAL", 148, currentY + 11, { align: "center" });
  doc.text("RELATÓRIO ESTATÍSTICO DE AUDITORIA (HOMOLOGAÇÃO)", 148, currentY + 18, { align: "center" });
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Gerado por: ${currentUser.posto} ${currentUser.nome} - Mat: ${currentUser.matricula}`, 148, currentY + 24, { align: "center" });
  const now = new Date().toLocaleString('pt-BR');
  doc.text(`Data da geração: ${now}`, 148, currentY + 29, { align: "center" });

  currentY += 40;

  // Calculate statistics
  const totalEscalas = escalas.length;
  
  const statusCount = {
    atestado: 0,
    homologado: 0,
    lancado: 0,
    devolvido: 0,
    esclarecimento_solicitado: 0,
  };

  const serviceTypesCount: Record<string, number> = {};
  const originUbmCount: Record<string, number> = {};
  
  let totalCost = 0;
  let totalSoldiers = 0;

  escalas.forEach(e => {
    // Status
    if (e.status in statusCount) {
        statusCount[e.status as keyof typeof statusCount]++;
    }

    // Service Type
    const sType = e.formData.serviceType || 'Não Informado';
    serviceTypesCount[sType] = (serviceTypesCount[sType] || 0) + 1;

    // Origin UBM
    const originUbm = e.formData.ubmOrigem || 'Não Informada';
    originUbmCount[originUbm] = (originUbmCount[originUbm] || 0) + 1;

    // Total cost & soldiers
    getEffectiveCostItems(e.formData).forEach((item: any) => {
        totalSoldiers++;
        totalCost += ((Number(item.quantity) || 0) * (Number(item.unitValue) || 0));
    });
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("RESUMO GERAL", 15, currentY);
  currentY += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Total de Escalas Filtradas: ${totalEscalas}`, 20, currentY); currentY += 6;
  doc.text(`Total de Militares Envolvidos: ${totalSoldiers}`, 20, currentY); currentY += 6;
  doc.text(`Custo Estimado Total: R$ ${totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 20, currentY); currentY += 10;

  // Render Status
  doc.setFont("helvetica", "bold");
  doc.text("SITUAÇÃO DAS ESCALAS (STATUS)", 15, currentY); currentY += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`Aguardando Homologação (Atestadas): ${statusCount.atestado}`, 20, currentY); currentY += 6;
  doc.text(`Homologadas: ${statusCount.homologado}`, 20, currentY); currentY += 6;
  doc.text(`Lançadas para Pagamento: ${statusCount.lancado}`, 20, currentY); currentY += 6;
  doc.text(`Devolvidas: ${statusCount.devolvido}`, 20, currentY); currentY += 6;
  doc.text(`Com Esclarecimento Solicitado: ${statusCount.esclarecimento_solicitado}`, 20, currentY); currentY += 10;

  // Split into columns
  const startColY = currentY;

  // Column 1: Types of Service
  doc.setFont("helvetica", "bold");
  doc.text("TIPOS DE SERVIÇO", 15, currentY); currentY += 6;
  doc.setFont("helvetica", "normal");
  Object.entries(serviceTypesCount).sort((a,b) => b[1] - a[1]).forEach(([type, count]) => {
      doc.text(`${type}: ${count} escala(s)`, 20, currentY);
      currentY += 6;
      if (currentY > 190) {
          doc.addPage();
          currentY = 20;
      }
  });

  // Column 2: Origin UBM
  let currentYCol2 = startColY;
  doc.setFont("helvetica", "bold");
  doc.text("UBM DE ORIGEM", 150, currentYCol2); currentYCol2 += 6;
  doc.setFont("helvetica", "normal");
  Object.entries(originUbmCount).sort((a,b) => b[1] - a[1]).forEach(([ubm, count]) => {
      doc.text(`${ubm}: ${count} escala(s)`, 155, currentYCol2);
      currentYCol2 += 6;
      if (currentYCol2 > 190) {
          // just let it overflow or handle, simple for now
      }
  });

  currentY = Math.max(currentY, currentYCol2) + 10;

  // Filters applied
  if (currentY > 170) { doc.addPage(); currentY = 20; }
  doc.setFont("helvetica", "bold");
  doc.text("FILTROS APLICADOS", 15, currentY); currentY += 6;
  doc.setFont("helvetica", "normal");
  const filtersList = [];
  if (filtersApplied.ano) filtersList.push(`Ano: ${filtersApplied.ano}`);
  if (filtersApplied.mes) filtersList.push(`Mês: ${filtersApplied.mes}`);
  if (filtersApplied.tipoServico) filtersList.push(`Tipo de Serviço: ${filtersApplied.tipoServico}`);
  if (filtersApplied.militar) filtersList.push(`Militar: ${filtersApplied.militar}`);
  if (filtersApplied.ubmOrigem) filtersList.push(`UBM de Origem: ${filtersApplied.ubmOrigem}`);
  if (filtersApplied.altServico) filtersList.push(`Alt. Serviço: ${filtersApplied.altServico}`);
  if (filtersApplied.altEfetivo) filtersList.push(`Alt. Efetivo: ${filtersApplied.altEfetivo}`);

  if (filtersList.length === 0) {
      doc.text("Nenhum filtro específico aplicado.", 20, currentY);
  } else {
      filtersList.forEach(f => {
          doc.text(f, 20, currentY); currentY += 6;
      });
  }

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Página ${i} de ${pageCount}`, 280, 200, { align: 'right' });
    doc.text("COMANDO OPERACIONAL", 148, 200, { align: 'center' });
  }

  return doc.output('bloburl');
};
