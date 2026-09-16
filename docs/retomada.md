# Retomada — atualizada em 16/09/2026

## Lentidão no primeiro carregamento — região da API publicada e medida

Usuário pediu investigar lentidão inicial. Medição pública sem sessão antes do ajuste: HTML 493 ms; primeira `/api/health` 2.773 ms, segunda 449 ms; `/api/auth/me` 283/176 ms. Cabeçalho `x-vercel-id` da função mostrava `iad1` (Washington), enquanto URL de conexão Neon validada aponta `sa-east-1` (São Paulo). A página aguarda `/auth/me` para decidir login/sessão; `createApp()` inicializa Nest e conecta Prisma ao banco no primeiro uso da função. Documentação oficial Vercel recomenda executar a função perto do banco e permite `regions` por função no `vercel.json`, inclusive `gru1` no Hobby. Configurada apenas `api/index.ts` para `gru1`; arquivos estáticos continuam na CDN. Build passou. Commit `653eff4` enviado; Vercel success. Medição após deploy confirmou `x-vercel-id` `gru1::gru1`: HTML 645 ms, primeira `/api/health` 1.223 ms, segunda 231 ms, `/api/auth/me` 200/62 ms. Amostra adicional de health: 997, 110, 71, 53, 60, 47 ms. Estes números são amostras pequenas, sem sessão, e não isolam cold start da função versus retomada do banco; não prometem tempo máximo após inatividade longa. Nenhuma credencial ou dado real alterado.

## Cancelamento de agenda e comanda — publicado; validação autenticada pendente

Usuário confirmou a regra: sem comanda, cancelar agendamento na agenda; com comanda, cancelar pela comanda, que atualiza a agenda automaticamente. O detalhe da agenda agora explica isso e leva à comanda vinculada. Usuário autorizou que Atendente também cancele comandas; permissão adicionada ao perfil padrão e migration `202609160003_attendant_cancel_orders` aplicada no Neon. Motivo obrigatório no servidor e na interface para cancelamento de agendamento, atendimento, comanda e venda (inclusive estorno de venda). Build e suíte completa API/navegador aprovados em PostgreSQL isolado, incluindo role existente, recusa de motivo vazio, Atendente cancelando comanda e sincronização de agenda. Uma tentativa anterior de permitir cancelar comanda pela agenda foi descartada após correção do usuário; a primeira suíte dessa tentativa falhou pela expectativa antiga, e a suíte final passou após rever o escopo. `prisma migrate status` encontrou apenas a nova migration pendente antes da aplicação; `db:migrate` concluiu 13/13. Consulta agregada no Neon confirmou 1 perfil Atendente e 1 concessão de `comandas.cancelar`. Commit `c13559d` enviado; Vercel concluiu deploy, health público 200 e bundle público contém Motivo do cancelamento e orientação para cancelar pela comanda. Nenhuma comanda ou agendamento real foi alterado; teste autenticado com a conta do salão ainda pendente.

## Comanda direta pela agenda — publicada; validação autenticada pendente

Usuário pediu botão no detalhe de cliente agendado para abrir comanda. Detalhe da agenda agora oferece “Abrir comanda” quando há permissões e agendamento elegível, criando comanda e importando o serviço histórico na mesma transação; se já vinculado, oferece “Ver comanda”. API usa lock no agendamento e chave idempotente para impedir duplicação por cliques/reenvios concorrentes, respeitando salão, escopo da agenda e permissões de comanda. Sem migration. Typecheck, build e suíte completa API/navegador passaram em banco PostgreSQL isolado; teste novo cobriu permissão, reenvio simultâneo e vínculo único. Commit `dd46d80` enviado; status Vercel success, health público 200, rota nova protegida sem sessão e bundle público atualizado com o novo texto/endpoint. Nenhum dado real foi alterado; validação autenticada com um agendamento real cabe ao usuário.

## Venda de produtos publicada — validação autenticada pendente

Migration `202609160002_product_sales` aplicada no Neon com sucesso após `prisma migrate status` mostrar somente ela pendente; schema agora com 12 migrations concluídas. Commit `0ae9483` enviado para `origin/main`, GitHub mostrou status Vercel success. Inicialmente alias público ainda servia bundle antigo/rota 404; após propagação, `https://gestor-salao-api.vercel.app` respondeu health 200, `/api/orders/options/products` 401 sem sessão (antes 404) e bundle público contém Adicionar produto à comanda e Preço de venda por unidade. Nenhum produto real teve preço configurado, nenhuma comanda real foi criada e nenhum pagamento real foi feito nesta validação. Próximo passo: usuário configurar preço/quantidade por unidade em Produtos e testar com a própria conta; observar regra de estoque no primeiro pagamento e devolução manual após venda cancelada. Não executar `admin:create`. Nenhum teste ficou ativo. Não repetir suíte aprovada sem mudança funcional.

## Venda de produtos na comanda — implementação local

Usuário pediu venda de produtos na comanda após perguntar por preço. Implementados localmente `salePrice` e `saleQuantity` no cadastro, itens históricos da comanda, adição/remoção antes de finalizar, total com produtos e serviços, baixa de estoque SALE no primeiro checkout na mesma transação do pagamento, relatório de estoque com vendas separadas e comissões apenas sobre serviço após desconto proporcional. Produto cadastrado sem preço não é vendável. Venda por unidade inteira; cada unidade pode representar frasco de quantidade configurada. Antes do pagamento não há baixa; após pagamento, cancelamento/estorno não devolve automaticamente o produto. Perguntas opcionais de preferência sobre frações/devolução foram enviadas ao usuário, sem resposta recebida até este marco; seguimos com essas regras explícitas. Migration `202609160002_product_sales` criada e testada no PostgreSQL isolado, NÃO aplicada no Neon. Build, typecheck, 30 testes unitários, formatação e suíte completa API/navegador passaram após ajustar uma expectativa de texto antiga; testes novos incluem produto sozinho, desconto, baixa única, saldo insuficiente/rollback, isolamento, relatório de vendas, preço no navegador, mobile e comissão em venda mista. Capturas mobile/desktop em `.local/screenshots/product-sale-*.png` inspecionadas. A revisão visual levou a dois ajustes simples de texto e remoção de cartão vazio; typecheck/formatação passaram depois. Não publicar antes de aplicar migration remota. Regras em `docs/venda-produtos.md`.

## Agendamento de corte com Luzia — vínculo pendente

Usuário relatou não conseguir vincular serviço à profissional Luzia para agendar corte. Inspeção do fluxo confirmou que o vínculo é em Disponibilidade e serviços → Serviços realizados, exige `profissionais.gerenciar`, seleção por checkbox, motivo de ao menos 5 caracteres e Salvar serviços. Consulta somente leitura ao Neon confirmou Luzia ativa, zero serviços vinculados e um serviço de corte ativo no catálogo. Nenhum vínculo ou agendamento foi alterado por esta investigação. Orientar a fazer o vínculo pela interface; se houver erro, solicitar a mensagem exata.

## Campo de comissão não visível — diagnóstico

Usuário informou que Comissão (%) não aparece em Editar profissional. Código confirma que o campo só aparece quando `/commissions/context` retorna `all: true`, concedido ao perfil protegido `ROLE_ADMIN`. Consulta agregada no Neon confirmou um perfil protegido e uma atribuição, sem ler dados pessoais; não comprova qual conta o usuário usou. Interface ajustada para mostrar carregamento, erro com nova tentativa ou aviso claro de que somente Administrador configura o percentual. Typecheck e build aprovados; validação autenticada da conta do usuário ainda pendente. Orientar o usuário a confirmar se está logado na conta com perfil Administrador em Acessos > Usuários; não alterar papéis remotamente sem identificar a conta.

Correção publicada no commit `515bbd9`; bundle público novo confirmou presença da mensagem. Usuário ainda precisa informar o perfil exibido abaixo do próprio nome ou o aviso que aparece na janela para concluir o diagnóstico da conta.

Usuário confirmou em seguida que o campo Comissão (%) apareceu. Não foi necessário alterar permissões ou cadastros. Ainda não foi informado se algum percentual foi salvo ou se houve teste autenticado de comissão/caixa com dados reais.

## Publicação de comissões e caixa concluída — validação autenticada pendente

