# Arquitetura e evolução do banco

Monólito modular com React/Vite, NestJS, Prisma e PostgreSQL. O banco implementado está em `database/schema.prisma`; migrations SQL versionadas são a fonte para criação de ambientes. Não use `db push` no lugar das migrations, pois há constraints e triggers em SQL.

## Implementado

- `salons` 1:N `locations` e `salon_users`.
- `users` N:N `salons` por `salon_users`.
- `salon_users` N:N `roles` por `user_roles`; FK composta garante o mesmo salão.
- `roles` N:N `permissions` por `role_permissions`.
- `user_permission_overrides` concede ou nega uma capacidade individual, com DENY prioritário.
- `user_sessions`: token aleatório armazenado somente como SHA-256; associação ao usuário e ao vínculo; expiração e revogação. Cookie HttpOnly, SameSite=Lax, Secure em produção.
- `clients`: salão, contatos, nascimento, observações, responsáveis e versão otimista; arquivamento com data, responsável e motivo.
- `professionals`, `services`, `professional_services`, `work_periods` e `availability_blocks`: equipe, catálogo e disponibilidade.
- `appointments` e `appointment_services`: agenda com snapshots de nome/preço/duração. Histórico na auditoria; sem duplicar tabela de status. Unidades e relações usam FKs compostas por salão.
- `audit_logs`: ator, salão, entidade, ação, request ID, antes/depois e motivo. Sem atualização, exclusão ou truncamento por operações normais.

Senhas usam Argon2id. O backend limita tentativas, retorna falha de login genérica e valida Origin em toda alteração, inclusive login. Permissões não são copiadas para tokens duradouros: a sessão carrega a configuração atual a cada chamada.

O cadastro atual pertence ao salão, compartilhado entre unidades. A UI opera um salão por login; seleção de múltiplos salões não está disponível. O login usa o primeiro vínculo ativo de forma determinística. Antes de disponibilizar acesso multiempresa, implementar seleção explícita e troca de contexto com nova sessão.

## Modelo planejado para as próximas migrations

| Grupo           | Tabelas e relações                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acesso          | `user_locations` (vínculo–unidade), `password_reset_tokens` (usuário, hash, validade/uso)                                                                         |
| Configuração    | `salon_settings` (políticas tipadas por salão)                                                                                                                    |
| Profissionais   | `professionals` (salão, vínculo de usuário opcional único), `professional_locations` (N:N unidades)                                                               |
| Serviços        | `service_categories`, `services` (categoria, preço, duração, ativo), `professional_services` (N:N, preço/duração específicos)                                     |
| Disponibilidade | `professional_schedules`, `location_schedules`, `schedule_blocks` (intervalos e vigência)                                                                         |
| Agenda          | `appointments` (cliente/profissional/unidade, início/fim, status), `appointment_services` (serviço/preço/duração históricos), `appointment_status_history`        |
| Atendimento     | `attendances` (cliente, agendamento opcional único, início/fim real)                                                                                              |
| Comandas        | `orders` (cliente/unidade/totais/status), `order_attendances` (atendimento em no máximo uma comanda), `order_items` (serviço XOR produto), `order_status_history` |
| Consumos        | `service_product_usages` (item de serviço, produto, quantidade, unidade e movimento)                                                                              |
| Produtos        | `measurement_units`, `unit_conversions`, `product_categories`, `suppliers`, `products`, `product_suppliers`, `product_packagings`                                 |
| Estoque         | `inventory` (único por unidade/produto), `inventory_movements` (origem, quantidade, saldo anterior/posterior, custo histórico, motivo, usuário e reversão)        |
| Pagamentos      | `payment_methods`, `financial_accounts`, `payments` (comanda, valor, método, status), `payment_refunds` (pagamento original)                                      |
| Financeiro      | `financial_categories`, `financial_transactions` (receita/despesa por competência), `financial_settlements` (recebimentos/pagamentos por data)                    |
| Confiabilidade  | `idempotency_keys`, `outbox_events`                                                                                                                               |

A tabela acima registra o desenho inicial. Profissionais, serviços, vínculos, jornadas/bloqueios e agenda já foram implementados com os nomes descritos na seção Implementado e no schema atual. Produtos/estoque e comandas/atendimentos também foram implementados com os nomes físicos descritos nas seções abaixo. As tabelas restantes são planejadas e não foram criadas antecipadamente. As migrations de cada módulo trarão o modelo físico, FKs, índices, validações e testes próprios antes da implementação de suas telas.

## Decisões do fluxo futuro

