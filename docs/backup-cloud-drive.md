# Backup diário na nuvem para Google Drive

Escolha final do usuário em 17/09/2026: executar diariamente na nuvem, sem
depender de o computador atual estar ligado. O workflow ativo em
`.github/workflows/salao-backup.yml` usa GitHub Actions às 03h17 no fuso
`America/Sao_Paulo` e permite execução manual mesmo com o agendamento
desativado. A variável `BACKUP_ENABLED=true` foi conferida no GitHub em 17/09;
os três Secrets necessários foram cadastrados. Execução manual
`35262437640` passou, com backup real e restauração isolada conferidos.
Execuções automáticas de 18 e 19/09 aprovadas; quatro pares completos confirmados no Drive em 19/09.

O job instala cliente PostgreSQL 18, rclone 1.75.1 com SHA-256 conferido e
dependências Node. Lê a conexão
Neon de um segredo, produz dump custom, valida com `pg_restore --list`, cifra
com AES-256-GCM, envia dump e manifesto ao remoto `drive_salao:backups`, lê
ambos de volta para verificar SHA-256 e executa `backup:check`. Não publica
artifacts do GitHub nem guarda dump no repositório. O runner é temporário;
arquivos locais somem ao fim do job. Após cada nova cópia confirmada, a rotina
de retenção remove pares completos com mais de 90 dias, preservando sempre os
sete pares completos mais recentes. Cópias incompletas não são removidas
automaticamente para permitir investigação.

O workflow `salao-backup-monitor.yml` consulta o Drive todos os dias às 11h17
de São Paulo e falha se não houver um par completo recente (até 36 horas).
Ele não exige conexão com o banco. As falhas dos workflows ficam visíveis no
GitHub Actions; a entrega de aviso por e-mail depende das preferências de
notificação da conta GitHub. Como os dois workflows usam o agendador do GitHub,
um serviço externo ainda seria necessário para detectar falha do próprio
agendador. A primeira execução automática e a primeira verificação agendada
ainda precisam ser observadas. Ensaios manuais: monitor `35288577700` passou;
backup com retenção `35288612776` passou, removeu zero pares e preservou os dois
pares cifrados no Drive.

## Ativação concluída em 17/09

1. Guardar `BACKUP_ENCRYPTION_KEY` de `.local/backup.env` fora do computador.
   Sem ela, a cópia cifrada não pode ser recuperada. Não enviar chave ou
   Client Secret por mensagens.
2. Criar um OAuth Client ID próprio e conectar `.local/rclone.conf` ao Drive,
   como no [guia do rclone](https://rclone.org/drive/#making-your-own-client-id).
   O app deve ser publicado; em modo Testing a autorização expira após uma
   semana. Nomear o remoto `drive_salao` e usar escopo `drive.file`.
3. Testar envio/leitura de arquivo fictício e proteger `.local/rclone.conf`
   com modo 0600. Ele contém token de acesso e não deve ir para o Git.
4. Cadastrados no GitHub Actions Secrets do repositório:
   `BACKUP_DATABASE_URL` (valor privado de `.local/neon.env`),
   `BACKUP_ENCRYPTION_KEY` (de `.local/backup.env`) e
   `BACKUP_RCLONE_CONFIG` (conteúdo inteiro de `.local/rclone.conf`). O
   assistente usou `gh secret set` localmente sem copiar valores
   pela conversa. `BACKUP_ALERT_WEBHOOK_URL` é opcional. Os nomes dos segredos
   podem ser conferidos sem mostrar seus valores.
5. Workflow publicado na branch principal. Execução manual aprovada, arquivos
   no Drive conferidos e restauração em banco isolado aprovada. Depois disso,
   variável `BACKUP_ENABLED=true` ativada e conferida.
6. Habilitar notificações por e-mail para falhas de GitHub Actions nas
   preferências da conta. Um monitor externo de ausência de execução ainda
   é recomendado porque jobs agendados podem atrasar ou ser descartados.

GitHub agenda somente workflows na branch principal. Em repositório público,
o agendamento pode ser desativado após 60 dias sem atividade. O horário é
aproximado: o GitHub informa que execuções agendadas podem atrasar ou ser
descartadas sob carga. Não chamar a rotina de operacional antes de uma
execução real confirmada e da restauração isolada.

## Mudança futura de computador ou banco

O Google Drive não depende do computador atual. Em outro computador, instale
o rclone, autorize a mesma conta e use a chave guardada fora do PC para
descriptografar uma cópia. Para migrar o banco Neon para um PostgreSQL local,
restaure em banco novo, faça uma janela de corte para impedir novos registros
no banco antigo, valide os dados e altere a conexão da aplicação. Nesse
cenário, o workflow na nuvem deixa de acessar o banco por padrão; antes da
troca é preciso instalar a rotina no novo computador ou preparar um executor
com acesso seguro ao novo banco. Os modelos locais em `ops/systemd/user/` e
`ops/windows/` ficaram preparados, porém não instalados.

## Monitor externo — integração local preparada em 19/09

Conta e dois Secrets confirmados em 19/09. Publicação e recebimento dos dois sinais pelo Healthchecks confirmados em 24/09 pelos logs dos jobs. Entrega de e-mail e configuração efetiva de período/tolerância ainda pendentes. Serviço: Healthchecks.io, com dois
checks separados e notificações por e-mail. O plano gratuito consultado em
19/09 permite 20 checks: https://healthchecks.io/pricing/.

Criar os checks “Backup diário do salão” e “Verificação do Drive”. Em cada um,
usar tipo Simple, Period de 1 dia e Grace Time de 12 horas. Assim, a ausência
de confirmação por 36 horas gera alerta, tolerando os atrasos observados no
GitHub. Vincular e confirmar a integração de e-mail em ambos. Falha explícita
é informada ao fim do job sem aguardar as 36 horas. Este prazo é uma escolha
operacional inicial, não garantia de execução ou recuperação.

Salvar as URLs privadas de ping UUID como Actions Secrets do repositório:
`BACKUP_HEALTHCHECKS_URL` para o backup e `BACKUP_DRIVE_HEALTHCHECKS_URL` para o
monitor do Drive. Não colar essas URLs na conversa ou no repositório. Podem
ser cadastradas diretamente no painel Settings → Secrets and variables →
Actions → New repository secret. Aguardar a configuração para publicar e
validar a integração. Sem secret, a etapa informa que não está configurada.

A etapa final `always()` chama `scripts/notify-backup-monitor.sh`: envia sucesso
somente após todas as etapas anteriores aprovadas, ou `/fail` para falha e
cancelamento. Usa HTTPS, timeout, tentativas limitadas e exige resposta exata
`OK`; HTTP 200 com check inexistente não é aceito. Não envia corpo, logs ou
dados do banco. Sem checkout ou runner disponível, o sinal pode não sair;
a ausência de confirmação será detectada pelo serviço externo. Os dois
checks são independentes: verificar o Drive não renova o prazo do backup.

Antes de declarar ativo: conferir os dois Secrets por nome, publicar os
workflows, observar confirmações reais e validar recebimento de e-mail.
Testar falha e ausência de sinal em um terceiro check temporário para evitar
falso sucesso nos checks reais. Usar a função de teste de notificação do
serviço e confirmar entrega, inclusive spam. Não disparar backup real apenas
para testar uma notificação. Em paralelo, configurar na conta GitHub, em
https://github.com/settings/notifications, e-mail de Actions e opção de avisar
somente workflows com falha. A entrega depende das preferências da conta;
não foi verificada nesta sessão.

Referências: https://healthchecks.io/docs/http_api/ e
https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs.
