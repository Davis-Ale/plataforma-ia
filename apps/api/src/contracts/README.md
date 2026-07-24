# Contracts

Contratos canônicos dos colaboradores por empresa.

## Dados do MVP

- Colaborador
- Função
- Vínculo
- Data de admissão
- Unidade
- Regime
- Status

## Segurança

Todas as rotas exigem autenticação e contexto da empresa.

Criação, edição, arquivamento, restauração e consulta de arquivados exigem papel `OWNER` ou `ADMIN`.

## Exclusão

A rota `DELETE /contracts/:id` arquiva o contrato. O registro não é removido fisicamente.
