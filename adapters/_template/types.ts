/**
 * Adapter Template — Types
 * Tipos da API externa
 * 
 * Substituir pelos tipos reais do sistema que vai integrar
 */

// ===========================================
// Colaboradores
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
  // Adicionar campos específicos do sistema
}

// ===========================================
// Benefícios
// ===========================================

export interface ExternalBenefit {
  id: string;
  funcionario_id: string;
  tipo: string;        // VA | VR | VT
  valor: number;
  data_credito: string;
  // Adicionar campos específicos do sistema
}

// ===========================================
// Ponto / Horas
// ===========================================

export interface ExternalTimeEntry {
  id: string;
  funcionario_id: string;
  data: string;
  entrada: string;
  saida: string;
  // Adicionar campos específicos do sistema
}

// ===========================================
// Jobs
// ===========================================

export interface SyncJobData {
  companyId: string;
  adapter: string;     // erp | benefits | payroll | chat
  type: 'full' | 'incremental';
  params?: Record<string, any>;
}
