import { describe, it, expect } from 'vitest';
import { 
  calculateTotalPayment, 
  formatCurrency, 
  hasIntervalConflict, 
  validateNoDuplicateAtestados, 
  canReturnToCommander, 
  canCommanderEdit 
} from './validations';
import { CostSheetItem, ReportEffectiveItem } from './types';

describe('1. Módulo Pagamento: Cálculo e Arredondamento', () => {
  it('deve calcular corretamente o total, mesmo com valores fracionados', () => {
    const items = [
      { quantity: 2, unitValue: 100.50 } as CostSheetItem,
      { quantity: 1, unitValue: 33.33 } as CostSheetItem
    ];
    const total = calculateTotalPayment(items);
    // 201 + 33.33 = 234.33
    expect(total).toBeCloseTo(234.33, 2);
  });

  it('deve formatar valores monetários em BRL (R$)', () => {
    const formatted = formatCurrency(234.33);
    // A formatação de BRL usa vírgula como separador decimal.
    // Dependendo do ambiente (node locale), pode retornar R$ 234,33 com espaço non-breaking.
    expect(formatted.replace(/\s/g, ' ')).toMatch(/R\$ 234,33/);
  });
});

describe('2. Módulo Escala: Restrição de Intervalo (24h)', () => {
  it('deve detectar conflito de 24h para o mesmo militar em eventos diferentes', () => {
    const existingEscalas = [
      {
        id: '1',
        status: 'em_edicao',
        formData: {
          eventDate: '2023-10-10',
          eventStartTime: '10:00',
          costSheetItems: [{ soldierMatricula: '123' }]
        }
      }
    ];

    // Novo evento no mesmo dia às 15:00 (< 24h)
    const conflict = hasIntervalConflict('123', '2023-10-10', '15:00', existingEscalas);
    expect(conflict).toBe(true);
  });

  it('não deve detectar conflito se a diferença for > 24h', () => {
    const existingEscalas = [
      {
        id: '1',
        status: 'em_edicao',
        formData: {
          eventDate: '2023-10-10',
          eventStartTime: '10:00',
          costSheetItems: [{ soldierMatricula: '123' }]
        }
      }
    ];

    // Novo evento no dia seguinte às 11:00 (> 24h)
    const conflict = hasIntervalConflict('123', '2023-10-11', '11:00', existingEscalas);
    expect(conflict).toBe(false);
  });
});

describe('3. Módulo Atestado: Sobreposição', () => {
  it('não deve permitir duas dispensas (ou faltas) para o mesmo militar no mesmo evento', () => {
    const items = [
      { soldierMf: '123', status: 'F' } as ReportEffectiveItem,
      { soldierMf: '123', status: 'D' } as ReportEffectiveItem
    ];
    expect(validateNoDuplicateAtestados(items)).toBe(false);
  });

  it('deve permitir dispensas de militares diferentes', () => {
    const items = [
      { soldierMf: '123', status: 'F' } as ReportEffectiveItem,
      { soldierMf: '456', status: 'D' } as ReportEffectiveItem
    ];
    expect(validateNoDuplicateAtestados(items)).toBe(true);
  });
});

describe('4. Módulo Homologador: Fluxo Cíclico', () => {
  it('deve permitir devolver a escala apenas se estiver "atestado"', () => {
    expect(canReturnToCommander('atestado')).toBe(true);
    expect(canReturnToCommander('em_edicao')).toBe(false);
    expect(canReturnToCommander('homologado')).toBe(false);
  });

  it('deve permitir que o Comandante edite a escala se for devolvida (esclarecimento_solicitado)', () => {
    expect(canCommanderEdit('esclarecimento_solicitado')).toBe(true);
    expect(canCommanderEdit('atestado')).toBe(false);
  });
});
