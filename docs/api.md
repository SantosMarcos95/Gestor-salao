# API inicial

Comissões por profissional e operações de caixa: [regras, endpoints e publicação](comissoes-caixa.md).

Base `/api`. Corpo JSON. Autenticação por cookie `salao_session`. Alterações exigem `Origin` igual a `WEB_ORIGIN`. CORS credenciado para uma única origem. Respostas não são cacheadas.

| Método | Rota                           | Autorização                                      | Função                                                 |
| ------ | ------------------------------ | ------------------------------------------------ | ------------------------------------------------------ |
| GET    | `/health`                      | Pública                                          | Disponibilidade com consulta ao banco                  |
| POST   | `/auth/login`                  | Pública, limitada                                | `{email,password}`; cria sessão                        |
| GET    | `/auth/me`                     | Sessão                                           | Nome, salão, roles e permissões efetivas               |
| POST   | `/auth/logout`                 | Sessão                                           | Revoga sessão e apaga cookie                           |
| GET    | `/clients?search=&page=1`      | `clientes.visualizar_todos`                      | Busca paginada, 20 registros                           |
| POST   | `/clients`                     | `clientes.criar`                                 | Criação e auditoria atômicas                           |
| PATCH  | `/clients/:id`                 | `clientes.editar` + `clientes.visualizar_todos`  | Atualização com versão obrigatória                     |
| DELETE | `/clients/:id`                 | `clientes.excluir` + `clientes.visualizar_todos` | Arquivamento com `{version,reason}`                    |
| GET    | `/access/users?search=&page=1` | `usuarios.gerenciar`                             | Usuários do salão, 20 por página, incluindo inativos   |
| POST   | `/access/users`                | `usuarios.gerenciar` + `roles.gerenciar`         | Nova conta e vínculo com perfis e ajustes individuais  |
| PATCH  | `/access/users/:id`            | `usuarios.gerenciar` + `roles.gerenciar`         | Altera acesso pelo ID do vínculo, com revisão e motivo |
| GET    | `/access/roles`                | `roles.gerenciar`                                | Perfis do salão com permissões e revisão               |
| GET    | `/access/permissions`          | `roles.gerenciar`                                | Catálogo de permissões                                 |
| POST   | `/access/roles`                | `roles.gerenciar`                                | Cria perfil personalizado                              |
| PATCH  | `/access/roles/:id`            | `roles.gerenciar`                                | Edita perfil não protegido, com revisão e motivo       |
| GET    | `/audit?page=1`                | `auditoria.visualizar`                           | Histórico paginado com antes/depois                    |

Cliente: `name` obrigatório (2–150), `phone`, `whatsapp`, `email`, `birthDate` (`YYYY-MM-DD` ou null), `notes` (até 2000). PATCH recebe o formulário completo, incluindo `name` e `version`. IDs e escopo são controlados pelo servidor. Datas impossíveis ou futuras são rejeitadas. Campos desconhecidos nos comandos são rejeitados.

Busca usa nome, telefone e e-mail; não normaliza diferentes formatos de telefone nesta entrega. Listas retornam `{items,total,page,pageSize}`. Datas são ISO. Valores monetários futuros usarão strings decimais.

Erros: 400 entrada inválida; 401 sessão ausente/expirada; 403 sem permissão/origem não autorizada; 404 registro fora do escopo ou inexistente; 409 versão/conflito de integridade; 429 muitas requisições; 500/503 falha interna/indisponibilidade. O corpo inclui mensagem segura e `requestId`, sem SQL, senhas ou stack trace. A documentação OpenAPI gerada será adicionada na próxima fase; esta tabela é o contrato atual.

## Administração de acesso

Criação de usuário: `{name,email,password,active,roleIds,overrides,reason}`. Senha de 8–128 caracteres, nome de 2–150, e-mail normalizado. Pelo menos um perfil do salão é obrigatório. `overrides` recebe `[{code,effect}]`, com `ALLOW` ou `DENY`; negação prevalece. E-mail já utilizado gera conflito, sem vincular automaticamente uma conta de outro salão.

Edição de acesso: `{active,roleIds,overrides,revision,reason}`. O ID é de `salon_users`. Nome, e-mail e credenciais existentes não são alterados. Desativação revoga sessões desse vínculo; reativação exige novo login.

Perfis: `{name,permissions,reason}`, acrescentando `revision` no PATCH. `permissions` é uma lista de códigos. O Administrador é protegido contra edição. Perfis personalizados recebem código interno do servidor. Não há exclusão de perfis nesta etapa.

Motivos têm 5–500 caracteres. Revisões representam o estado apresentado; mudanças nos perfis também invalidam a revisão de seus usuários. Conflitos retornam 409 e exigem recarregar a edição. Todos os escritores de acesso bloqueiam a linha do salão e revalidam o ator dentro da transação. Nenhum gestor pode conceder permissões que não possui nem modificar usuário com permissões efetivas superiores ao seu acesso.

Deve permanecer ao menos um vínculo ativo, com usuário ativo, perfil protegido ROLE_ADMIN e permissões efetivas `usuarios.gerenciar` e `roles.gerenciar`. Alteração, auditoria e revogação são atômicas. A auditoria não contém senha ou hash. Permissões são recalculadas em cada requisição autenticada.

## Senhas

- `POST /auth/password`: qualquer sessão ativa, inclusive com troca obrigatória. Recebe `{currentPassword,newPassword}`. Nova senha de 8–128 caracteres e diferente da atual. Confirma a senha atual e revoga todas as sessões da conta, inclusive a atual; o usuário precisa entrar novamente.
- `POST /access/users/:id/password`: exige `usuarios.gerenciar` e `roles.gerenciar`. Recebe `{currentPassword,newPassword,reason,revision}`. `currentPassword` é a senha do administrador; `newPassword` é a senha provisória do usuário selecionado. O ID identifica o vínculo do salão. Impede redefinição da própria conta por este caminho, de contas mais privilegiadas e de contas com qualquer vínculo em outro salão.
- `GET /auth/me` também retorna `membershipId` e `mustChangePassword`. Após redefinição, o usuário só pode consultar o próprio perfil, trocar senha e sair. A restrição é aplicada na API.

