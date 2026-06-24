# Adapter Template

Template base para criar adapters de integração com sistemas externos.

## Como usar

1. Copiar esta pasta para `adapters/{client-slug}/{tipo}/`
   Exemplo: `adapters/empresa-abc/erp/`

2. Renomear classes e imports

3. Implementar métodos específicos do sistema

## Estrutura

| Arquivo | Função |
|---------|--------|
| `client.ts` | HTTP client — só chamada, sem lógica |
| `mapper.ts` | Transforma externo → canônico |
| `sync.ts` | Job BullMQ: client → mapper → save → log |
| `types.ts` | Tipos da API externa |
| `module.ts` | NestJS module (criar quando necessário) |

## Regras

- Nunca lógica de negócio no client
- Mapper só transforma estrutura
- Toda chamada via fila BullMQ
- Log em integration_logs
- Folha sempre READ ONLY