Um agendamento ocupa um profissional. Vários profissionais para o mesmo cliente produzem agendamentos distintos e podem compartilhar uma comanda. Serviço consumido e produto vendido são registros diferentes, com vínculo quando necessário para não duplicar a baixa. A baixa acontece na confirmação do consumo; o fechamento realiza somente baixas pendentes.

Venda e liquidação são fatos diferentes: pagamento dividido liquida uma receita, não cria várias receitas. Fechamento bloqueia comanda e saldos e usa idempotência. Cobrança em provedor externo exige conciliação e estados pendente/confirmado; rollback local não desfaz cobrança externa.

## Validação e contratos

As entradas de clientes usam Zod no backend e controles HTML no frontend. As regras do servidor são definitivas. Contratos frontend estão em `apps/web/src/lib/api.ts`; extrair para pacote compartilhado quando houver contratos suficientes para justificar um pacote. Nesta entrega, CSS é próprio e não adiciona Tailwind sem necessidade. As escolhas preservam a arquitetura proposta, reduzindo dependências na fundação.

Migrations manuais complementam Prisma com constraints e triggers. Qualquer migration gerada deve ser revisada para preservar esses objetos. Nunca aplicar reset no banco operacional.

## Estoque

Saldo compartilhado por salão em `products.balance`, sempre na unidade-base imutável (`ml`, `g`, `un`). Embalagens são definições JSON validadas e versionadas junto com o produto. `stock_movements` preserva saldo anterior/posterior, delta, quantidade convertida, ator, motivo e dados históricos da embalagem/fornecedor/produto. Fornecedores têm cadastro próprio, status e versão.

Aritmética usa inteiros escalados (`bigint`, fator 1.000.000) para evitar perda de precisão no limite de `numeric(18,6)`. Não se convertem quantidades/custos para `number`. Conversões fracionárias inexatas são rejeitadas. Transação adquire advisory lock da chave de envio antes do lock da linha de produto; verifica reenvio, versão, saldo e fornecedor ativo, e grava saldo/movimento/auditoria. Edição/status usa o mesmo lock de produto; fornecedor é protegido contra desativação durante a entrada. Checks de banco impedem saldos negativos e movimentos incoerentes; trigger impede reescrita do histórico. Auditoria mascara custo quando falta a capacidade específica de consulta.

Testes em `tests/inventory.test.ts` e `tests/inventory.mjs`: precisão, unidades, idempotência, concorrência, isolamento, autorização, rollback e navegador. O banco real do salão não recebe fixtures.

## Comandas e atendimentos implementados

`salon_orders` reúne visitas de um cliente; `visits` guarda profissional e agendamento opcional único; `visit_items` mantém nomes, preços e durações históricos. FKs compostas impedem trocar salão/cliente/profissional ao importar uma reserva. `visit_consumptions` referencia movimentos existentes do estoque e preserva o custo de referência da última entrada conhecida. `order_commands` registra hash e alvo dos comandos para idempotência por salão/chave/ator.

Ordem de locks: advisory lock de comando, comanda e então agendamento/profissional/serviço/produto conforme a operação. Toda escrita em uma visita passa pelo lock da sua comanda. Assim, consumo, alteração de preço, cancelamento e finalização não podem ocorrer sobre versões incompatíveis. A agenda bloqueia alterações diretas de reservas importadas; o atendimento atualiza seu status e audita a transição. Totais usam bigint em centavos; quantidades usam bigint com escala de seis decimais. Comandas finalizadas não são receitas recebidas: pagamentos e fechamento financeiro permanecem pendentes.

O conceito de comanda própria nesta etapa é a que foi aberta pelo usuário; atendimento próprio é o atribuído ao profissional vinculado. Profissionais acessam uma lista própria com apenas seus atendimentos, sem dados de outros profissionais na mesma comanda.

## Pagamentos e financeiro implementados

`order_sales` registra uma venda por comanda e preserva o valor e data originais. `payments` registra valores aplicados e dinheiro entregue/troco; `payment_refunds` estorna recebimentos sem alterar a venda; `sale_voids` cancela a venda de forma rastreável. Registros são imutáveis, atores têm FK composta e estornos têm limite protegido também no banco. Comanda READY recebe checkout integral e passa a CLOSED; um estorno de recebimento a deixa DUE; um novo checkout quita o saldo sem nova venda; cancelamento comercial cria evento de cancelamento e estorna o saldo recebido, preservando serviços e consumo.

Os comandos financeiros reutilizam `order_commands` e o lock da comanda. Recebimentos, venda, status, auditoria e idempotência compartilham transação. Cálculos usam bigint em centavos; consultas agregam no PostgreSQL e operam sobre strings/inteiros sem float. Resumo por período considera cada evento em sua própria data no fuso do salão, sem reescrever datas históricas. Pendências atuais são separadas dos fluxos do período.