Ambos os comandos de senha têm limite de 8 requisições por minuto por IP. A confirmação digitada no formulário é validada no frontend; o servidor valida a senha nova e a senha atual. Senha atual incorreta retorna 400, preservando a sessão; sessão revogada retorna 401. Revisão desatualizada na redefinição retorna 409.

Login e alteração de senha usam bloqueios na mesma ordem: salão e usuário. O login revalida o hash após obter o bloqueio para impedir criar uma sessão com senha antiga depois de uma troca. Alteração, revogação e auditoria são atômicas. Eventos `SENHA_ALTERADA` e `SENHA_REDEFINIDA` não contêm senha ou hash.

A senha provisória é definida pelo administrador e entregue diretamente ao titular, sem envio automático. Contas novas continuam usando a senha inicial de cadastro; o titular pode trocá-la em Minha conta. A exigência de troca aplica-se às redefinições administrativas. Recuperação por e-mail e recuperação sem sessão do único administrador ainda não estão disponíveis.

## Profissionais e serviços

| Método | Rota                        | Permissão                                    | Função                                                          |
| ------ | --------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| GET    | `/professionals`            | `profissionais.gerenciar`                    | Lista paginada                                                  |
| GET    | `/professionals/users`      | `profissionais.gerenciar`                    | Usuários ativos disponíveis para vínculo, nome/e-mail/ID apenas |
| POST   | `/professionals`            | `profissionais.gerenciar`                    | Cadastra profissional ativo                                     |
| PATCH  | `/professionals/:id`        | `profissionais.gerenciar`                    | Edita dados e vínculo                                           |
| PATCH  | `/professionals/:id/status` | `profissionais.gerenciar`                    | Ativa/desativa com motivo                                       |
| GET    | `/services`                 | `servicos.visualizar`                        | Lista paginada                                                  |
| POST   | `/services`                 | `servicos.criar`                             | Cadastra serviço ativo                                          |
| PATCH  | `/services/:id`             | `servicos.visualizar` + `servicos.editar`    | Edita descrição, duração e preço                                |
| PATCH  | `/services/:id/status`      | `servicos.visualizar` + `servicos.desativar` | Ativa/desativa com motivo                                       |

Listas aceitam `search` (nome, até 150 caracteres), `page` e `status=active|inactive|all`; padrão ativos, 20 itens por página. `/professionals/users` busca nome/e-mail, retorna somente usuários ativos ainda não vinculados e não altera permissões.

Profissional: `{name,phone,email,specialty,notes,membershipId,reason}`. Nome de 2–150 caracteres; telefone/e-mail opcionais; especialidade até 150; observações até 2000. `membershipId` opcional/null. Um usuário pode estar vinculado a um único profissional do mesmo salão; a chave estrangeira composta também garante o escopo no banco. Novo vínculo exige usuário ativo. Alterar dados de um profissional mantém um vínculo anterior mesmo que o usuário tenha sido desativado depois.

Serviço: `{name,description,durationMinutes,price,reason}`. Nome de 2–150; descrição opcional até 2000; duração inteira de 1–1440 minutos; preço decimal **string** com ponto e no máximo duas casas, de `0` a `999999999999.99`. A resposta sempre usa duas casas, como `85.50`. Não aceita preço como número JSON, negativo, notação científica ou vírgula. A interface aceita vírgula e converte o separador sem conversão monetária para float.

Edições recebem também `version`; status recebe `{active,version,reason}`. Motivo de 5–500 caracteres em cada alteração, inclusive cadastro. Conflitos de versão ou vínculo duplicado retornam 409. Alteração e auditoria são atômicas. Não há exclusão física. Status do profissional e acesso do usuário são independentes: desativar o profissional não revoga o login.

Disponibilidade, serviços executados por profissional, preços individuais, comissões e agenda não fazem parte deste cadastro inicial. Preços atuais do catálogo não substituem os preços históricos que deverão ser registrados nas futuras comandas.

## Disponibilidade e serviços por profissional

`GET /availability/professionals?search=&status=active|inactive|all&page=1` lista somente id, nome e status, com 20 itens por página. Exige `agenda.gerenciar_disponibilidade` **ou** `profissionais.gerenciar`. Todos os endpoints abaixo restringem os dados ao salão da sessão.

Jornadas e bloqueios exigem `agenda.gerenciar_disponibilidade`:

- `GET /availability/:id/work`: `{ version, timezone, periods }`.
- `PUT /availability/:id/work`: `{ version, reason, periods: [{ weekday, startMinute, endMinute }] }`. Domingo é 0; sábado é 6. Minutos desde meia-noite, início entre 0–1439 e fim entre 1–1440. Até 42 períodos; não podem se sobrepor no mesmo dia. Lista vazia significa nenhuma jornada. Períodos adjacentes são aceitos. A substituição é atômica e incrementa a versão do profissional.
- `GET /availability/:id/blocks?status=active|inactive|all&page=1`: lista paginada e `timezone`. `active` significa não cancelado, incluindo períodos passados; `inactive`, cancelado.
- `POST /availability/:id/blocks`: `{ startLocal: "2026-10-05T09:00", endLocal: "2026-10-05T12:00", description, reason }`. Datas locais no fuso cadastrado do salão, anos 1900–2100; resposta em ISO UTC. Datas impossíveis e horários inexistentes/ambíguos em transições de fuso são rejeitados. Intervalos `[início,fim)`; bloqueios adjacentes são aceitos, sobrepostos retornam 409. Podem abranger vários dias e não dependem da jornada.
- `PATCH /availability/:id/blocks/:blockId/cancel`: `{ version, reason }`. Preserva o bloqueio, marca o cancelamento e incrementa sua versão. Reenvio com versão antiga ou bloqueio já cancelado retorna 409. Correção de datas é feita por cancelamento e novo cadastro.

