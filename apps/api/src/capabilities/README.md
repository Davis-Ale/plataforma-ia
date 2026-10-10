# Capability approval

O backend registra a política de cada capability. `approval: { mode: "REQUIRED", approverRoles: [...] }` exige decisão humana antes da execução. Somente `approval: { mode: "NONE" }` dispensa o gate. Política ausente bloqueia por padrão; uma política REQUIRED sem papéis aprovadores também bloqueia.

O contexto com companyId, userId e sessionId vem do backend autenticado, separado do input da IA. `AuthorizationGateway.execute` revalida sessão, tenant, RBAC, input e autorização de domínio em cada tentativa. Sem approvalId, retorna APPROVAL_REQUIRED e o identificador persistido da solicitação PENDING.

`HumanApprovalService.decide` é uma operação interna do backend para receber a decisão de um humano autenticado. Não deve ser registrada como capability da IA. Ela revalida sessão, tenant e os papéis aprovadores configurados, impede autoaprovação e aceita uma única decisão APPROVED ou REJECTED para cada solicitação PENDING.

Uma nova tentativa pelo gateway deve informar o approvalId e o mesmo input. A aprovação é vinculada à empresa, solicitante, capability e hash do input serializado; o input não é armazenado nem auditado pelo gate. O backend que recebe a decisão deve apresentar ao humano a solicitação correspondente. Alterações no input exigem uma nova aprovação.

A finalidade também é persistida e obrigatória em criação, decisão e consumo: CONTEXT_PREPARATION, GENERATION ou EXECUTION. execute fixa EXECUTION; prepareContext fixa CONTEXT_PREPARATION; prepareGenerationContext fixa GENERATION e é usado pelo Provider Gateway. A finalidade não é escolhida pelo input da IA. decide exige a finalidade apresentada ao humano como quarto argumento; empresa, ID, finalidade e estado pendente precisam coincidir. Uma aprovação nunca pode ser transferida para outro fluxo. O audit registra a finalidade em todas as transições.

O schema adiciona purpose nullable sem default para preservar registros antigos sem inventar autorização. Registros legados com purpose null são recusados para decisão e consumo; solicitações novas exigem finalidade válida. É necessário aplicar o schema no banco alvo antes de usar o código atualizado, pelo procedimento existente do projeto, sem accept-data-loss. Nenhum backfill atribui finalidade a aprovações antigas.

Antes da execução, o gate revalida as permissões atuais do aprovador e consome a aprovação atomicamente. CONSUMED preserva a decisão e impede reutilização, inclusive após falha ou interrupção da execução. Não há execução automática, retry ou garantia de conclusão: uma nova tentativa exige nova aprovação.

Criação, decisão e consumo são persistidos junto ao audit na mesma transação. Falha de audit bloqueia a operação e desfaz a transição. O audit das ações de domínio permanece nos serviços existentes.
