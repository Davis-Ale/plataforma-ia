# Observabilidade de processo

`ProcessObservabilityService.record` é uma operação interna do backend. O chamador fornece o companyId autenticado e os identificadores autorizados; nunca deve obter o tenant do input de uma capability. Não há endpoint novo. A consulta usa audit-logs e mantém seu RBAC, paginação e filtro por companyId.

Os registros usam metadata.observation version 1 no audit existente. Incluem operation, correlationId, horários UTC, durationMs, result, success e referências opcionais de capability/workflow/step. O correlationId é fornecido pelo backend ou gerado por execução; não é chave de autorização nem de idempotência. Não há deduplicação automática. Tentativas diferentes devem usar correlações diferentes quando não fizerem parte do mesmo processo.

O gateway registra cada tentativa com contexto válido após seu resultado, incluindo DENIED, APPROVAL_REQUIRED, INVALID_INPUT e EXECUTION_FAILED. CorrelationId opcional no CapabilityContext é propagado para a capability autorizada. Contexto ou identificadores inválidos falham antes da execução. Inputs, outputs, sessões, mensagens de exceção e stacks não são copiados para observabilidade. Os códigos de erro são controlados.

Workflows incluem a observação no audit de conclusão, falha ou cancelamento, sem duplicar o audit da transição. Run e steps compartilham o ID do run como correlationId; workflowStepId distingue os steps. A duração usa startedAt/completedAt persistidos. Cancelamento antes do início usa createdAt. A integração não altera transições, concorrência ou isolamento existentes.

OutcomeMetrics é uma estrutura opcional: timeSavedMs, slaTargetMs, slaMet, errorsAvoided e manualVolumeReduced. Tempo em milissegundos; volumes em contagens inteiras não negativas. Ausência significa não informado, nunca zero estimado. Valores devem vir de evidência ou medição de domínio pelo backend, sem cálculo automático nesta fundação.

Falha de persistência de observabilidade é propagada; não retorna sucesso silencioso. O registro ocorre após a execução e não desfaz efeitos de capabilities nem transições de workflows já aplicadas. Não existe garantia transacional nova, retry, provider externo ou contabilização de IA.