Commits `46e7028` (código) e `e245ab7` (registro da migration) enviados a `origin/main`; push confirmou `8303fcd..e245ab7`. Após alguns minutos, Vercel serviu interface HTTP 200 com bundle contendo Meu financeiro e Caixa; `/api/health` HTTP 200; `/api/commissions/context` e `/api/cash` passaram de 404 para 401 sem sessão, confirmando as rotas novas e a proteção. Migration Neon já aplicada (11/11). Não houve login autenticado remoto ou operação de caixa/comissão em dados reais nesta validação. Próximo passo operacional: entrar na Vercel com a conta existente, definir percentuais dos profissionais (cadastros antigos: 0%), conferir Meu financeiro e abrir o primeiro caixa quando a equipe estiver pronta para exigir turno aberto para dinheiro. Não executar `admin:create`. A lentidão inicial e backup remoto permanecem pendentes.

## Migration Neon aplicada — publicação em andamento

Usuário preencheu `.local/neon.env` privadamente. Validado formato PostgreSQL, conexão direta Neon com TLS, banco `neondb` e histórico de 10 migrations concluídas; a listagem inicial limitada às cinco mais recentes havia sugerido pendências antigas, mas a consulta completa confirmou todas aplicadas. `npm run db:migrate` com `DATABASE_URL` explícita aplicou `202609160001_commissions_cash` com sucesso no Neon (11/11 migrations). Nenhuma credencial impressa ou registrada. Próximo passo: enviar commit local `46e7028`, verificar deploy e testar API pública. Não repetir migration nem criar administrador. Percentuais existentes começam em 0 e exigem configuração.

## Pausa solicitada — retomar amanhã

Usuário pediu salvar esta etapa para continuar amanhã. Código, testes e documentação de comissões/caixa salvos no commit LOCAL `46e7028`; não enviado ao GitHub, não publicado na Vercel. Próximo passo: conferir se o usuário preencheu `.local/neon.env` (DATABASE_URL estava vazio quando preparado; preenchimento ainda não confirmado), sem imprimir seu conteúdo. Validar destino Neon, consultar migrations e aplicar `202609160001_commissions_cash` com conexão explícita; somente após sucesso enviar commit e validar deploy. Não usar automaticamente o `.env`, que aponta ao banco local, nem repetir criação de administrador. Percentuais dos profissionais existentes começam em 0 e precisarão ser configurados pelo administrador. Nenhum processo de teste ficou ativo. Não repetir testes aprovados sem alteração ou novo motivo.

Retomada de 16/09: `DATABASE_URL` em `.local/neon.env` continua vazio (verificado sem revelar conteúdo); permissões do arquivo 600. Commit local `46e7028` confirmado. Aguardando o usuário preencher a conexão privada do Neon para validar destino e aplicar a migration antes do push. Nenhuma migration, publicação ou teste adicional executado nesta retomada.

## Entrega local validada em 16/09 — comissões e caixa

Implementados percentual individual no cadastro (administrador), financeiro próprio do profissional e consulta da equipe pelo administrador, comissão reconhecida no pagamento após desconto, snapshot por serviço, estornos e recebimentos posteriores com percentual histórico. Caixa compartilhado por salão: abertura, sangria com motivo, recebimentos/estornos em dinheiro, fechamento com contado/esperado/diferença, responsáveis e histórico. Primeiro turno ativa exigência de caixa aberto para dinheiro. Valores anteriores não são retroativamente comissionados. Percentual inicial dos cadastros existentes: 0%; configurar antes de novas vendas. Troca de vínculo de usuário exige administrador para proteger financeiro individual.

Validações: 30 testes unitários, build, typecheck, formatação e suíte completa `npm run test:e2e` aprovados em PostgreSQL isolado. Testes novos verificam 90×60%=54, dois profissionais, rateio, preservação do percentual, estorno/novo recebimento/cancelamento, retry, isolamento, troco/PIX fora do saldo físico, sangria, diferença, rollback, imutabilidade e concorrência (duas aberturas; fechamento versus pagamento). Navegador validou cadastro de percentual, financeiro próprio e fluxo completo de caixa com recarga. Capturas `commissions-desktop/mobile.png` e `cash-desktop/mobile.png` em `.local/screenshots`; móveis inspecionadas. Primeiras falhas foram preparação de fixture (campo composto redundante) e nome acessível do percentual; corrigidas. Ajuste final de invalidação de cache passou typecheck/formatação. Testes/processos encerrados.

Publicação pendente: migration `202609160001_commissions_cash` testada somente no banco descartável. Nenhuma alteração no Neon ou banco real e nenhum deploy deste módulo. Conexão disponível no `.env` é local (classificação verificada sem imprimir credenciais). Preparado `.local/neon.env` ignorado pelo Git, modo 600, com DATABASE_URL vazio para o usuário preencher com a conexão Neon da Vercel. Quando preenchido, validar destino Neon e consultar status das migrations; aplicar migration aditiva com conexão explícita ANTES de push/deploy, depois conferir Vercel e orientar configurar percentuais. Não criar administrador novamente. Regras/endpoints em `docs/comissoes-caixa.md`; registro desta continuação em `docs/conversas/2026-09-16.md`.

## Nova entrega solicitada — comissões e caixa

Regra final confirmada pelo usuário: gerar comissão quando o cliente pagar, sobre valor após desconto, com percentual individual. Implementação inicial local criada (ainda em validação): snapshots de percentual/base por serviço, lançamentos incrementais com estornos, tela Meu financeiro/comissões com escopo próprio e administrador, percentual no cadastro, caixa com abertura/sangria/fechamento/histórico e integração de dinheiro. Migration `202609160001_commissions_cash` criada, NÃO aplicada ao Neon nem ao banco real. Primeiro caixa ativa exigência de turno aberto para dinheiro; PIX/cartões fora do saldo físico. Desconto global rateado proporcionalmente em centavos. Histórico anterior sem retroatividade. Testes e revisão pendentes neste marco; nenhum push/deploy.

Usuário confirmou login, Clientes e Agenda funcionando na URL pública da Vercel com a conta existente. Informou Neon como banco. Lentidão ocorre apenas no primeiro carregamento; investigação adiada por decisão do usuário. Não executar novamente o cadastro inicial presumindo banco vazio.

Escopo autorizado: financeiro individual dos funcionários, com vendas e comissões restritas ao profissional vinculado; administrador define percentual por profissional no cadastro e consulta a equipe; abertura de caixa com saldo inicial, fechamento com contagem/diferença e sangria registrada. Regra confirmada: comissão sobre valor após desconto (R$ 100 menos R$ 10, percentual 60% → R$ 54 profissional e R$ 36 salão). Preservar percentual histórico, sem recalcular vendas antigas ao editar cadastro. Ainda não implementado nem migrado.

Revisados cadastro de profissionais, permissões e pagamentos. Comandas podem ter vários profissionais; desconto é global. Venda nasce no primeiro checkout, e estorno parcial reabre saldo DUE. Antes de definir os lançamentos da comissão, esclarecer se ela nasce ao concluir serviço ou ao receber pagamento; usuário confirmou apenas base após desconto, não o momento de reconhecimento. Cobrir rateio de descontos em centavos, cancelamentos/estornos, concorrência de caixa e isolamento por usuário/salão nos testes isolados. Não publicar schema novo antes de preparar aplicação no banco remoto.

## Marco atual — preparação do deploy Vercel

Teste público executado após autorização do usuário: página HTTP 200; `/api/health` HTTP 200 com `{"status":"ok"}` (conexão com banco confirmada); `/api/auth/me` e `/api/clients` HTTP 401 sem sessão, conforme esperado. Playwright abriu a tela de login em 1366×768 e 390×844 sem erros JavaScript nem transbordamento horizontal. Primeira tentativa do navegador falhou por libnspr4 ausente no PATH de bibliotecas; repetição com `.local/browser-libs/extracted/usr/lib/x86_64-linux-gnu` passou. Nenhum registro alterado. Login autenticado e fluxos internos continuam pendentes: não há conta de teste remoto identificada nos registros. Health não comprova migrations/tabelas completas. Navegador encerrado.

