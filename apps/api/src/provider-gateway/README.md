# Provider Gateway + Model Router

Fundação interna do backend, sem provider real, endpoint, credenciais, SDK ou dependência nova. ProviderGatewayModule registra os serviços no app, mas catálogo, políticas e adapters começam vazios. Não há geração simulada nem modelo habilitado por padrão. Adapters falsos existem somente nos testes Jest.

## Autoridade e isolamento

ProviderGateway.generate recebe CapabilityContext autenticado e ProviderGatewayRequest. companyId, userId e sessionId são obrigatórios; correlationId é preservado ou gerado uma vez. operationId, attemptNumber e vínculos opcionais de workflow são definidos pelo orquestrador do backend. Reentrega conserva a mesma identidade; uma tentativa nova precisa de novo número e da tentativa anterior finalizada, conforme AI Metering. Não gerar operationId novo para contornar duplicatas.

O request aceita capability, input, approvalId e identidade operacional. Não aceita seleção de provider, modelo, classe, prompt ou limites técnicos. Dados dentro de input não alteram a política de roteamento. AuthorizationGateway.prepareGenerationContext revalida tenant, vínculo, sessão, RBAC, input, autorização de domínio, Human Approval e autorização dos campos. A ação execute da capability não é chamada. Neste fluxo, a preparação consome aprovação de finalidade GENERATION quando exigida. Aprovações CONTEXT_PREPARATION e EXECUTION não são aceitas para geração; aprovação de geração não autoriza uma ação de domínio.

Contexto é preparado por requisição, sem banco acessado diretamente pelo gateway, histórico automático, cache compartilhado ou reuso cross-tenant. A instrução é configuração confiável do backend; o contexto continua dado não confiável, nunca autoridade. O prompt contém somente essa instrução e o conteúdo mínimo autorizado. Resultado devolve apenas companyId, correlationId e output, ou códigos de falha/aprovação; nunca inclui nomes técnicos ou decisão de modelo. Output é dado não confiável: qualquer ação posterior deve passar novamente pelo Authorization Gateway.

## Política do router

ModelRouter.registerModel e registerPolicy são configuração interna de bootstrap, sem API de tenant/usuário. Registros são validados, copiados, congelados e não podem ser sobrescritos. Todas as réplicas precisam receber a mesma configuração aprovada. Não há política persistida/editável, política comercial ou padrão permissivo nesta etapa. Políticas são indexadas por companyId e capability, sem herança entre tenants. Metadados globais de modelos não contêm contexto de tenant.

Classes lógicas: ECONOMY, BALANCED, REASONING. A classe não garante qualidade ou segurança sozinha. Cada entrada declara features TEXT/STRUCTURED_OUTPUT, risco máximo LOW/MEDIUM/HIGH aprovado pelo backend, latência esperada, janela de contexto, limite de output, moeda e tarifas inteiras em micros por milhão de tokens. São metadados internos, sem marcas ou modelos reais. Qualificação dessas propriedades caberá à integração de cada adapter, não à IA nem ao tenant.

Cada política exige modelos/classes permitidos, features necessárias, risco, moeda, teto de custo, teto de latência, limites de input/output em tokens, limite de output em bytes e instrução do backend. No máximo 16 candidatos por política; instrução até 4096 bytes UTF-8, output até 65536 bytes e deadline até 60000 ms. Não há defaults implícitos para configurações ausentes. O router elimina candidatos incompatíveis antes de ordenar. Prioridade COST ordena custo máximo, latência e chave estável; LATENCY inverte os dois primeiros critérios. A janela precisa comportar input + output máximos. Custo máximo é calculado com BigInt, arredondando para cima ao micro; moedas nunca são convertidas. Tarifas/tetos nulos ou negativos não habilitam execução gratuita.

## Budget, metering e adapter

Fluxo: Authorization Gateway + Context Engine → política/rota → contagem local do prompt completo → observabilidade da rota → AiMetering.reserve → adapter.generate → AiMetering.settle → observabilidade final → entrega do output.

A contagem é feita por countInputTokens do adapter, localmente e sem I/O externo, incluindo todos os tokens adicionais que seu mapeamento técnico introduzir. Bytes do Context Engine não são tokens. Contagem inválida ou superior ao teto impede reserva e dispatch. A reserva usa o teto inteiro de input/output da política e o custo máximo da rota. A Budget Policy existente revalida autorização e controla budget e concorrência de forma transacional por tenant. Ausência de budget, falha de metering, excesso, duplicata ou conflito interrompem o fluxo sem fallback. Sem adapter disponível não há chamada nem consumo sintético/reserva a registrar.

ProviderRegistry isola a implementação técnica. O contrato de generate recebe companyId, correlação, identidade da tentativa, modelo técnico, prompt, limites de tokens/bytes/custo/moeda e AbortSignal. O futuro adapter deve impor esses limites antes e durante a chamada, respeitar abort/deadline, limitar resposta durante leitura e devolver consumo efetivo em ProviderUsage. O gateway valida tenant, output, consumo e limites novamente; isso detecta violações, mas não impede retrospectivamente um provider de cobrar além do contrato. Não conectar provider real sem implementar essas garantias.

A liquidação usa companyId e userId originais da reserva, sem depender da sessão continuar ativa. Ela não autoriza novas chamadas. Uma resposta com consumo válido é liquidada com os valores reais mesmo em excesso; output fora dos limites é retido. Falhas/métricas inválidas ou respostas de outro tenant não inventam consumo zero: settle sem quantidades usa a cobrança conservadora integral do AI Metering. Falha de liquidação retém o resultado; a reserva pode continuar comprometida. Não há retry automático de liquidação.

O deadline aborta a invocação. Se não houver confirmação de término, a reserva permanece RESERVED, preservando também concorrência: nenhum output é entregue, nenhum saldo é liberado e não há retry/fallback. Reconciliação de reservas abandonadas não entra nesta fundação. Uma exceção terminal do adapter é liquidada como FAILED com uso desconhecido; adapters futuros só podem finalizar essa promessa quando sua tentativa estiver terminada. Não confundir timeout remoto de estado desconhecido com término confirmado.

## Fallback e observabilidade

Fallback é lógico, anterior ao dispatch e somente quando allowFallback=true: se o adapter da primeira rota estiver ausente, selecionar o próximo candidato elegível. Não enfraquece autorização, risco, capacidade, latência ou custo. Se todos estiverem ausentes, retorna PROVIDER_UNAVAILABLE. Se não houver candidato que satisfaça a política, retorna NO_ROUTE. Falha de tokenização, orçamento, adapter ou timeout não provoca retry nem troca de modelo nesta etapa.

Observabilidade usa ai.model.route/ai.model.fallback e ai.provider.generate com companyId, correlação, capability, resultado e latência. Workflow/step seguem no metering e na observação final. Metering persiste classe/modelo lógico e consumo pelo caminho já existente, sem nome técnico do provider. Prompt, contexto, output, credenciais e exceções brutas não são registrados. Falha de audit antes do dispatch o bloqueia; falha final impede entrega, mantendo o consumo já liquidado.

## Limites desta entrega

Sem OpenAI/Anthropic/outro provider real, RAG, embeddings, frontend, dashboard, plano comercial, decisões dinâmicas de saúde de providers, persistência de catálogo, circuit breaker, retry engine ou reconciliação. Testes exercitam os serviços reais de autorização/contexto/router com adapters exclusivamente locais de teste e metering controlado; não comprovam comportamento de rede, tokenização real, preços ou qualidade de modelos. O controle transacional de budget continua no AI Metering existente.