Serviços realizados exigem `profissionais.gerenciar`:

- `GET /availability/:id/services`: `{ version, services: [{ id, name, active }] }`.
- `GET /availability/:id/service-options?search=&page=1`: catálogo ativo paginado, somente id/nome/status; não exige acesso a preços.
- `PUT /availability/:id/services`: `{ version, reason, serviceIds: [...] }`. Substitui os vínculos e incrementa a versão do profissional. Até 500 IDs únicos. Novos vínculos exigem serviços ativos do mesmo salão. Vínculos já existentes com serviços desativados podem ser preservados ou removidos; a desativação é exibida na interface. Preço e duração continuam no catálogo.

Motivos têm 5–500 caracteres. Mudanças geram auditoria antes/depois na mesma transação. Escritas de jornada, vínculos e bloqueios bloqueiam a linha do profissional; vínculos também bloqueiam os serviços durante a validação. Jornada e vínculos compartilham a versão do cadastro profissional. Bloqueios têm versão própria. A futura agenda deverá usar o mesmo bloqueio de profissional antes de conferir conflitos e considerar jornada, bloqueios, profissional e serviço ativos. Esta etapa ainda não cria agendamentos.

## Agenda

Todos os endpoints `/appointments` exigem sessão e permissão de visualização da agenda. `agenda.visualizar_todas` permite consultar o salão; `agenda.visualizar_propria` restringe pelo vínculo profissional–usuário, inclusive detalhes, filtros e histórico. Criar, editar e cancelar exigem adicionalmente as capacidades `agenda.criar_*`, `agenda.editar_*` e `agenda.excluir_*`, respectivamente. Remarcação para outro profissional exige acesso à origem **e** ao destino. Permissão geral de edição não amplia uma visualização restrita à agenda própria.

- `GET /appointments/context?search=&page=1&action=visualizar|criar|editar`: profissionais paginados (20), unidades ativas, fuso do salão e data local atual. Opções de criação/edição incluem somente profissionais ativos acessíveis à ação.
- `GET /appointments/clients?search=&page=1&action=criar|editar`: id/nome de clientes ativos. `clientes.visualizar_todos` consulta o salão; `clientes.visualizar_relacionados` consulta clientes cadastrados pelo titular ou que tenham agendamento com seu profissional. Um profissional sem clientes relacionados precisa que um usuário autorizado faça a primeira reserva. Um cliente já vinculado ao agendamento pode ser mantido em uma edição sem ampliação do acesso ao catálogo de clientes.
- `GET /appointments/services?professionalId=UUID&search=&page=1&action=criar|editar`: serviços ativos realizados pelo profissional, com duração e preço decimal em string.
- `GET /appointments?date=2026-10-05&days=1|7&page=1&professionalId=UUID&status=all`: grade no fuso do salão. Filtros opcionais por profissional e status (`SCHEDULED`, `CONFIRMED`, `ARRIVED`, `COMPLETED`, `NO_SHOW`, `CANCELLED`). A página representa até 20 profissionais, incluindo inativos com histórico. Retorna agendamentos, jornadas e intervalos bloqueados; não expõe a descrição privada dos bloqueios. Até 1.000 agendamentos e 1.000 bloqueios por consulta; exceder exige reduzir o período ou filtrar profissional, sem truncamento silencioso.
- `GET /appointments/:id`: detalhes e últimas 50 alterações com ator, data, motivo e transição de status. O histórico completo permanece na auditoria autorizada.
- `POST /appointments`: `{ requestKey: UUID, professionalId, clientId, locationId, startLocal: "2026-10-05T09:00", serviceIds: [UUID], notes, reason }`. De 1–20 serviços únicos, na ordem de execução, com duração total máxima de 24 horas. Fim calculado no servidor. O mesmo `requestKey` e corpo não duplicam o agendamento nem a auditoria; reutilizar a chave com corpo diferente retorna 409. Reenvio é reautorizado. Datas locais válidas entre 1900–2100; reservas passadas são permitidas para registro.
- `PATCH /appointments/:id`: mesmos campos da criação, substituindo `requestKey` por `version`. Edita/remarca somente `SCHEDULED` ou `CONFIRMED`. Serviços mantidos preservam nome, preço e duração históricos, salvo preço explicitamente editado; serviços adicionados recebem os valores atuais como padrão. Todos precisam continuar ativos e vinculados ao profissional de destino. O cliente precisa continuar ativo.
- `PATCH /appointments/:id/status`: `{ version, status, reason }`. Agendado → confirmado, chegou, falta ou cancelado; confirmado → agendado, chegou, falta ou cancelado; chegou → concluído ou cancelado. Concluído, falta e cancelado são finais. Falta exige início já ocorrido; conclusão exige término já ocorrido. Cancelamento usa permissão de exclusão e preserva o registro.

Jornadas, bloqueios e agendamentos usam intervalos `[início,fim)`. Criação/remarcação bloqueia as linhas dos profissionais em ordem estável antes de validar jornada, bloqueios e reservas. Alterações do mesmo agendamento bloqueiam primeiro sua linha e verificam versão. Cliente e serviços também são bloqueados ao validar cadastros e capturar valores. Bloqueios não podem conflitar com reservas; mudanças de jornada não podem invalidar reservas futuras. Cancelados e faltas liberam o intervalo; concluídos preservam a ocupação histórica. Sobreposição continua desabilitada, mesmo com a capacidade `agenda.sobrepor`, pois não há política habilitada para exceções nesta etapa.