- Usuário informou que criou uma variável no projeto Vercel. O valor não foi lido nem registrado.
- API separada em `apps/api/src/bootstrap.ts`, permitindo execução local com `listen()` e execução serverless via `api/index.ts`; autenticação por cookie, CORS, Helmet, prefixo `/api` e filtros globais são compartilhados.
- `vercel.json` criado na raiz: `npm run vercel-build`, saída estática `apps/web/dist`, função `api/index.ts` e fallback das rotas do React para `index.html`.
- `npm run typecheck`, `npm run build` e `npm run vercel-build` passaram. Nenhum banco, migration, dado real, backup ou processo externo foi acessado nesta etapa.
- A API de produção exige `DATABASE_URL` e `WEB_ORIGIN`; `WEB_ORIGIN` deve ser a origem HTTPS pública do mesmo projeto. Sem ambas, a função falha ao inicializar. A variável criada pelo usuário ainda precisa ser identificada no painel sem compartilhar o valor no chat.
- Commit `802c79a` criado e enviado com sucesso para `origin/main`; a consulta independente posterior ao remoto foi bloqueada por DNS do sandbox, mas o `git push` confirmou `main -> main`. Próximo passo: aguardar o deploy automático da Vercel, testar `/api/health` e a tela/login. Se o projeto Vercel estiver com Root Directory diferente da raiz, ajustar para a raiz do repositório.
- Primeiro build Vercel com a raiz corrigida falhou no bundling da função: o import de `api/index.ts` apontava para `apps/api/src` e o compilador da Vercel reinterpretou decorators NestJS como decorators padrão. Corrigido para importar `apps/api/dist/bootstrap.js`, gerado pelo build TypeScript com `experimentalDecorators`; `npm run vercel-build` passou novamente. Correção ainda precisa ser enviada e redeployada.
- Após o deploy `b2168bf`, a interface pública respondeu HTTP 200, mas `/api/health` respondeu 404. Adicionadas rotas explícitas em `vercel.json` para encaminhar `/api` e `/api/*` a `api/index.ts`, mantendo arquivos estáticos e fallback do React. Novo deploy pendente.
- Deploy posterior com o commit `073dcfd` foi confirmado pelo usuário como funcionando: interface pública e API Vercel acessíveis, após validação de `/api/health`. Falta apenas validar login com o banco remoto e os fluxos principais; nenhum dado real foi migrado.

## Onde paramos

**Publicação GitHub concluída:** autenticação via GitHub CLI confirmada para `SantosMarcos95`; commits `0e86f90`, `9797416` e `a7f854c` enviados com sucesso para `origin/main` em `https://github.com/SantosMarcos95/Gestor-salao.git`. Nenhum `.env`, `.local`, dump ou chave foi incluído. Próximo passo: importar o repositório na Vercel e configurar variáveis de ambiente/banco de teste; ainda sem deploy ou migração de dados reais.

**Conexão GitHub confirmada:** plugin instalado e autenticação aceita; identidade `SantosMarcos95` verificada. Consulta ao repositório confirma conta com push/admin e repositório público vazio, mas escrita pelo plugin (`create_file` de README) recusada com HTTP 403 `Resource not accessible by integration`. Autenticação do plugin não habilitou Git HTTPS: push continua sem credencial. Nenhum arquivo publicado. Próximo passo: autenticar Git pelo GitHub CLI no terminal (gh ainda não instalado) ou ajustar concessão de escrita da integração. Não repetir instalação do plugin nem dizer que conta está desconectada. `/tmp/salao-publish.json` contém somente os 186 arquivos rastreados para preparação do envio; não inclui .env/.local.

**Resultado do envio:** `origin` configurado para `SantosMarcos95/Gestor-salao`; commit de continuidade `9797416` criado. `git push -u origin main` falhou por ausência de autenticação HTTPS (`could not read Username`). Nada enviado. Próximo passo: autenticar GitHub neste ambiente por fluxo seguro e repetir push, verificar hash remoto; depois preparar Vercel. Não pedir tokens/senhas no chat. Esta nota ainda não foi commitada.

**Destino GitHub confirmado pelo usuário:** `https://github.com/SantosMarcos95/Gestor-salao.git`. Consulta remota bem-sucedida sem branches/tags retornados; repositório vazio nesta verificação. Preparando `origin` e envio de `main`; resultado do push ainda pendente. Dados locais e credenciais continuam excluídos.

**Salvamento Git concluído:** commit local inicial `0e86f90` criado na branch `main`, com 186 arquivos. `git diff --cached --check` passou após remover linha vazia final de unidade systemd. Não houve mudança funcional nem repetição dos testes nesta etapa. Push e deploy dependem das conexões GitHub/Vercel e destino solicitados. Esta atualização de continuidade é posterior ao commit inicial e deve acompanhar o próximo commit.

**Trabalho atual — publicação solicitada:** usuário pediu envio ao próprio GitHub e hospedagem na Vercel. Git inicializado na branch `main` em 15/09 (o diretório antes vazio agora é repositório válido). `.gitignore` reforçado para `.vercel`, dumps e chaves. Inventário inicial de 186 arquivos revisado com busca por padrões comuns de tokens/chaves sem ocorrências; `.env` e `.local` excluídos. Plugins GitHub/Vercel encontrados mas não conectados; solicitadas conexões e link do repositório (ou usuário; preferência proposta por privado `salao-gestao`). Próximo passo: confirmar conexões/destino, enviar código, configurar implantação compatível com frontend React/Vite e API NestJS, prover banco de teste e validar login. Nenhum push/deploy ou banco remoto configurado até este marco.

**Decisão mais recente — Vercel Hobby inicialmente:** usuário escolheu plano gratuito e pretende migrar ao Pro quando iniciar comercialização. Planejar Hobby para desenvolvimento/demonstração não comercial; esclarecido que operação real do salão também deve ser considerada antes da migração ao Pro, mesmo sem venda do software. Próximo trabalho: preparar e validar configuração da aplicação/API para Vercel com dados de teste. Nenhum deploy, conta criada ou migração de dados reais autorizado nesta decisão. Neon Free e backup criptografado no Drive seguem propostas pendentes de configuração.

**Hospedagem informada:** usuário escolheu Vercel. Banco Neon Free e backups criptografados no Drive continuam propostas, não configurados. API NestJS atual e scripts pg_dump/systemd precisam de adaptação/definição de executor para esse ambiente; não há deploy validado. Documentação oficial Vercel consultada: Hobby é restrito a uso pessoal não comercial, portanto não prometer hospedagem gratuita para a operação do salão. Esclarecer se usará Pro, mantendo preferência por banco/backup gratuitos. Nenhuma contratação ou publicação realizada.

**Esclarecimento mais recente:** usuário pretende registrar endereço HTTPS e pediu foco somente em banco/backup gratuitos. Recomendação proposta: PostgreSQL Neon Free e backups criptografados independentes no Google Drive. Ainda não aceitos/configurados. Fonte oficial Neon consultada em 15/09 informa 0,5 GB por projeto, 100 CU-h/mês e 5 GB de transferência; limite excedido pode suspender serviço/bloquear crescimento, sem cobrança de excedentes no Free. Precisamos medir tamanho real antes de migrar e identificar onde a API e o agendador executarão; endereço HTTPS sozinho não identifica hospedagem. Nenhuma conta criada, dado migrado ou cópia enviada.

**Última decisão, 15/09 — preferência por custo zero:** usuário ainda não escolheu hospedagem/armazenamento e pediu indicação gratuita. Modelos systemd revisados e documentados em `ops/systemd/README.md`; verificação de integridade agora usa arquivo de configuração separado sem credencial do banco. Calendário de 03h São Paulo aceito pelo systemd; `verify` apontou `/usr/bin/node` ausente neste ambiente, portanto instalação/execução das unidades não validadas. Nada ativado. Pesquisadas fontes oficiais: Google Drive oferece até 15 GB compartilhados; Render gratuito tem suspensão por inatividade e não é recomendado pelo fornecedor para produção. Proposta em discussão: manter aplicação no computador e preparar backups criptografados para Drive. Não há escolha aceita, integração Drive ou envio de arquivos. Confirmar necessidade de acesso fora do salão antes de decidir hospedagem.

**Marco mais recente — navegador recuperado aprovado em 15/09:** `npm run test:recovery` passou com build, integração completa de API, backup/restauração, API recuperada e navegador conectado à cópia. Login, cadastro persistente após recarga, recebimentos conciliados, desktop/celular e logout aprovados; sem erros de JavaScript ou transbordamento horizontal. Origem intacta após as escritas. Capturas `recovery-desktop.png`/`recovery-mobile.png` em `.local/screenshots`; captura móvel inspecionada. Sem dado real alterado ou migration no salão. Próximo trabalho: definir infraestrutura/destino externo e política de backup (frequência, retenção, responsável e alertas), depois configurar e medir recuperação com volume representativo. Proteção automática dos dados reais ainda não ativada.

