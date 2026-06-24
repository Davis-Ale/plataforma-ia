# Plataforma de Automação Operacional com IA

Plataforma multi-tenant para conectar sistemas isolados e automatizar RH/DP/Financeiro com IA.

## Modelo de Negócio

- **80% core fixo** — construído uma vez, usado por todos os clientes
- **20% adaptação** — adapters específicos por cliente
- **5-7 dias** para adicionar novo cliente depois do core pronto

## Setup Rápido

```bash
# 1. Instalar dependências
pnpm install

# 2. Copiar ambiente
cp .env.example .env

# 3. Subir containers (PostgreSQL + Redis)
pnpm docker:up

# 4. Gerar Prisma Client
pnpm db:generate

# 5. Rodar migrations
pnpm db:migrate

# 6. Iniciar API
pnpm dev

# Testar: http://localhost:3000/api/v1/health
```

## Scripts Principais

| Comando | Descrição |
|---------|-----------|
| `pnpm dev` | Inicia API em modo dev |
| `pnpm dev:web` | Inicia portal web |
| `pnpm docker:up` | Sobe PostgreSQL + Redis |
| `pnpm docker:down` | Para containers |
| `pnpm db:generate` | Gera Prisma Client |
| `pnpm db:migrate` | Roda migrations |
| `pnpm db:studio` | Abre Prisma Studio |

## Estrutura

```
├── apps/api/           # NestJS — API principal
├── apps/web/           # Next.js — Portal operacional
├── apps/admin/         # Next.js — Painel interno
├── packages/database/  # Prisma schema
├── packages/auth/      # JWT, RBAC
├── packages/queues/    # BullMQ
├── packages/ai/        # Intent router, tool calling
├── adapters/_template/ # Template para novos clientes
└── adapters/{cliente}/ # Adapters por cliente
```

## Segmentos-Alvo

- Facilities e serviços
- Escritórios de contabilidade
- Clínicas e redes de saúde
- Construtoras e incorporadoras
- Redes de franquias
- Distribuidoras e atacadistas

## Documentação

Leia o `CLAUDE.md` na raiz — contém todas as regras do projeto.