Criação e edição aceitam `servicePrices?: [{serviceId: UUID, price: "40.10"}]`, com até 20 serviços únicos pertencentes a `serviceIds`. Alterar o preço padrão/histórico exige `comandas.alterar_preco`, além da permissão de criar/editar o agendamento. Preço deve ser string não negativa, com até 12 dígitos inteiros e 2 decimais; zero é permitido. O valor é salvo somente no item do agendamento, preservando o catálogo. Omitir o preço mantém o valor histórico ao editar ou usa o catálogo ao criar. Valores alterados aparecem na auditoria antes/depois e participam da chave de idempotência.

`total` e preços trafegam como strings decimais exatas. Os valores são previstos: esta etapa não abre atendimento, comanda, pagamento nem movimenta estoque. Status e toda alteração geram auditoria atômica. Na agenda, `reason` é opcional (até 500 caracteres); omitido, nulo ou em branco é registrado como texto vazio. Conflitos de versão e disponibilidade retornam 409; recursos de outros salões/fora do acesso retornam 404; falta de capacidade retorna 403.

## Produtos, fornecedores e estoque

- `GET /products?search=&status=active|inactive|all&page=1`: catálogo paginado (20), exige `produtos.visualizar`. Saldo e indicador de reposição são retornados somente com `estoque.visualizar`.
- `POST /products`: `name`, `description?`, `baseUnit` (`ml`, `g`, `un`), `minimum`, `packages` e `reason`; exige `produtos.criar`. Saldo inicial zero; registre uma entrada ou inventário para inicializar.
- `PATCH /products/:id`: mesmos campos mais `version`; exige visualizar/editar. Unidade-base não muda após criar. Embalagens: até 20 itens `{name, quantity, unit}`, nomes únicos; `unit` aceita a unidade-base, `l` para ml ou `kg` para g. Alterações não reescrevem movimentos anteriores.
- `PATCH /products/:id/status`: `{active, version, reason}`, exige visualizar/desativar. Produto inativo mantém saldo e histórico, mas não aceita movimentos.
- `GET /suppliers`: busca/filtro/paginação como produtos; exige `produtos.visualizar`.
- `POST /suppliers`, `PATCH /suppliers/:id`, `PATCH /suppliers/:id/status`: cadastro com `name`, `phone?`, `email?`, `notes?`, motivo; edição/status com versão. Usam respectivamente `produtos.criar`, `produtos.editar` e `produtos.desativar` (edição/status também exigem visualizar).
- `GET /products/:id/movements?page=1`: histórico paginado, exige `produtos.visualizar` e `estoque.visualizar`. Inclui ator (`actorId`), motivo, data, saldo anterior/posterior, variação e cópias históricas de produto, fornecedor e embalagem. A auditoria identifica o nome do ator.
- `POST /products/:id/movements`: exige as duas permissões de consulta e a permissão do tipo. Corpo: `{kind, quantity, packageName?, supplierId?, unitCost?, version, reason, requestKey}`. `ENTRY` → `estoque.entrada`; `LOSS` → `estoque.registrar_perda`; `OUT` → `estoque.baixa_manual`; `ADJUST` → `estoque.ajustar`.

Quantidades/custos são strings decimais positivas ou zero, sem notação científica, até 12 algarismos inteiros e 6 casas decimais. Entradas, perdas e baixas exigem quantidade maior que zero. `packageName` seleciona uma embalagem do produto e converte a quantidade para a unidade-base; resultados com mais de seis casas são rejeitados, sem arredondamento silencioso. Ajuste recebe **saldo contado na unidade-base**, admite zero e registra a diferença; exige versão atual e não aceita embalagem. Ajuste sem diferença é rejeitado.

Fornecedor ativo do mesmo salão e custo são opcionais somente em entradas. `unitCost` é o custo em reais **por unidade-base**, mesmo quando a entrada informa embalagem. A entrada pode registrar um custo sem permissão de consulta; leitura do custo, inclusive na auditoria, exige `produtos.visualizar_custo`. Não há cálculo de custo médio nem lançamento financeiro nesta etapa.

O saldo é compartilhado pelo salão; separação por unidade, transferências, lotes/validade e inventários coletivos ainda não foram implementados. Saldo negativo permanece bloqueado, inclusive com `estoque.permitir_negativo`, pois a política de exceção não está habilitada.

Produto bloqueado em transação serializa cadastro/status/movimentos. Movimento, saldo e auditoria são gravados atomicamente. `requestKey` UUID deve ser mantida com o mesmo corpo após falha de rede: reenvio retorna o movimento original; reutilizar a chave com outro corpo, produto ou ator gera 409. Versão desatualizada gera 409. Movimentos não podem ser editados, apagados ou truncados; correções exigem novo movimento com motivo. As chaves estrangeiras compostas impedem referências entre salões.

## Comandas e atendimentos

As rotas desta etapa não registram recebimentos. A comanda reúne serviços de um cliente; seu status é `OPEN` (aberta), `READY` (serviços finalizados, valores preservados) ou `CANCELLED`. Pagamentos e fechamento financeiro serão implementados na próxima fase.

Toda alteração usa POST com `requestKey` UUID, `reason?` (opcional, até 500 caracteres) e, exceto abertura, `version`. A chave é preservada com o mesmo corpo em reenvios. Repetições do mesmo comando retornam o registro atual sem repetir a operação; outra ação/corpo/ator com a mesma chave retorna 409. Versão incorreta retorna 409. Auditoria, comando e alteração são atômicos.

### Comandas