**Marco mais recente, 15/09 — ensaio operacional pela API aprovado:** `npm run test:backup` passou com build, integração completa, dump/restore e nova API na porta 3011 sobre o banco restaurado isolado. Novo login, recusa de sessão revogada, consultas equivalentes de clientes/comandas/produtos/financeiro/relatórios, cadastro com auditoria e logout aprovados; origem íntegra após operações na cópia. Sem navegador nesta execução, sem migração ou escrita no salão. Próximos passos: aceite pelo navegador da recuperação e definição de destino externo, frequência/retenção e alertas; RPO/RTO com volume representativo ainda pendentes. Não há proteção automática dos dados reais ativada.

**Última retomada, 15/09:** concluída revisão da rotina local `backup:run`/`backup:check`, encontrada no workspace ainda sem registro. Teste `test:backup-job` aprovado com fixtures de arquivos temporários; validação do caminho reforçada para aceitar apenas pasta filha direta de backup. Procedimento documentado. Não há agendamento, notificação externa, criptografia ou backup real ativados. Próximo passo: ensaio operacional da aplicação restaurada em ambiente isolado; definição do destino externo e política de backup permanece pendente. Portas 5432/3001/5173 sem processos escutando na inspeção desta sessão. Detalhes em `docs/conversas/2026-09-15.md`.

O primeiro administrador já foi criado e o usuário confirmou o login. Concluímos usuários/permissões, organização do código no VS Code, troca/redefinição de senhas e cadastros de profissionais e serviços. Na retomada, concluímos jornadas semanais, bloqueios e serviços realizados por profissional. As novas tabelas já foram aplicadas ao banco local, e os testes passaram.

**Estado atual:** agenda, produtos/estoque, fornecedores, atendimentos e comandas implementados. Pagamentos e financeiro inicial também implementados. Gestão em andamento: dashboard operacional entregue; relatórios de serviços/profissionais entregues; ocupação da agenda entregue; relatório de consumo/reposição de estoque entregue; filtros avançados de auditoria entregues; relatório detalhado de recebimentos entregue; exportações CSV entregues; próxima fase é preparação para produção, começando por backup/restauração. A aplicação está em http://localhost:5173.

O usuário pediu para salvar a conversa. O resumo das mensagens e decisões está em [Registro da conversa de 08/09/2026](conversas/2026-09-08.md).

## Entrega desta sessão

- Cadastro de usuários com senha inicial de 8–128 caracteres, perfis e ajustes individuais.
- Ativação/desativação do vínculo do salão; desativação revoga suas sessões.
- Criação e edição de perfis personalizados e consulta do Administrador protegido.
- Permissões individuais de permitir, negar ou herdar; negação tem prioridade.
- Proteção do último administrador, incluindo alterações simultâneas, e controle de revisão ao editar.
- Limite de concessão às próprias permissões do gestor, revalidação transacional e isolamento por salão.
- Motivo obrigatório e auditoria antes/depois, sem credenciais.
- Interface de computador/celular e documentação da API atualizadas.

## Verificação

Build e typecheck passaram; 5 testes unitários passaram. `npm run test:e2e` passou com PostgreSQL descartável e navegador: fluxos anteriores, usuários/perfis, proteção do último administrador, concorrência, revogação, isolamento e bloqueio de escalada de acesso. Capturas em `.local/screenshots`. Nenhum cadastro fictício foi inserido no banco real do salão. Não houve mudança de schema ou necessidade de migration nesta etapa.

## Limites e próximos passos

Esta tela edita acessos, não nome/e-mail de contas existentes. Troca de senha pelo titular e recuperação assistida por administrador foram implementadas na continuação. Recuperação por e-mail, administração de sessões por dispositivo e exclusão de perfis ainda não foram implementadas. Profissionais e serviços foram entregues na continuação. Jornadas, bloqueios e serviços por profissional foram entregues nesta retomada. Próximo item do plano: agenda. Veja `docs/roadmap.md`.

Banco e aplicação estavam ativos nas portas 5432, 3001 e 5173 ao final da sessão. Em uma retomada futura, verificar as portas antes de iniciar serviços em duplicidade. O diretório `.git` disponível neste ambiente não contém um repositório Git utilizável.

## Organização do código no VS Code

A pedido do usuário, o frontend foi separado em `pages` (login, dashboard, clients, access, account, audit, professionals e services), `components`, `layouts`, `lib` e `styles`. `App.tsx` concentra o controle de sessão; `layouts/SalonLayout.tsx` reúne menu e rotas. O CSS fica em `styles/global.css` e a comunicação HTTP em `lib/api.ts`.

Prettier foi adicionado com comandos `format` e `format:check`. Há configurações locais, recomendações de extensões e tarefas em `.vscode`. Pastas geradas ficam ocultas no explorador. Consulte `docs/guia-do-codigo.md` para os caminhos atuais.

## Continuação: senhas

- Minha conta permite trocar a própria senha com confirmação da senha atual. Todas as sessões são encerradas e é necessário novo login.
- Usuários e permissões permite redefinir a senha de outro usuário, confirmando a senha do administrador e informando motivo. O titular é obrigado a trocar a senha provisória antes de acessar outros módulos.
- Redefinição impede atingir contas de outros salões ou contas com permissões superiores. Revisão evita sobrescrever uma redefinição concorrente.
- Migration `202609080001_password_change` adicionou `must_change_password` com padrão false; foi aplicada no banco local, preservando as contas existentes.
- Não houve envio de e-mail nem alteração de senhas reais durante os testes. Recuperação do único administrador sem sessão continua pendente.
- Testes de senha ficam em `tests/passwords.mjs`, chamados pela suíte de integração, usando API isolada na porta 3010.

Validação da etapa de senhas: build, typecheck, testes unitários e suíte completa de integração/navegador passaram. A suíte confirmou concorrência, revogação das sessões, isolamento e exigência de troca da senha provisória. A interface e a API locais responderam HTTP 200.

## Continuação: profissionais e serviços

- Telas Profissionais e Serviços disponíveis no menu conforme as permissões.
- Profissionais: contato, especialidade, observações e vínculo opcional com usuário ativo do mesmo salão. Cada usuário pode estar vinculado a apenas um profissional. Desativar o profissional não desativa a conta do usuário.
- Serviços: nome, descrição, duração de 1–1440 minutos e preço decimal exato, sem float. A interface aceita vírgula; a API recebe e retorna strings decimais.
- Busca paginada, filtros ativo/inativo/todos, edição com versão, ativação/desativação com motivo e auditoria em transação.
- Migração `202609080002_professionals_services` aplicada ao banco local; cria as tabelas com restrições de escopo, vínculo único, preço não negativo e duração válida.
- Build, typecheck, 5 testes unitários e suíte completa de integração/navegador passaram. Os testes verificam preços, limites, vínculo, permissões, escopo, edição concorrente, filtros e auditoria. Testes específicos em `tests/catalog.mjs`; capturas em `.local/screenshots`.
- Não foram inseridos profissionais ou serviços fictícios no banco real. Próximos passos: jornadas e bloqueios de disponibilidade, serviços por profissional e depois agenda.

## Continuação: disponibilidade e serviços por profissional

- Menu **Disponibilidade**: lista paginada da equipe com busca e filtros, configuração de jornada semanal, bloqueios e serviços realizados.
- Jornadas com vários períodos por dia, folgas, intervalos e fim à meia-noite. Não permite sobreposição no mesmo dia; horários no fuso cadastrado do salão.
- Bloqueios com descrição, início/fim locais e motivo. Conversão no servidor para UTC; rejeita datas impossíveis e horários ambíguos/inexistentes. Cancelamento mantém histórico e exige versão e motivo. Correções por cancelamento e novo cadastro.
- Serviços realizados selecionados do catálogo ativo; vínculos inativos já existentes continuam identificados e podem ser removidos. Preço e duração seguem o catálogo.
- Permissões independentes: `agenda.gerenciar_disponibilidade` para jornadas/bloqueios; `profissionais.gerenciar` para vínculos de serviços. A lista expõe somente id, nome e status.
- Transações bloqueiam o profissional para serializar escritas; vínculos bloqueiam os serviços durante a validação. Jornada e vínculos usam a versão do profissional; bloqueios têm versão própria. Auditoria atômica e chaves estrangeiras compostas preservam escopo.
- Migration `202609080003_availability` aplicada no banco local. Nenhum cadastro fictício foi inserido no salão.
- Testes específicos: `tests/availability.test.ts` e `tests/availability.mjs`. O Vitest agora inclui todos os arquivos `tests/*.test.ts` (8 testes). Suíte de integração/navegador validou concorrência, rollback, escopo, permissões, fuso, intervalos adjacentes, persistência, auditoria e celular.
- A futura agenda ainda precisa implementar agendamentos e usar o mesmo bloqueio transacional do profissional para consultar jornada, bloqueios e conflitos. Não há agendamentos nesta entrega.

