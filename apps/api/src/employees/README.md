# Employees

Cadastro canônico de colaboradores por empresa.

## Dados do MVP

- Nome
- CPF
- E-mail
- Departamento
- Cargo
- Status

## Segurança

Todas as rotas exigem autenticação e contexto da empresa.

Criação, edição, arquivamento, restauração e consulta de arquivados exigem papel `OWNER` ou `ADMIN`.

## Exclusão

A rota `DELETE /employees/:id` arquiva o colaborador. Nenhum colaborador é removido fisicamente nessa etapa.
