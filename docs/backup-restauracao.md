# Backup e restauração

## Escopo

Rotina administrativa por terminal, sem botão na aplicação. `pg_dump` produz cópia lógica consistente de um banco PostgreSQL em formato custom, incluindo dados, migrations, índices, funções e triggers. `pg_restore` restaura em transação única. Não inclui roles globais, configuração do servidor, arquivos externos, código ou segredos de ambiente. A restauração usa o proprietário da conexão e não replica ACLs: permissões operacionais do PostgreSQL precisam ser provisionadas separadamente.

Referências: [pg_dump PostgreSQL 17](https://www.postgresql.org/docs/17/app-pgdump.html) e [pg_restore PostgreSQL 17](https://www.postgresql.org/docs/17/app-pgrestore.html).

## Pré-requisitos

Node e dependências do projeto, clientes PostgreSQL 17 (`pg_dump` e `pg_restore`) no PATH ou diretório `POSTGRES_BIN`. Usar clientes compatíveis com o servidor; revisar a versão ao atualizar PostgreSQL. A conta de backup precisa ler todos os dados e objetos; a de restauração precisa criar banco e seus objetos. Não reutilizar automaticamente a conta da aplicação em produção.

Neste ambiente, clientes 17.11 e libpq foram extraídos dos pacotes oficiais Ubuntu Noble PGDG em `.local/pg-client`, sem instalação global. Para usá-los nesta máquina:

```bash
export POSTGRES_BIN="$PWD/.local/pg-client/usr/lib/postgresql/17/bin"
export LD_LIBRARY_PATH="$PWD/.local/pg-client/usr/lib/x86_64-linux-gnu"
```

Em outro servidor, instalar clientes por gerenciamento de pacotes oficial. A pasta `.local` é ignorada pelo Git e não será transportada com o código.

## Criar uma cópia

Definir `BACKUP_DATABASE_URL` por gerenciador de segredos ou leitura oculta no terminal. O script não carrega `.env` e não usa `DATABASE_URL` como fallback, evitando escolher o salão por acidente. No Bash:

```bash
read -rsp 'URL do banco de origem: ' BACKUP_DATABASE_URL
export BACKUP_DATABASE_URL
npm run db:backup -- .local/backups
unset BACKUP_DATABASE_URL
```

Cada execução cria pasta única privada com `database.dump` (modo 600) e `manifest.json` contendo SHA-256 e data UTC. A cópia só fica completa quando ambos existem. `.partial`, ausência do manifesto, erro ou aviso do PostgreSQL significam operação não certificada; não usar esse resultado como backup válido. Arquivos anteriores não são sobrescritos. Nenhuma retenção ou exclusão automática foi implementada.

Checksum detecta corrupção acidental; não autentica origem e não criptografa. As cópias contêm dados pessoais, hashes de senha e sessões: restringir acesso e armazenar cópia externa criptografada. Confiar apenas em arquivos produzidos por origem administrada, pois restauração executa código SQL do backup. Nunca enviar dumps ao Git, chats ou logs.

## Restaurar sem sobrescrever

Escolher uma instância isolada e uma URL cujo banco se chame `salao_restore_<identificador>` (letras minúsculas, números e sublinhado). A conta precisa acessar o banco administrativo `postgres` na mesma instância. Não é necessário criar o banco de destino antes: o comando o cria a partir de template0 e recusa qualquer banco já existente, mesmo vazio.

```bash
read -rsp 'URL do banco NOVO de restauração: ' RESTORE_DATABASE_URL
export RESTORE_DATABASE_URL
npm run db:restore -- .local/backups/backup-IDENTIFICADOR
unset RESTORE_DATABASE_URL
```

Valida manifesto/checksum e leitura do arquivo antes de criar destino; restaura com `--single-transaction --exit-on-error --no-owner --no-acl`, sem `--clean`. Se a restauração falhar, o banco novo pode permanecer vazio; o script não o apaga. Investigar e usar outro nome para novo ensaio. Não há troca automática da conexão da aplicação.

Após restaurar, conferir migrations, contagens, recebimentos/estornos, saldos e auditoria. Fazer login e testar os fluxos em aplicação isolada compatível com a versão do backup. Definir revogação de sessões e rotação dos segredos antes de ativar um ambiente recuperado. Aprovar a recuperação antes de alterar a aplicação em uso.

## Ensaio automatizado

```bash
npm run test:backup
```

Requer portas 15439 (PostgreSQL), 3009/3010 (APIs de integração) e 3011 (API recuperada) livres. Executa build e integração completa de API com PostgreSQL descartável, incluindo fixtures de comandas, pagamentos divididos, estornos, estoque e auditoria. Ao final gera e restaura a cópia e compara todas as linhas de todas as tabelas públicas (incluindo migrations e decimais textuais), definições de restrições e triggers. Confere modos dos arquivos, recusa de destino existente e corrupção, e que a origem permanece intacta. Não usa o banco real 5432. Não abre navegador; sua suíte específica continua em `test:e2e`. Artefatos fictícios podem permanecer no diretório temporário da integração.

Depois da comparação integral, inicia outra API conectada exclusivamente ao banco restaurado. Verifica novo login com a conta fictícia recuperada, recusa da sessão revogada antes do backup, equivalência das consultas de clientes/comandas/produtos/financeiro/recebimentos/estoque, criação de cliente com auditoria e logout. Após essas escritas, compara novamente o inventário completo da origem para comprovar isolamento. A API recuperada é encerrada mesmo em falha. Ensaio aprovado em 15/09/2026 com `npm run test:backup` e clientes PostgreSQL locais configurados.

Esse ensaio valida operação pela API com fixtures e versão atual do código. Ainda faltam medição de recuperação com volume representativo e procedimento operacional de revogação de todas as sessões/rotação de segredos. Não mede RPO/RTO de produção nem valida armazenamento externo.

### Ensaio com navegador

```bash
npm run test:recovery
```

Usa os mesmos pré-requisitos de `test:backup`, mais Chromium do Playwright e porta 5178 livre. Executa build, integração completa de API, backup/restauração e ensaios da API e do navegador sobre a cópia. A interface usa proxy para 3011 e verifica um cliente existente somente no banco restaurado, confirmando o destino da conexão.

Validado em 15/09/2026: login com conta fictícia recuperada, cadastro persistente após recarga, recebimentos/estornos/líquido iguais à origem, relatório em computador e celular sem transbordamento horizontal, logout persistente após recarga e ausência de erros de JavaScript. O inventário integral da origem permanece igual após todas as escritas na cópia. Capturas em `.local/screenshots/recovery-desktop.png` e `recovery-mobile.png`. Os processos são encerrados ao terminar. Este é um ensaio automatizado com fixtures; o aceite operacional do responsável e a recuperação em infraestrutura de produção continuam pendentes.

## Pendências para operação

### Execução registrada e verificação local

Os comandos abaixo estão implementados, mas não há agendamento instalado. Com `BACKUP_DATABASE_URL` definido de forma privada e os clientes PostgreSQL configurados conforme os pré-requisitos:

```bash
export BACKUP_DIRECTORY="$PWD/.local/backups"
npm run backup:run
npm run backup:check
```

`backup:run` cria uma cópia pelo mesmo procedimento de `db:backup` e grava `status.json` privado, com estado e último sucesso. `job.lock` impede execuções concorrentes. Uma falha preserva a referência ao último sucesso, mas o estado permanece em falha até uma nova execução bem-sucedida. Nenhuma senha ou saída SQL é registrada.

`backup:check` dispensa credenciais de banco e verifica estado, idade e checksum do último arquivo. O limite padrão é 26 horas, configurável por `BACKUP_MAX_AGE_HOURS` (maior que zero, até 8760). Ausência, falha, execução interrompida, atraso ou corrupção resultam em saída 1 e mensagem de alerta no terminal. Isso não envia notificações: o futuro agendador/monitor deverá encaminhar a falha ao responsável. A verificação não substitui um ensaio de restauração.

Após interrupção abrupta, o bloqueio pode permanecer. Antes de remover manualmente `job.lock`, confirmar que a execução e seu processo PostgreSQL terminaram; depois executar novamente e conferir o estado. Não remover bloqueios automaticamente por idade. Os comandos não apagam cópias antigas, não criptografam nem transferem arquivos.

Validação específica: `npm run test:backup-job`, com arquivos fictícios temporários, cobre sucesso, atraso, corrupção, falha sem vazamento de segredo, nova tentativa, concorrência, bloqueio órfão e caminho inválido. Não acessa o banco do salão.

Esta entrega prepara comandos e ensaio; não ativa proteção automática dos dados reais. Antes de produção, escolher destino externo, criptografia, responsável, frequência e retenção; definir perda de dados tolerável (RPO) e prazo de recuperação (RTO); configurar agendamento e alerta de falha; medir restauração de volume representativo; fazer ensaio recorrente e registrar evidência. Uma cópia no mesmo computador não protege contra perda do equipamento. Backup lógico não permite recuperação ponto a ponto entre cópias; isso exige política adicional de WAL/PITR.