## Continuação: agenda

O usuário autorizou iniciar a agenda. Implementamos:

- Menu **Agenda**, visão diária com colunas por profissional, semana de sete dias a partir da data selecionada, filtro de profissional/status, busca paginada e navegação de datas no fuso do salão.
- Reserva de um cliente com um profissional e unidade, vários serviços em sequência (até 20), duração calculada e preço/nome/duração históricos. Serviços preservados mantêm os valores originais ao remarcar.
- Criação protegida por chave de envio para evitar duplicação em reenvios, remarcação com versão e autorização de origem/destino, status e cancelamento com motivo e histórico.
- Estados: agendado, confirmado, chegou, concluído, não compareceu e cancelado. Estados finais não reabrem. Conclusão/falta não são permitidas antes dos horários correspondentes. A conclusão da reserva não cria atendimento, comanda ou pagamento.
- Validação transacional da jornada, intervalos, bloqueios e reservas, com bloqueio dos profissionais em ordem estável. Bloqueios não podem ocupar reservas; jornadas não podem invalidar agendamentos futuros. Sobreposição continua desabilitada, pois não há política de exceção habilitada.
- Agenda própria usa o vínculo profissional–usuário em lista, detalhes, opções, serviços e escritas. Cliente relacionado é aquele criado pelo titular ou que possui reserva com seu profissional. A recepção pode fazer a primeira reserva quando ainda não existe relação.
- Histórico de até 50 alterações nos detalhes, com ator, data, motivo e transições. Auditoria completa permanece no módulo autorizado.
- Migration `202609080004_appointments` aplicada no banco local, preservando dados. Nenhum agendamento ou cliente de teste foi inserido no banco do salão.
- Build, testes unitários (11) e suíte completa de integração/navegador passaram. Novos testes em `tests/appointments.test.ts` e `tests/appointments.mjs`; capturas da agenda em `.local/screenshots/agenda-*.png`.
- O executor de integração agora registra falhas de inicialização do PostgreSQL e define saída de erro antes da limpeza, evitando que falhas de abertura de sockets pareçam uma execução bem-sucedida. Testes que abrem portas precisam de execução autorizada fora do isolamento de rede.

Próxima etapa conforme `docs/roadmap.md`: produtos e estoque. Atendimentos, comandas, financeiro e relatórios continuam pendentes. A agenda funciona como reserva e acompanhamento de status, sem baixa de produtos ou recebimentos.

## Continuação de 09/09: produtos e estoque

O usuário pediu para continuar de onde paramos. Seguindo o próximo módulo registrado no plano, foram implementados:

- Produtos com descrição, unidade-base fixa (`ml`, `g`, `un`), embalagens com conversões compatíveis e estoque mínimo; busca paginada, edição com versão e ativação/desativação.
- Fornecedores com nome, telefone, e-mail, observações, status, concorrência e auditoria. Permissões compartilhadas com o catálogo de produtos.
- Entradas, perdas, baixas manuais e ajustes por saldo contado. Quantidades/custos como strings decimais, aritmética com bigint e seis casas decimais. Saldo compartilhado por salão; política de negativo desabilitada.
- Movimento, atualização de saldo e auditoria atômicos; produto bloqueado em transação; proteção contra reenvios com requestKey e hash. O formulário mantém o mesmo envio após erro de rede/5xx.
- Histórico imutável com saldos, motivo, ator e cópias de produto/embalagem/fornecedor. Consulta de custo exige permissão específica, inclusive na auditoria.
- Interface de computador/celular nos menus **Produtos e estoque** e **Fornecedores**, com aviso de reposição, seleção paginada de fornecedor e histórico.
- Migration `202609090001_inventory` validada do zero em PostgreSQL isolado e aplicada ao banco local. Nenhum produto, fornecedor ou movimento fictício foi inserido no banco real.
- Build, typecheck, 14 testes unitários e suíte completa de integração/navegador passaram. Incluem concorrência, precisão máxima, escopo, autorização, rollback e resposta interrompida após commit com retry sem duplicação. Formatação verificada. Capturas em `.local/screenshots/inventory-desktop.png` e `inventory-mobile.png`.

Limites: não há custo médio, integração financeira, lotes/validade, transferências ou saldo separado por unidade. Consumo em atendimentos/comandas será implementado na próxima fase. Leia o contrato em `docs/api.md`.

Próxima etapa: **atendimentos e comandas**, conforme `docs/roadmap.md`. O diretório Git continua indisponível como repositório; nenhuma alteração foi commitada.

## Ajustes de uso da agenda — 09/09

- A busca de serviços agora explica que depende de serviços ativos vinculados ao profissional em Disponibilidade.
- A mensagem de validação diferencia jornada vazia de horário fora da jornada; o usuário foi orientado a cadastrar a jornada real, sem alteração automática de horários.
- A pedido do usuário, o valor de cada serviço pode ser editado na seleção do agendamento, sem alterar o catálogo. Usa a permissão existente `comandas.alterar_preco`; administrador já a possui. Preços decimais exatos, total atualizado e preservação ao remarcar. O motivo ficou opcional na criação, edição e alteração de status da agenda; auditoria continua automática.
- O trabalho foi aplicado à tela atual de agendamento. O módulo de comandas permanece como próxima fase; não há cobrança ou baixa automática nesta mudança.

## Continuação de 09–10/09: atendimentos e comandas

O usuário perguntou sobre financeiro e pediu para continuar. Foi explicado que a próxima etapa do plano, atendimentos e comandas, prepararia os registros usados pelos pagamentos. Esta etapa foi concluída:

- Menus **Comandas** e **Atendimentos**, com estados vazio/carregamento/erro, pesquisa, filtros e paginação. Comandas podem reunir vários profissionais do mesmo cliente; a lista de clientes oferece acesso ao histórico de comandas.
- Abertura para cliente ativo, serviços manuais ou importação única da agenda com preços combinados preservados. Agendamentos importados passam a ser controlados pelo atendimento e não podem mais ser editados diretamente na agenda.
- Edição de valores por serviço com `comandas.alterar_preco`, desconto fixo com `comandas.aplicar_desconto` e totais exatos calculados no servidor. Motivo opcional, conforme pedido anterior; auditoria continua automática.
- Atendimentos aguardando → em andamento → concluídos, início/fim real e atualização da reserva vinculada. Profissionais usam escopo próprio; gestores podem operar qualquer atendimento conforme permissões.
- Consumo confirmado em unidade-base com saldo, movimento, vínculo, auditoria e idempotência na mesma transação. Quantidade decimal de seis casas; custo de referência da última entrada conhecida preservado e oculto sem permissão. Cancelamento não devolve produtos consumidos.
- Comanda `READY` significa serviços finalizados, valores preservados. **Não registra pagamento nem quita a comanda**. Pagamentos, fechamento financeiro, estornos e caixa diário continuam pendentes.
- Migration `202609090002_orders` cria comandas, atendimentos, itens, consumos e registro de comandos. FKs compostas protegem salão/cliente/profissional e vínculo único da agenda; triggers protegem histórico de consumo/comandos e itens encerrados.
- Build, typecheck, 17 testes unitários e suíte completa de integração/navegador passaram em banco descartável. Cobertura inclui valores, desconto, escopo próprio, concorrência, vínculo com agenda, rollback, consumo com retry após resposta interrompida e celular. Capturas em `.local/screenshots/orders-mobile.png` e `orders-desktop.png`.

