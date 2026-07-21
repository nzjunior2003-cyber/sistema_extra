import { CostSheetItem, ReportEffectiveItem } from './types';

// 1. Pagamento: Cálculo e Arredondamento
export const calculateTotalPayment = (items: CostSheetItem[]) => {
  return items.reduce((acc, item) => {
    const totalItem = Number(item.quantity || 0) * Number(item.unitValue || 0);
    return acc + totalItem;
  }, 0);
};

export const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(val);
};

// 2. Escala: Restrição de Intervalo (24h)
export const hasIntervalConflict = (
  soldierMatricula: string,
  eventDate: string,
  eventStartTime: string,
  existingEscalas: any[],
  currentEscalaId?: string
): boolean => {
  if (!eventDate) return false;
  
  let conflictFound = false;
  const currentEventStart = new Date(`${eventDate}T${eventStartTime || '00:00'}`);
  
  existingEscalas.forEach(e => {
    if (currentEscalaId && e.id === currentEscalaId) return;
    
    if (['esclarecimento_solicitado', 'em_edicao', 'atestado', 'homologado', 'lancado'].includes(e.status)) {
      const hasSoldier = e.formData.costSheetItems?.some((c: any) => c.soldierMatricula === soldierMatricula);
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
  
  return conflictFound;
};

// 3. Atestado: Sobreposição
// Validates if the same soldier has multiple 'F' (Falta) or 'D' (Dispensa) in the same scale event.
export const validateNoDuplicateAtestados = (effectiveItems: ReportEffectiveItem[]): boolean => {
  const seen = new Set<string>();
  for (const item of effectiveItems) {
    if (['F', 'D'].includes(item.status)) {
      if (seen.has(item.soldierMf)) return false;
      seen.add(item.soldierMf);
    }
  }
  return true;
};

// 4. Homologador: Fluxo Cíclico
export const canReturnToCommander = (escalaStatus: string): boolean => {
  return escalaStatus === 'atestado';
};

export const canCommanderEdit = (escalaStatus: string): boolean => {
  return ['em_edicao', 'esclarecimento_solicitado'].includes(escalaStatus);
};
