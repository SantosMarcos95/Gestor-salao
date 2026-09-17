# Backup automático no computador Windows/WSL

Alternativa preparada em 17/09/2026 e não ativada. O usuário escolheu depois
execução diária na nuvem; o procedimento ativo de preparação está em
`docs/backup-cloud-drive.md`. Se no futuro escolher execução local, o Windows
Task Scheduler executará a rotina às 03h e no
logon do usuário. A rotina `run-if-due` pula o backup quando já há cópia
externa íntegra com menos de 20 horas; caso contrário, faz novo dump. Se o
computador estiver desligado, o backup acontecerá no próximo logon, desde que
WSL, rede e Google Drive estejam disponíveis. Não há proteção contra alterações
ocorridas enquanto o computador estiver desligado.

## Arquivos preparados

- `.local/backup.env` privado, modo 0600, contém uma chave aleatória de 256
  bits. Nunca enviar esse arquivo ao Git ou a mensagens.
- `.local/bin/rclone` versão 1.60.1 do pacote Ubuntu, executável local. A
  configuração OAuth `.local/rclone.conf` ainda não existe.
- `ops/windows/register-salao-backup.ps1` registra uma tarefa diária e outra
  no logon. Não foi executado.
- `scripts/backup-local.mjs` lê o banco de `.local/neon.env`, valida que o
  destino é Neon e usa as demais opções de `.local/backup.env`.

## Ativação pendente

1. Abrir `.local/backup.env` localmente e guardar o valor de
   `BACKUP_ENCRYPTION_KEY` em um gerenciador de senhas ou papel fora deste
   computador. Sem essa chave, as cópias externas não podem ser recuperadas.
2. Criar um OAuth Client ID próprio para Google Drive pelo procedimento
   oficial: <https://rclone.org/drive/#making-your-own-client-id>. O Client ID
   compartilhado do rclone será aposentado em 2026. Criar app de tipo Desktop
   e usar escopo `drive.file` quando configurar o remoto.
3. No terminal WSL, executar
   `RCLONE_CONFIG=/home/marcos_paulo/salao-gestao/.local/rclone.conf /home/marcos_paulo/salao-gestao/.local/bin/rclone config`.
   Criar remoto chamado `drive_salao`, tipo Google Drive, com Client ID e
   Client Secret próprios. O navegador deve autorizar a conta de Drive. Não
   compartilhar Client Secret, token ou arquivo de configuração por mensagem.
   Após concluir, proteger `.local/rclone.conf` com modo 0600.
4. Confirmar o remoto com arquivo fictício e verificar leitura de volta. Antes
   de instalar a tarefa, fazer uma execução real e restaurar em banco
   isolado, conferindo o manifesto. É obrigatório verificar que a chave
   guardada fora do computador consegue descriptografar uma cópia.
5. Registrar a tarefa Windows a partir de PowerShell com
   `ops/windows/register-salao-backup.ps1`, conferir o resultado e executar
   uma vez manualmente. O script usa a distribuição WSL `Ubuntu` e o usuário
   `marcos_paulo`; revisar se mudarem. O timer systemd de usuário preparado
   em `ops/systemd/user/` é alternativa, não deve ser habilitado junto à
   tarefa Windows para evitar duplicação.

O alerta externo por webhook e a retenção ainda precisam de política e
destinatário. A tarefa registra falhas no Agendador de Tarefas; isso não
substitui uma notificação ao responsável. Até completar os passos acima,
**não há backup automático ativo dos dados reais**.