Detalhes em `docs/api.md`. Comanda própria, nesta etapa, é a aberta pelo titular; atendimento próprio é aquele atribuído ao profissional vinculado. Cadastro de atendimentos é feito na comanda, inclusive importação da agenda; a tela de atendimentos executa os serviços atribuídos. Valores são editáveis antes de concluir atendimento; desconto antes de finalizar a comanda. Não há venda de produtos, reabertura de comanda finalizada ou pagamento nesta entrega.

Migração de comandas aplicada ao banco local em 10/09, preservando os dados existentes. Interface e API responderam HTTP 200 após a aplicação. Nenhuma fixture foi inserida no banco do salão.

## Preferência permanente de continuidade — 10/09

O usuário pediu para salvar a conversa quando os tokens estiverem acabando. Manter resumos de retomada em `docs/retomada.md` e `docs/conversas/` ao longo do trabalho, após marcos importantes e antes de encerrar/interromper. Registrar estado real, decisões, testes, comandos em execução e pendências, sem credenciais. Não prometer detectar antecipadamente todo limite de tokens nem transcrição integral automática. Retomar sempre lendo estes registros.

## Em andamento: pagamentos e financeiro

Autorizado em 10/09. Implementar próxima fase do roadmap: pagamentos manuais (dinheiro, PIX, cartão, outros), divisão de pagamento, troco separado, fechamento transacional e idempotente, estornos rastreáveis e visão financeira com venda separada de recebimento. Estado inicial: comandas READY ainda não possuem pagamentos. Banco local preservado; usar testes isolados antes de migrar. Motivo permanece opcional, conforme preferência do usuário. Esta nota será atualizada com os próximos marcos.

### Marco do financeiro: código inicial pronto, antes dos testes

Schema/migration `202609100001_finance` criados; ainda NÃO aplicados ao banco local neste marco. API em `apps/api/src/finance/`: checkout dividido com troco, venda única, estorno parcial e cancelamento de venda com estorno do saldo recebido; resumo e listas financeiras. UI em `apps/web/src/pages/finance/`, seção Pagamentos nas comandas e menu Financeiro. Novos estados CLOSED (quitada) e DUE (saldo pendente). Motivo opcional; confirmação explícita do recebimento/estorno manual. Typecheck passou. Próximo passo: testes de regras/API/navegador, corrigir falhas, depois aplicar migração e verificar serviços. Não há integração bancária ou cobrança externa.

### Marco do financeiro: validação concluída

A suíte completa `npm run test:e2e` passou em PostgreSQL isolado com navegador: pagamentos divididos, troco, reenvio após resposta interrompida sem duplicação, estorno parcial, saldo pendente, novo recebimento sem nova venda, cancelamento da venda, datas independentes, valores negativos no período, isolamento, permissões, imutabilidade e rollback. Os 20 testes unitários passaram; build e typecheck passaram. Capturas em `.local/screenshots/payments-mobile.png`, `finance-mobile.png` e `finance-desktop.png`. Próximo passo: documentação final, migração local e verificação HTTP. Preferência de continuidade também registrada em `AGENTS.md` na raiz.

### Financeiro inicial concluído e disponível — 10/09

Migração `202609100001_finance` aplicada com sucesso ao banco local. Interface em `http://localhost:5173` e API em `http://127.0.0.1:3001/api/health` responderam HTTP 200 após a aplicação. Dados reais preservados, sem fixtures ou pagamentos de teste no banco do salão. Formatação verificada com `npm run format:check`; build, typecheck, 20 testes unitários e suíte completa de integração/navegador aprovados conforme marco anterior.

Disponíveis: registro manual de pagamentos divididos, dinheiro com troco, PIX, cartões e outros; quitação da comanda; estorno parcial de recebimento com saldo pendente; cancelamento financeiro da venda; painel por período com vendas, recebimentos e estornos separados. Motivo opcional, confirmação dos registros obrigatória. Não há integração bancária, despesas ou abertura/fechamento de caixa nesta entrega. Próxima fase do plano: gestão, dashboard e relatórios. Serviços locais já estavam em execução nas portas 5432, 3001 e 5173; conferir antes de reiniciar. Nenhum teste ficou em execução.

## Continuação de 10/09: dashboard de gestão em validação

Pedido: continuar de onde paramos. Iniciada fase Gestão pelo dashboard operacional. A tela inicial agora consulta agenda por status no período, comandas pendentes atuais, produtos ativos no mínimo/abaixo e clientes não arquivados; financeiro reaproveita o resumo existente separando vendas de recebimentos. API `/dashboard` aplica permissões por indicador e escopo próprio da agenda/comandas; `/dashboard/context` fornece data/fuso do salão. Sem alteração de schema ou migração.

Typecheck e 20 testes unitários passaram. Suíte completa de integração/navegador iniciada; resultado ainda pendente neste marco. Testes específicos em `tests/dashboard.mjs`; navegador acrescenta dashboard desktop/celular. Nenhum serviço local estava nas portas 5432/3001/5173 na consulta inicial; iniciar após validar. Fase Gestão ainda inclui relatórios, ocupação, filtros de auditoria e exportações, que permanecem pendentes.

### Dashboard operacional validado — 10/09

Build, typecheck, 20 testes unitários e suíte completa de integração/navegador passaram. Teste novo concilia contagens com os registros do PostgreSQL isolado e verifica datas inválidas, autenticação, escopo do salão/profissional e ocultação de indicadores sem permissão. Primeira execução encontrou dependência de permissões concedidas por testes anteriores à fixture compartilhada; o cenário passou a definir negações explícitas. Outra tentativa foi bloqueada ao abrir socket no sandbox; execução autorizada passou. Nenhuma dessas falhas exigiu alteração nos dados reais.

Aplicação e banco locais iniciados após verificar portas livres. Interface 5173 e API 3001 responderam HTTP 200; PostgreSQL em 5432. Sessões de execução nesta retomada: banco 49824, desenvolvimento 31637. Sem migration nova. Capturas desktop e móvel em `.local/screenshots/dashboard-*.png`; captura móvel conferida visualmente após aguardar o menu sair da tela; repetição final da suíte completa aprovada. Nenhum teste ficou em execução. A fase Gestão continua aberta: ocupação, relatórios detalhados, filtros de auditoria e exportações ainda não implementados. O diretório Git continua sem repositório utilizável; sem commit.

## Ajuste solicitado: agenda concluída e formas de pagamento — 10/09

Usuário relatou corte concluído hoje sem aparecer no financeiro e pediu dinheiro/crédito/débito na comanda e financeiro. Consulta somente de status/valores no banco real confirmou: nenhum registro de comanda, um corte concluído na agenda sem vínculo com atendimento. Não houve mudança em registros reais nem recebimento presumido.

Implementado, em validação: importação de agendamento COMPLETED para comanda com atendimento já concluído, preços históricos, vínculo único e horários reais nulos (a agenda não os registra). Itens são inseridos antes de concluir o atendimento para respeitar trigger de imutabilidade. Agenda oferece orientação e link para comandas do cliente. Pagamentos destaca formas existentes e oferece “Finalizar e receber” quando todos os atendimentos terminaram; finaliza serviços e abre confirmação de recebimento. Cancelar o diálogo deixa a comanda READY sem venda/pagamento. Financeiro mostra formas também nas linhas de vendas; resumo por forma identificado como recebido antes de estornos. Comandos invalidam dashboard.

Typecheck aprovado; testes unitários e suíte completa iniciados. Nenhuma migration necessária. Próximo passo: finalizar validação, conferir HTTP e salvar resultado.

### Correção agenda → comanda → financeiro validada

Suíte completa `npm run test:e2e` aprovada após o ajuste da expectativa do teste financeiro (delta exato de estorno, considerando vendas anteriores da fixture). Build, typecheck, 20 testes unitários e formatação aprovados. Navegador verificou “Finalizar e receber”, cancelamento do diálogo sem pagamento e formas na listagem de vendas. Teste de API verificou importação de agenda COMPLETED, total histórico, horários reais nulos, retry sem duplicação, bloqueio em segunda comanda e pagamento dividido crédito/débito listado no financeiro. Interface/API locais HTTP 200. Sem migração e sem alteração de registro real. Nenhum teste ficou em execução; serviços locais anteriores seguem disponíveis.

Orientação para o teste do usuário: Comandas → Abrir comanda para o cliente → Trazer da agenda → selecionar corte concluído → Finalizar e receber → escolher forma e confirmar recebimento. Não lançar pagamento sem confirmação do usuário no sistema.