- `GET /orders?search=&status=OPEN|READY|CANCELLED|all&page=1&clientId=UUID`: 20 por página; `clientId` opcional permite consultar o histórico na lista de clientes. `comandas.visualizar_todas` acessa todas do salão; `comandas.visualizar_proprias` acessa apenas comandas **abertas pelo titular**. Estas permissões não substituem as capacidades de alteração.
- `GET /orders/:id`: visitas, itens históricos, consumos, totais e últimas 50 atividades com ator/data/motivo. A mesma regra de escopo vale para todas as escritas em comandas.
- `GET /orders/options/clients`: busca paginada de id/nome dos clientes ativos; exige visualizar comanda, `comandas.abrir` e `clientes.visualizar_todos`.
- `POST /orders`: `{clientId, notes?, reason?, requestKey}`, mesmas capacidades da seleção de clientes. Comanda inicia vazia, valores zero.
- `GET /orders/options/professionals` e `/orders/options/services?professionalId=UUID`: opções paginadas para cadastrar atendimento; exige visualizar comanda e `comandas.editar`. Serviços ativos vinculados ao profissional ativo.
- `POST /orders/:id/visits`: `{version, professionalId, serviceIds:[UUID], reason?, requestKey}`. Exige `comandas.editar`. Até 100 atendimentos por comanda e 20 serviços únicos por atendimento; mesma pessoa atendida, profissionais distintos permitidos. Registra nome/preço/duração históricos. Cria atendimento `WAITING`.
- `GET /orders/:id/appointments`: agenda do cliente, paginada, com busca por serviço/profissional e somente registros não encerrados e ainda não importados. Exige `comandas.editar` e escopo de visualização da agenda.
- `POST /orders/:id/import`: `{version, appointmentId, appointmentVersion, reason?, requestKey}`, mesmas capacidades. Importação única por agendamento, preserva preço previamente combinado mesmo que o catálogo mude. O agendamento fica associado ao atendimento, que passa a controlar seu status. Edição direta na agenda fica bloqueada.
- `POST /orders/:id/visits/:visitId/prices`: `{version, prices:[{id:visitItemId, price:"40.10"}], reason?, requestKey}`. A versão é da **comanda**; exige `comandas.editar` e `comandas.alterar_preco`. Somente itens do atendimento, durante `WAITING`/`IN_PROGRESS`; preço não negativo, até 12 dígitos inteiros e 2 decimais. Catálogo e agendamento original não são reescritos.
- `POST /orders/:id/discount`: `{version, discount:"5.05", reason?, requestKey}`; `comandas.editar` + `comandas.aplicar_desconto`. Desconto fixo em reais sobre o subtotal de serviços não cancelados, entre zero e subtotal. Se a redução de valores/cancelamento de atendimento deixaria o desconto maior que o subtotal, reduza o desconto antes.
- `POST /orders/:id/ready`: `{version, reason?, requestKey}`; `comandas.fechar`. Requer ao menos um atendimento concluído e nenhum aguardando/em andamento. Preserva valores e marca serviços finalizados; não recebe nem quita a comanda.
- `POST /orders/:id/cancel`: `{version, reason?, requestKey}`; `comandas.cancelar`. Cancela comanda aberta/finalizada, preservando totais históricos e consumo já realizado. Atendimentos ainda aguardando/em andamento e suas reservas são cancelados; atendimentos concluídos mantêm o registro da execução. Não há exclusão definitiva.

Totais são strings decimais exatas e calculados no servidor em centavos inteiros: `total = subtotal - discount`. A soma máxima é `999999999999.99`. Alterações nos atendimentos incrementam a versão da comanda para impedir finalização concorrente baseada em totais antigos.

### Atendimentos

- `GET /visits?search=&status=WAITING|IN_PROGRESS|COMPLETED|CANCELLED|all&page=1` e `GET /visits/:id`: incluem apenas atendimentos autorizados. Quem pode iniciar/concluir qualquer atendimento ou visualizar todas as comandas consulta todos do salão. Capacidades próprias/consumo consultam somente o profissional vinculado ao usuário; quem visualiza comandas próprias também consulta os atendimentos das comandas que abriu. Não expõe outros serviços ou totais da comanda a profissionais com escopo próprio.
- `POST /visits/:id/start`: `{version, reason?, requestKey}`, `WAITING` → `IN_PROGRESS`. Exige `atendimentos.iniciar_qualquer` ou `atendimentos.iniciar_proprio` para o profissional vinculado. Registra início real; reserva vinculada passa a `ARRIVED`.
- `POST /visits/:id/complete`: mesmo corpo, `IN_PROGRESS` → `COMPLETED`; exige capacidade correspondente `atendimentos.concluir_qualquer|proprio`. Registra fim real e reserva vinculada passa a `COMPLETED`. Valores e consumos não podem mais ser alterados. Conclusão do atendimento usa horário real, podendo terminar antes do horário originalmente previsto na agenda.
- `POST /visits/:id/cancel`: mesmo corpo, comanda aberta, exige `comandas.cancelar` e acesso à comanda. Retira os serviços do subtotal e cancela a reserva vinculada, mantendo valores históricos e consumo. Não devolve produto utilizado.
- `GET /visits/:id/products`: seleção paginada de produtos ativos, retorna somente id/nome/unidade-base, exige autorização para consumo daquele atendimento.
- `POST /visits/:id/consumptions`: `{version, productId, quantity:"0.500000", confirmed:true, reason?, requestKey}`. A versão é do **atendimento**. Exige `atendimentos.registrar_consumo` e profissional vinculado ou capacidade de iniciar/concluir qualquer atendimento. Somente em andamento, comanda aberta, confirmação explícita, até 100 registros por atendimento. Quantidade positiva em unidade-base, até 12 dígitos inteiros e 6 decimais. O consumo é baixado uma única vez, na mesma transação que saldo, versão, auditoria e chave de reenvio. Não exige capacidade de baixa manual; consulta de produtos é limitada aos dados necessários à escolha. Saldo negativo bloqueado.

Consumo referencia movimento `OUT` imutável do estoque. Guarda como custo de referência o custo unitário da última entrada com custo informado (ou nulo se desconhecido), sem calcular custo médio; consulta exige `produtos.visualizar_custo`. Cancelamentos preservam os consumos; correções físicas continuam via movimentos de estoque autorizados, sem desfazer automaticamente produto utilizado.

