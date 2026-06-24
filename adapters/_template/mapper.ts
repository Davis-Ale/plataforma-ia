/**
 * Adapter Template — Mapper
 * Transforma dados do sistema externo para modelo canônico
 * 
 * REGRAS:
 * - Só transformação de estrutura
 * - Nunca lógica de negócio
 * - Sistema externo → modelo interno
 */

import { Logger } from '@nestjs/common';

const logger = new Logger('TemplateMapper');

// ===========================================
// Tipos do sistema externo (exemplo)
// Substituir pelos tipos reais da API
// ===========================================

export interface ExternalEmployee {
  id: string;
  nome: string;
  cpf: string;
  email?: string;
  telefone?: string;
  data_admissao: string;
  data_demissao?: string;
  situacao: string;
}

// ===========================================
// Tipo canônico interno
// ===========================================

export interface CanonicalEmployee {
  externalId: string;
  name: string;
  cpf: string;
  email: string | null;
  phone: string | null;
  admissionDate: Date;
  dismissalDate: Date | null;
  status: 'active' | 'dismissed' | 'vacation' | 'leave';
}

// ===========================================
// Funções de mapeamento
// ===========================================

/**
 * Mapeia colaborador externo → canônico
 */
export function mapEmployee(external: ExternalEmployee): CanonicalEmployee {
  return {
    externalId: external.id,
    name: external.nome.trim(),
    cpf: normalizeCpf(external.cpf),
    email: external.email?.trim() || null,
    phone: external.telefone?.trim() || null,
    admissionDate: parseDate(external.data_admissao),
    dismissalDate: external.data_demissao ? parseDate(external.data_demissao) : null,
    status: mapStatus(external.situacao),
  };
}

/**
 * Mapeia lista de colaboradores
 */
export function mapEmployees(externals: ExternalEmployee[]): CanonicalEmployee[] {
  return externals
    .map((ext) => {
      try {
        return mapEmployee(ext);
      } catch (error) {
        logger.warn(`Erro ao mapear colaborador ${ext.id}: ${error}`);
        return null;
      }
    })
    .filter((e): e is CanonicalEmployee => e !== null);
}

// ===========================================
// Helpers
// ===========================================

function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, '').padStart(11, '0');
}

function parseDate(dateStr: string): Date {
  // Ajustar conforme formato do sistema externo
  // Suporta: "2024-01-15" ou "15/01/2024"
  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/');
    return new Date(`${year}-${month}-${day}`);
  }
  return new Date(dateStr);
}

function mapStatus(situacao: string): CanonicalEmployee['status'] {
  const normalized = situacao.toLowerCase().trim();
  
  if (normalized.includes('demit') || normalized.includes('deslig')) {
    return 'dismissed';
  }
  if (normalized.includes('feria') || normalized.includes('féria')) {
    return 'vacation';
  }
  if (normalized.includes('afast') || normalized.includes('licen') || normalized.includes('licença')) {
    return 'leave';
  }
  
  return 'active';
}