## Clareza do financeiro — 10/09

Usuário pediu substituir indicadores confusos como “Vendas após cancelamentos” por total do período, PIX, crédito, débito, dinheiro e estornos. Resumo da tela Financeiro reorganizado: Total recebido no período (bruto), cards fixos PIX/crédito/débito/dinheiro/outras formas, Estornos no período e Total líquido do período (recebido menos estornos). Meios sem pagamentos mostram zero. Pendências continuam identificadas como atuais. Lista padrão alterada para Pagamentos recebidos; Histórico de vendas segue como filtro opcional. Dashboard recebeu os mesmos nomes de total recebido/líquido e explicação de estornos. Sem alteração na API, cálculos ou dados do salão. Build e teste completo de navegador em andamento neste marco.

Validação da simplificação concluída: build (inclui TypeScript API/web), formatação e suíte completa `npm run test:e2e` aprovados. Navegador conferiu total recebido, estornos, líquido, cartão sem movimento exibindo zero, lista padrão de pagamentos e histórico de vendas acessível. Capturas atualizadas em `.local/screenshots/finance-desktop.png` e `finance-mobile.png`; desktop inspecionado visualmente. Interface/API locais HTTP 200. Nenhuma migração, nenhum dado real alterado e nenhum teste em execução ao encerrar.

## Relatórios de serviços e profissionais — em validação

Usuário autorizou seguir com serviços e profissionais, primeira entrega de relatórios. Implementados menu Relatórios, período, busca, agrupamento por serviço/profissional, ordenação por quantidade e paginação. Totais de serviços/atendimentos e valor histórico antes do desconto da comanda (não pagamento, lucro ou comissão). Inclui concluídos sem comanda na agenda e atendimentos concluídos, sem duplicar após importação. Usa conclusão real do atendimento ou término agendado quando não há conclusão real; exclui faltas/cancelados/não concluídos. Nomes atuais, incluindo cadastros inativos.

API `/reports/context` e `/reports/production` exige `relatorios.agenda` e permite relatório de todo o salão; valores exigem adicionalmente `relatorios.financeiro`, caso contrário retornam null. Essas permissões já existem; nenhuma migration. Agregação e paginação no PostgreSQL, transação RepeatableRead, isolamento por salão, valores Decimal exatos. Typecheck passou; suíte completa com novos testes em `tests/reports.mjs` em andamento neste marco. Não foram modificados dados reais. Ocupação, exportações, estoque detalhado e auditoria avançada seguem pendentes.

### Relatórios de serviços e profissionais validados — 10/09

Build, typecheck, formatação e suíte completa `npm run test:e2e` aprovados. Testes específicos validaram isolamento com dados de outro salão, acesso negado sem permissão de relatório, valores nulos sem permissão financeira, preços históricos exatos, serviços/profissionais inativos, substituição da agenda pela comanda sem duplicação, limites de data no fuso do salão, cancelados excluídos, busca literal e página vazia preservando os totais. Navegador verificou agrupamentos, valores, estado vazio e layout desktop/celular. Capturas em `.local/screenshots/reports-desktop.png` e `reports-mobile.png`; móvel inspecionado visualmente. Interface/API locais HTTP 200. Nenhuma migração necessária, nenhum dado real alterado e nenhum teste ficou em execução. Próxima entrega: ocupação da agenda; demais pendências no roadmap.

## Ocupação da agenda — em validação

Usuário autorizou seguir com ocupação. Implementados seletor de tipo em Relatórios e `/reports/occupancy`, com permissão `relatorios.agenda` para todo o salão. Período até 31 dias, busca, ativos/todos, paginação e totais sobre todos os resultados da busca. Jornada atual menos intervalos e bloqueios ativos define tempo disponível. União das reservas não canceladas/não faltantes dentro da disponibilidade define ocupado; livre é a diferença. Taxa ponderada pelo tempo disponível, null quando não há disponibilidade. Cancelamentos/faltas separados, duração fora da disponibilidade atual destacada, sobreposições sem duplicação e reservas limitadas ao período.

Limitação explicada de forma visível: usa jornada atual, pois não há versionamento histórico; mudanças de jornada/cancelamento de bloqueio afetam retrospectiva. Atendimentos sem reserva não entram. Limites: até 200 profissionais na busca e 20.000 registros de cada tipo, com erro orientando reduzir filtro, nunca truncamento silencioso. API lê snapshot RepeatableRead e calcula após liberar a transação; não retorna clientes ou valores. Fuso usa conversão validada existente; datas/horários ambíguos/inexistentes retornam erro. Sem migration ou alteração em dados reais. Typecheck e 23 testes unitários passaram; suíte completa API/navegador em andamento. Novos testes em `tests/occupancy.test.ts` e `tests/occupancy.mjs`.

### Ocupação validada — 10/09

Typecheck, 23 testes unitários, build e suíte completa de integração/navegador aprovados. Unidade verifica união/interseção, bloqueios sobrepostos, taxa zero/sem jornada, adjacência e meia-noite no fuso. API verifica total de 6h disponíveis, 2h ocupadas, 4h livres, 1h bloqueada e taxa 33,3%, com cancelamentos/faltas separados; escopo de salão, acesso negado, datas inválidas, inativos e totais independentes da página também aprovados. Navegador validou navegação pelo seletor e layout desktop/celular; captura móvel inspecionada visualmente. Formatação passou. Capturas `.local/screenshots/occupancy-desktop.png` e `occupancy-mobile.png`. Interface/API locais HTTP 200. Nenhuma migração e nenhum dado real alterado. Próxima etapa sugerida: relatório de consumo/reposição de estoque, seguido de filtros avançados de auditoria e exportações; detalhes no roadmap.

## Consumo e reposição de estoque — em validação

Usuário autorizou continuar (duas mensagens reforçando o mesmo pedido). Implementados relatório de estoque e contexto próprio sob `relatorios.estoque`, independente de `relatorios.agenda`. Menu Relatórios e seletor respeitam cada permissão. Visão por produto, busca/paginação, ativos/todos e filtro de reposição. Consumo identificado pelo vínculo real de movimento com atendimento, inclusive cancelado; entradas, perdas, baixa manual e ajustes líquidos separados. Quantidades SQL numeric → strings de seis casas, sem somar unidades diferentes; não retorna custos. Saldo/mínimo/reposição são atuais, explicitados; diferença até o mínimo não é previsão de compra. Produtos ativos no mínimo também geram alerta, com diferença zero. Totais de contagem consideram toda a busca, não a página. Sem migration ou escrita em dados reais.

Typecheck passou; suíte completa iniciada com `tests/stock-report.mjs`, verificando consumo mínimo de 0,000001, cancelamento preservado, limites de data local, dados estrangeiros, inativos, permissão independente e paginação real. Capturas de navegador previstas em `.local/screenshots/stock-report-*.png`. Próximo passo: concluir validação e registrar resultado.

### Relatório de estoque validado — 10/09

Typecheck, build e suíte completa `npm run test:e2e` aprovados. API verificou seis casas exatas, consumo de atendimento cancelado sem reversão, movimentos separados, ajuste negativo, limite de meia-noite no fuso local, saldo atual independente do período, igualdade ao mínimo, inclusão opcional de inativos, isolamento, ausência de custo na resposta, permissão de estoque sem agenda e paginação de 23 produtos (20+3) com totais completos. Navegador verificou seletor, detalhamento de movimentos, estado vazio e layouts desktop/celular. Captura móvel inspecionada; arquivos em `.local/screenshots/stock-report-desktop.png` e `stock-report-mobile.png`. Interface/API HTTP 200. Sem migração, nenhum dado real alterado e nenhum teste em execução ao encerrar. Próximo item sugerido: filtros avançados de auditoria; recebimentos detalhados/exportações continuam no roadmap.

## Filtros avançados de auditoria — em validação

Usuário autorizou continuar. Implementados filtros combináveis em `/audit`: período opcional (duas datas ou nenhuma, diferença até 366 dias), ator por ID do vínculo, ação exata, módulo/entidade exata, identificador do registro e texto do motivo. Ordem estável data/ID, 20 por página, total de todos os resultados. Datas no fuso do salão. Novos `/audit/context` com ações/módulos presentes somente no salão e fuso, `/audit/actors` paginado com busca por nome incluindo inativos (somente ID/nome). Todos exigem `auditoria.visualizar`; ocultação de custo existente preservada.