Limites: não há venda de produtos na comanda, comissão, múltiplas unidades, pagamento/estorno, caixa diário ou reabertura de comanda finalizada. Atendimentos são criados na comanda; iniciar pela agenda diretamente ainda não é um atalho, use **Trazer da agenda**. Valores podem ser ajustados antes de concluir o atendimento, e o desconto da comanda antes de finalizar os serviços.

## Pagamentos e financeiro — 10/09

Os lançamentos são manuais e exigem confirmação explícita; o sistema não chama banco, adquirente ou maquininha, nem devolve dinheiro externamente. Motivo opcional (até 500 caracteres), referência opcional (até 150, identificação do comprovante, sem dados de cartão). Mesma proteção de comando das comandas: UUID `requestKey`, hash incluindo ator/rota/corpo, transação com lock da comanda, versão atual, auditoria e reenvio sem duplicação.

- `GET /payments/:orderId`: dados financeiros da comanda, venda, recebimentos, troco, estornos, cancelamento e saldo. Acesso com `financeiro.visualizar` ou escopo de visualização da comanda. Não concede escrita implicitamente.
- `POST /payments/:orderId/checkout`: `{version, payments:[{method, amount, tendered?, reference?}], confirmed:true, reason?, requestKey}`. Exige `pagamentos.registrar` e `comandas.fechar`, além de acesso à comanda. Apenas `READY` ou `DUE`. Métodos: `CASH`, `PIX`, `CREDIT`, `DEBIT`, `OTHER`. Até 20 parcelas de recebimento no envio, cada valor positivo, soma exatamente igual ao saldo. Valores em strings com até 12 dígitos inteiros e 2 decimais. Apenas dinheiro permite `tendered > amount`; `change = tendered - amount`, separado da receita. Quando omitido, `tendered = amount`. Não permite pagamento inicial parcial/fiado nesta entrega.
- Primeiro checkout cria uma única venda `order_sales` com valor histórico da comanda e registros separados de pagamento. Tudo é gravado atomicamente e o status passa a `CLOSED` (quitada). Comanda de valor zero aceita `payments:[]` e não cria recebimento fictício. Um novo recebimento após estorno liquida o saldo sem criar outra venda.
- `POST /payments/:orderId/refund`: `{version, paymentId, amount, reference?, confirmed:true, reason?, requestKey}`. Exige `pagamentos.estornar` e acesso à comanda. Pagamento deve ser da mesma comanda/salão; estorno positivo até o saldo não estornado do pagamento. Cria `payment_refunds` imutável e deixa a comanda `DUE`. A venda permanece, pois este comando desfaz somente o recebimento. Estorno segue o meio do pagamento original. Até 100 registros por pagamento; até 200 pagamentos por comanda.
- `POST /payments/:orderId/void`: `{version, confirmed:true, reason?, requestKey}`. Exige `comandas.cancelar`, `comandas.corrigir_fechada`, `pagamentos.estornar` e acesso à comanda. Para `CLOSED` ou `DUE`, cria cancelamento único da venda (`sale_voids`), estorna todos os valores recebidos ainda válidos e marca `CANCELLED`. Não apaga a venda, não reescreve atendimentos nem devolve produtos consumidos ao estoque. A rota antiga de cancelamento em `/orders` continua apenas para comandas sem venda (`OPEN`/`READY`).

Saldo: total da venda menos pagamentos mais estornos; venda cancelada tem saldo zero. Estorno não inclui troco, pois este nunca foi aplicado à comanda. O banco bloqueia alterações/exclusões/truncamentos dos registros financeiros e rejeita estornos acima do pagamento original. Transações concorrentes usam lock da comanda e versão; falha de auditoria também reverte os lançamentos.

### Consulta financeira

Exige `financeiro.visualizar` em todas as rotas. Valores agregados trafegam como strings decimais exatas, inclusive negativos quando estornos/cancelamentos de vendas antigas superam os recebimentos/vendas do período.

- `GET /finance/context`: data de hoje e fuso do salão.
- `GET /finance/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`: datas inclusivas no fuso do salão, máximo de 366 dias. Vendas, cancelamentos de vendas, vendas líquidas de cancelamentos, recebimentos, estornos, recebimentos líquidos e troco são somados pela **data de cada evento**. Vendas e recebimentos não são somados como se ambos fossem receitas distintas. `byMethod` representa recebimentos antes dos estornos. `outstanding`/`outstandingCount` representam o saldo atual de vendas em `DUE`, independentemente do período, e não incluem comandas sem venda registrada.
- `GET /finance?from=...&to=...&kind=sales|payments|refunds|voids|due&page=1`: lista paginada (20) por data/id, com acesso aos pagamentos da comanda. `due` mostra pendências atuais de todos os períodos, não restringe pela data da venda. Os demais tipos usam a data do evento correspondente.

Limites: não há cobrança/devolução externa, conciliação bancária, taxas e repasses de cartão, parcelas futuras, sinais, despesas, caixa diário, comissões ou integração fiscal. O cartão é um recebimento confirmado pelo operador; não representa confirmação de repasse bancário. Não há edição destrutiva de lançamentos ou reabertura dos valores da venda; correções de recebimento usam estorno e novo registro, cancelamento comercial usa `/void`.

## Dashboard de gestão

