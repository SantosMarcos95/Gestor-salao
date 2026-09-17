# Backup diário na nuvem para Google Drive

Escolha final do usuário em 17/09/2026: executar diariamente na nuvem, sem
depender de o computador atual estar ligado. O workflow ativo em
`.github/workflows/salao-backup.yml` usa GitHub Actions às 03h17 no fuso
`America/Sao_Paulo` e permite execução manual mesmo com o agendamento
desativado. A variável `BACKUP_ENABLED=true` foi conferida no GitHub em 17/09;
os três Secrets necessários foram cadastrados. Execução manual
`35262437640` passou, com backup real e restauração isolada conferidos.
Conferir a primeira execução automática após o próximo horário agendado.

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
ainda precisam ser observadas.

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