Tela aplica filtros por botão, permite limpar, mostra contagem, usuário/módulo e identificador do registro, erros/vazio e horários no fuso do salão. Nomes de ações de comanda reaproveitados; demais têm fallback legível. Typecheck aprovado, suíte completa API/navegador em andamento. Novos testes `tests/audit-filters.mjs`. Nenhuma migração nem alteração em registros reais.

### Auditoria com filtros validada — 10/09

Build, typecheck, formatação e suíte completa de integração/navegador aprovados. Primeira execução do navegador falhou no nome acessível do filtro Ação; corrigido com aria-label explícito em Ação/Módulo e repetição passou. API validou filtros combinados, par de datas, limite no fuso local, 21 eventos paginados sem duplicação, isolamento de opções/atores e consultas, acesso negado e ocultação de custo preservada. Navegador validou aplicar/limpar filtros, estado vazio e layouts desktop/celular; captura desktop inspecionada visualmente. Capturas `.local/screenshots/audit-filters-desktop.png` e `audit-filters-mobile.png`. Interface/API HTTP 200. Nenhuma migration ou registro real alterado; nenhum teste em execução. Próximo item sugerido: relatórios detalhados de recebimentos, depois exportações autorizadas. Diretório Git continua sem repositório utilizável.

## Recebimentos detalhados — em validação

Usuário autorizou seguir. Implementado relatório `/reports/receipts` e contexto próprio sob `relatorios.financeiro`, independente dos relatórios de agenda/estoque. Menu/seletor ajustados para acesso financeiro isolado. Filtros de período (até diferença 366 dias), nome preservado do cliente, forma e tipo (pagamento/estorno/ambos). Lista combina eventos por sua própria data e mantém pagamento original vinculado nos estornos. Totais recebido/estornado/líquido e troco, resumo por cinco formas, zeros e negativo permitido. Troco não soma receita. Todas as somas numeric/Decimal, duas casas e strings. Paginação 20 com totais de todos os filtros, ordem estável; snapshot RepeatableRead e salão em todas as junções. Detalhes expõem referência/motivo e IDs para rastrear origem, sem criar permissão de escrita ou de abrir comandas de outros escopos.

Typecheck passou; suíte completa com teste novo `tests/receipts-report.mjs` em andamento. Sem migration nem escrita em registros reais. Testes cobrem pagamento dividido, estorno de pagamento anterior ao período, fronteira local, troco, negativo, 24 linhas paginadas, filtros e isolamento. Próximo passo: concluir validação e salvar resultado.

### Recebimentos detalhados validados — 10/09

Typecheck, build, formatação e suíte completa de integração/navegador aprovados. Primeiro teste visual divergiu somente da posição do sinal negativo no formatador existente; expectativa corrigida e repetição passou. Testes verificaram 24 eventos paginados sem repetição, filtros por cliente/forma/tipo, valores exatos em centavos, troco fora da receita, estorno de pagamento antigo, limite local inclusivo/exclusivo, zeros, negativo, isolamento e autorização por relatório financeiro. Navegador verificou filtros e vazio, capturas desktop/celular; móvel inspecionado visualmente. Capturas `.local/screenshots/receipts-report-desktop.png` e `receipts-report-mobile.png`. Interface/API HTTP 200. Nenhuma migração, nenhum dado real alterado e nenhum teste ficou em execução. Próxima entrega: exportações autorizadas dos relatórios; produção permanece posterior conforme roadmap.

## Exportações CSV — em validação, retomada em 11/09

Usuário autorizou exportações e reforçou continuidade em 11/09. Implementado botão Exportar CSV nos quatro relatórios (produção, ocupação, estoque, recebimentos). Endpoints `/export` usam o mesmo cálculo/snapshot e permissões da tela, incluem todos os filtros e resultados, ignorando a página; limite de 10.000 linhas com recusa explícita. Ocupação mantém limites menores existentes. CSV UTF-8 com BOM, separador ponto e vírgula, decimais com vírgula e precisão textual preservada. Cabeçalho de contexto com período, fuso, filtros, geração e observação sobre interpretação. Textos que poderiam ser fórmulas são neutralizados. Valores de produção continuam ocultos sem `relatorios.financeiro`.

Cada arquivo gerado registra auditoria RELATORIO_EXPORTADO, apenas tipo/período/quantidade/fuso, sem conteúdo dos clientes. Resposta JSON com nome/conteúdo, download via Blob; não envia para terceiros. Sem migration ou escrita em dados reais. Typecheck, build e 26 testes unitários passaram. Primeira execução completa falhou no teste de download porque a tela ainda mantinha a busca vazia de resultados do teste anterior; teste ajustado para limpar a busca, selecionar ambos os tipos e aguardar resultados. Próximo passo: repetir suíte completa e finalizar documentação. Testes em `tests/export.test.ts`, `tests/exports.mjs`.

### Exportações CSV validadas — 11/09

Typecheck, build, formatação, 26 testes unitários e suíte completa `npm run test:e2e` aprovados. Testes conferiram quatro relatórios, todas as páginas mesmo com page=2, filtros, nomes de arquivo, BOM/acentos/aspas/quebras de linha, seis casas, números negativos, neutralização de fórmulas, auditoria, limite de linhas, autorização e ocultação da coluna financeira. Navegador baixou arquivo real e conferiu conteúdo filtrado por PIX. Primeira execução falhou somente por estado de busca herdado de cenário anterior; repetição com busca explicitamente limpa passou. Nenhuma migration ou dado real alterado; testes encerrados. Registros da sessão em `docs/conversas/2026-09-11.md`.

A etapa Gestão do roadmap foi concluída no escopo atual. Próximo trabalho sugerido: preparação para produção, começando por backup/restauração com ensaio em banco isolado, antes de qualquer publicação. Exportações não substituem backup do banco. Não houve deploy, commit ou envio de arquivos para terceiros.

## Backup/restauração — implementação e ensaio em andamento

Usuário autorizou começar a preparação para produção. Criados `db:backup`, `db:restore` e `test:backup`, com pg*dump custom, checksum SHA-256, diretório privado e restauração transacional somente em banco novo `salao_restore*\*`. Variáveis explícitas BACKUP_DATABASE_URL/RESTORE_DATABASE_URL; não carregam .env automaticamente. Teste reutiliza todas as fixtures da integração, compara todas as tabelas/restrições/triggers e verifica origem intacta, corrupção e destino existente. Clientes PostgreSQL 17.11 e libpq extraídos do repositório oficial para `.local/pg-client`, sem instalação global. Ensaio iniciado na porta isolada 15439; ainda não aprovado neste marco. Banco real 5432 e aplicação 3001/5173 preservados. Sem migration, agendamento ou backup real nesta etapa.

### Backup/restauração — ensaio aprovado em 11/09

`npm run test:backup` passou: build, integração completa da API e backup/restauração em PostgreSQL descartável. Todas as linhas das tabelas públicas (incluindo migrations, dinheiro/quantidades e auditoria), restrições e triggers conferidas; checksum corrompido e banco existente recusados, modos privados dos arquivos verificados e origem intacta. Formatação passou. Ensaio sem navegador (interface não mudou). Primeira falha: URL em PGDATABASE não foi expandida pelo cliente, corrigida usando `--dbname` explícito sem senha. Segunda: parser PostgreSQL reescreveu casts de arrays em CHECKs equivalentes; teste normaliza apenas essa equivalência, preservando comparação das demais definições. Repetição aprovada.

Comandos: `db:backup`, `db:restore`, `test:backup`; biblioteca em `scripts/lib/backup.mjs`, teste em `tests/backup.mjs`, procedimento em `docs/backup-restauracao.md`. Cliente 17.11 local exige POSTGRES_BIN e LD_LIBRARY_PATH conforme procedimento; dependência pg agora explícita no package.json/lock. npm install informou 5 achados em dependências (2 moderados/3 altos); não foi aplicado audit fix automático, avaliar na preparação de produção. Nenhuma migration necessária ou aplicada ao salão, nenhum backup real/agendamento/cópia externa/deploy realizado. Próximo trabalho: definir armazenamento externo, frequência/retenção, criptografia, automatização e alertas; ensaio operacional da aplicação recuperada ainda necessário antes de produção. Não afirmar que os dados reais já têm proteção automática.