- `GET /api/dashboard/context`: sessão autenticada; retorna `today` e `timezone` do salão.
- `GET /api/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD`: datas válidas, ordem crescente e diferença máxima de 366 dias. Retorna contagem da agenda por status, considerando **início** no período inclusivo no fuso do salão. Agenda respeita `agenda.visualizar_todas` ou `agenda.visualizar_propria` e o vínculo profissional–usuário.
- `orders`: contagens atuais de OPEN/READY/DUE, em todos os períodos, com `comandas.visualizar_todas` ou somente as criadas pelo titular com `comandas.visualizar_proprias`.
- `stock`: quantidade atual de produtos ativos com saldo menor ou igual ao mínimo; exige conjuntamente `produtos.visualizar` e `estoque.visualizar`. Não retorna custos.
- `clients`: total atual não arquivado; exige `clientes.visualizar_todos`.
- Indicadores não autorizados retornam `null`, distintos de zero/array vazio. Leituras usam transação RepeatableRead e escopo do salão. Nenhum dado pessoal é retornado.
- Os cards financeiros usam `/api/finance/summary`, com sua autorização `financeiro.visualizar` e valores decimais exatos. As consultas operacional e financeira são independentes; não constituem um único snapshot. Pendências atuais independem do período escolhido.

Esta entrega não calcula ocupação nem substitui relatórios detalhados/exportações.

### Complemento: serviços concluídos na agenda e formas nas vendas

`GET /orders/:id/appointments` também lista agendamentos COMPLETED sem atendimento vinculado. `POST /orders/:id/import` aceita esse estado e cria atendimento COMPLETED com itens históricos; mantém horários reais nulos, pois a agenda não os registra. Cancelados/faltas continuam indisponíveis. Vínculo único, permissões, versão, auditoria e idempotência preservados. Importação não cria venda nem pagamento; checkout confirmado continua necessário.

Linhas de vendas/pendências de `GET /finance` incluem `paymentMethods`, lista distinta de meios de todos os recebimentos históricos da venda, inclusive estornados e recebidos em outras datas. Datas do filtro são da venda; para consultar valores por data de recebimento, selecionar Recebimentos. O resumo `byMethod` soma recebimentos brutos no período, antes dos estornos.

## Relatórios de produção

- `GET /reports/context`: data atual e fuso do salão.
- `GET /reports/production?from=YYYY-MM-DD&to=YYYY-MM-DD&group=services|professionals&search=&page=1`: período inclusivo no fuso do salão, diferença máxima de 366 dias. Busca literal por nome atual, sem curingas, até 150 caracteres. Grupos ordenados por quantidade de serviços decrescente, nome e ID, 20 por página. Resumo considera todos os resultados da busca, não apenas a página.
- Ambos exigem `relatorios.agenda`, que concede consulta agregada da produção **de todo o salão** (não herda escopo de agenda própria). `relatorios.financeiro` adicional permite `amount`; sem ela, valores de linhas e resumo retornam null. Sem dados de clientes/custos.
- Produção inclui Visit COMPLETED e Appointment COMPLETED sem Visit vinculado. Quando importado, o atendimento substitui a agenda, evitando dupla contagem. Data de referência: `completedAt` do atendimento; na ausência, `endsAt` da reserva vinculada. Agenda sem atendimento também usa `endsAt`. Registros sem ambas as datas não entram. Não inventa horários efetivos para a agenda.
- `services`: quantidade de itens concluídos. `visits`: atendimentos/reservas distintos, não clientes distintos. Na visão por serviço, um atendimento multisserviço aparece em várias linhas; resumo deduplica atendimentos. `amount`: soma exata dos preços históricos, antes do desconto global da comanda; não é recebimento, comissão ou lucro. Estorno financeiro não altera produção que continue COMPLETED.
- Nomes vêm do cadastro atual por ID, inclusive inativos, reunindo renomeações em um único grupo. Quantidades/valores são dos itens históricos. Leitura RepeatableRead e chaves do salão em todas as origens e junções. Não exporta nem calcula ocupação nesta entrega.

## Ocupação da agenda

`GET /reports/occupancy?from=YYYY-MM-DD&to=YYYY-MM-DD&search=&status=active|all&page=1` exige `relatorios.agenda`, com agregação do salão inteiro. Até 31 dias inclusivos no fuso do salão; busca literal por nome atual; ativos por padrão. Retorna 20 profissionais por página, ordenados por nome/ID e resumo de toda a busca. Limites explícitos de 200 profissionais e 20.000 reservas/bloqueios cada; exceder retorna 400 pedindo filtro menor.

- `availableMinutes`: jornada semanal atual no período menos união dos bloqueios não cancelados dentro dela. Intervalos fora da jornada não entram.
- `occupiedMinutes`: união das reservas SCHEDULED/CONFIRMED/ARRIVED/COMPLETED intersectada com jornada, excluindo bloqueios. Sobreposição conta uma vez; duração recortada nos limites do período.
- `freeMinutes`: disponível menos ocupado. `blockedMinutes`: bloqueios dentro da jornada. `outsideMinutes`: tempo reservado fora da disponibilidade atual, reportado separadamente.
- `rate`: percentual ocupado/disponível, arredondado a uma casa, null sem disponibilidade. Resumo calcula taxa pelos minutos somados, não média de percentuais individuais.
- `cancelled` e `noShow`: contagens de reservas nesses estados que intersectam o período; não ocupam tempo. `appointments` por profissional conta demais reservas que intersectam o período.
- Fonte é somente agenda. Atendimentos sem reserva, pagamentos, tempo real de trabalho e produtividade não são inferidos. Jornada atual e cancelamentos atuais de bloqueios alteram consultas retrospectivas; não existe snapshot histórico de jornadas. Nomes/status da equipe são atuais.
- Snapshot RepeatableRead com dados mínimos; cálculo em memória após a transação. Horários inexistentes/ambíguos no fuso seguem rejeição da conversão já utilizada pela agenda. Nenhuma escrita, custo ou dado pessoal de clientes retornado.

## Relatório de consumo e reposição de estoque

`GET /reports/stock/context` e `GET /reports/stock?from=YYYY-MM-DD&to=YYYY-MM-DD&search=&status=active|all&replenish=all|needed&page=1` exigem `relatorios.estoque`, independente de acesso à agenda/financeiro. Permissão concede consulta agregada de estoque do salão. Contexto retorna data/fuso. Período inclusivo, diferença máxima de 366 dias; busca literal por nome atual até 150 caracteres. Ativos por padrão, reposição opcional só de ativos no mínimo ou abaixo. Ordem: reposição primeiro, nome e ID; 20 produtos por página.

