/**
 * Adapter Template — Client
 * HTTP client para comunicação com sistema externo
 * 
 * REGRAS:
 * - Só chamada HTTP, sem lógica de negócio
 * - Retorna dados brutos do sistema externo
 * - Mapper transforma para modelo canônico
 */

import { Injectable, Logger } from '@nestjs/common';

export interface ExternalSystemConfig {
  baseUrl: string;
  apiKey?: string;
  token?: string;
  timeout?: number;
}

@Injectable()
export class TemplateClient {
  private readonly logger = new Logger(TemplateClient.name);
  private config: ExternalSystemConfig;

  constructor(config: ExternalSystemConfig) {
    this.config = { timeout: 30000, ...config };
  }

  /**
   * Busca lista de registros
   */
  async fetchAll<T>(endpoint: string, params?: Record<string, any>): Promise<T[]> {
    const url = new URL(endpoint, this.config.baseUrl);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    this.logger.debug(`Fetching ${url}`);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(this.config.timeout!),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      this.logger.error(`Erro ao buscar ${endpoint}:`, error);
      throw error;
    }
  }

  /**
   * Busca registro único
   */
  async fetchOne<T>(endpoint: string, id: string): Promise<T | null> {
    const url = `${this.config.baseUrl}${endpoint}/${id}`;
    
    this.logger.debug(`Fetching ${url}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(this.config.timeout!),
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      this.logger.error(`Erro ao buscar ${endpoint}/${id}:`, error);
      throw error;
    }
  }

  /**
   * Monta headers padrão
   * Sobrescrever conforme autenticação do sistema
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (this.config.apiKey) {
      headers['X-API-Key'] = this.config.apiKey;
    }

    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    }

    return headers;
  }
}