Por produto: `consumed` soma movimentos vinculados a `visit_consumptions`, inclusive atendimentos cancelados; `entries` soma ENTRY, `losses` LOSS, `manual` OUT sem consumo vinculado, `adjustments` soma deltas ADJUST. Datas são as dos movimentos no fuso do salão. `balance`, `minimum`, `needed=max(minimum-balance,0)` e `belowMinimum=active && balance<=minimum` são atuais e independentes do período. Quantidades trafegam como strings de seis casas, por unidade-base; nenhum custo retornado. Nomes atuais, sem agrupamento por nome histórico. Sem saldo histórico inferido, previsão de compra ou conversão de embalagens.

Resumo conta produtos encontrados, produtos consumidos no período e ativos para reposição em todos os resultados dos filtros. Não soma quantidades de unidades/produtos distintos. Query agrega no PostgreSQL com numeric exato e leitura RepeatableRead, isolada por salão em todas as origens. Produtos sem movimento continuam visíveis com zeros. Não realiza escrita ou exportação.

## Filtros da auditoria

Todos os endpoints exigem `auditoria.visualizar`:

- `GET /audit/context`: fuso/data atual e listas de ações/entidades distintas registradas no próprio salão.
- `GET /audit/actors?search=&page=1`: vínculos do salão por nome atual, incluindo inativos identificados no rótulo; somente `id` e `name`, 20 por página. Não depende de permissão de gestão de usuários.
- `GET /audit?page=1&from=YYYY-MM-DD&to=YYYY-MM-DD&actorId=UUID&action=CODIGO&entity=TABELA&entityId=UUID&reason=TEXTO`: todos os filtros opcionais e combinados com AND. Datas exigem o par, ordem crescente e diferença máxima de 366 dias; sem ambas preserva consulta de todo o histórico. Limite inferior inclusivo e superior exclusivo no dia seguinte, no fuso do salão. Ação/entidade exatas, ator por ID de vínculo, registro por UUID, motivo com busca sem distinguir maiúsculas/minúsculas, até 150 caracteres. Página de 20 registros, ordenação por data e ID decrescentes; total correspondente a todos os filtros. Identificador/ator de outro salão retorna vazio, sem revelar existência.

Resposta da lista inclui `timezone`. Snapshot RepeatableRead da lista/contagem e das opções; consultas sempre limitadas ao salão. A ocultação já existente de `unitCost` em antes/depois de movimentos de estoque continua aplicada sem `produtos.visualizar_custo`. Nenhuma alteração/exclusão de histórico ou exportação nesta entrega.

## Relatório detalhado de recebimentos

`GET /reports/receipts/context` e `GET /reports/receipts?from=YYYY-MM-DD&to=YYYY-MM-DD&search=&method=all|CASH|PIX|CREDIT|DEBIT|OTHER&kind=all|payment|refund&page=1` exigem `relatorios.financeiro` e consultam todo o salão. Contexto retorna data/fuso, sem depender das permissões de outros relatórios. Datas inclusivas no fuso, diferença até 366 dias; busca literal por nome preservado na comanda (até 150 caracteres).

Lista é união de pagamentos e estornos, cada um na própria data, com ID/tipo para chave estável e `paymentId` do pagamento original. Estornos de pagamentos fora do período entram normalmente. Retorna valor positivo e tipo separado, troco (zero em estornos), forma do pagamento original, referência, motivo, nome histórico do cliente, orderId e paymentId. Ordenação data decrescente, tipo crescente, ID decrescente; página de 20. Não concede escrita financeira nem acesso aos endpoints de comanda/pagamento.

Resumo e `byMethod` respeitam todos os filtros e todas as páginas: recebido, estornado, líquido=recebido−estornado (pode ser negativo), troco separado. Cinco formas retornadas mesmo sem movimento (zero). Filtrar somente estornos torna recebido zero e líquido negativo. Cartões são valores registrados, sem taxas/repasse; não representa lucro. SQL numeric/Prisma Decimal com duas casas como strings; snapshot RepeatableRead, isolamento do salão nas origens/junções. Sem exportação ou migração nesta entrega.

## Exportação dos relatórios em CSV

Endpoints: `GET /reports/production/export`, `/reports/occupancy/export`, `/reports/stock/export` e `/reports/receipts/export`. Aceitam os mesmos filtros e exigem as mesmas permissões do relatório correspondente. Produção mantém ocultação da coluna de valores sem `relatorios.financeiro`. O parâmetro de página não limita o arquivo: exporta todos os registros correspondentes, na mesma ordem e em um único snapshot de leitura. Até 10.000 linhas; exceder gera erro sem arquivo truncado. Limites menores de ocupação continuam válidos.

Resposta autenticada JSON `{ filename, content }`, usada pela interface para baixar CSV localmente. UTF-8 com BOM, ponto e vírgula, aspas escapadas, decimais com vírgula preservados como texto no arquivo. Conteúdo inclui metadados (tipo/período/fuso/geração/filtros/observações), uma linha vazia e cabeçalho/tabela. Estoque conserva seis casas, valores monetários duas; não cria arquivo XLSX. Na importação em planilha, escolher texto para colunas cuja precisão integral precisa ser mantida além do limite numérico da planilha.

Textos controlados pelo usuário com prefixo de fórmula são neutralizados com apóstrofo, preservando números negativos simples. A geração é auditada como `RELATORIO_EXPORTADO` na entidade `reports`, contendo somente tipo, período, quantidade e fuso (sem cópia do arquivo). Falha em registrar auditoria impede entrega do conteúdo. O registro indica geração, não comprova salvamento do arquivo pelo navegador. Sem envio a terceiros e sem alteração de lançamentos financeiros/estoque.
