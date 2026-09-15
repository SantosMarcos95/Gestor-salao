# Modelos de agendamento local

Estado: modelos preparados, não instalados nem ativados. Dependem de servidor Linux com systemd. A rotina ainda não envia cópias externas ou notificações e não remove arquivos antigos.

## Configuração prevista

| Item                  | Valor do modelo                                                    |
| --------------------- | ------------------------------------------------------------------ |
| Código e dependências | `/opt/salao-gestao`                                                |
| Node                  | `/usr/bin/node` (conferir no servidor)                             |
| Clientes PostgreSQL   | `/usr/lib/postgresql/17/bin`                                       |
| Usuário de serviço    | `salao-backup`, sem login interativo                               |
| Diretório privado     | `/var/lib/salao-backup`, proprietário `salao-backup`, modo 0700    |
| Backup                | Diariamente às 03h de São Paulo, atraso aleatório de até 5 minutos |
| Verificação           | A cada hora, limite de idade de 26 horas                           |

Frequência e limite são valores iniciais do modelo, ainda não uma política aceita pelo responsável. `Persistent=true` solicita execução de agendamento perdido quando o temporizador volta a ficar ativo; não faz backups enquanto o computador está desligado. Um computador pessoal desligado à noite exige outra estratégia.

## Preparação no servidor escolhido

1. Provisionar Node compatível com o projeto, clientes PostgreSQL, código compilado e dependências. Ajustar os caminhos nas unidades; `ProtectHome=true` impede usar uma instalação dentro de `/home`. O usuário do serviço deve conseguir ler o código, sem permissão para alterá-lo.
2. Criar a conta de serviço e o diretório privado. Provisionar uma conta PostgreSQL com acesso suficiente para o dump e testar as permissões. Não presumir que as credenciais da aplicação servem para produção.
3. Criar `/etc/salao-backup.env` a partir de `backup.env.example`, substituindo os campos no próprio servidor, sem registrar segredos no Git. Proteger com proprietário root e modo 0600. Criar separadamente `/etc/salao-backup-check.env` a partir de `backup-check.env.example`; a verificação dispensa credenciais do banco.
4. Validar as quatro unidades com `systemd-analyze verify` no servidor. Conferir o horário com `systemd-analyze calendar '*-*-* 03:00:00 America/Sao_Paulo'`.
5. Depois de definir destino e política e autorizar a ativação, instalar as unidades em `/etc/systemd/system`, executar `systemctl daemon-reload` e iniciar manualmente `salao-backup.service`, seguido de `salao-backup-check.service`. Conferir arquivo, checksum e restauração isolada antes de habilitar os dois timers com `systemctl enable --now salao-backup.timer salao-backup-check.timer`.
6. Conferir `systemctl list-timers 'salao-backup*'` e os registros com `journalctl -u salao-backup.service -u salao-backup-check.service`. Saída 1 deixa a unidade em falha. Configurar monitor externo e destinatário para que a falha chegue ao responsável; journal sozinho não é notificação.

O serviço de backup tem limite de uma hora; a verificação, 15 minutos. Ajustar após medir com volume representativo. Interrupção pode deixar `job.lock`; investigar conforme [procedimento de backup](../../docs/backup-restauracao.md) antes de remover o bloqueio. Confirmar espaço livre, pois os modelos não implementam retenção.

## Validação neste workspace

`systemd-analyze verify` foi executado em 15/09/2026 e informou que `/usr/bin/node` não existe neste ambiente. As unidades não foram instaladas. A validação completa e a execução como usuário de serviço ficam pendentes no servidor escolhido; não interpretar a revisão dos modelos como agendamento operacional aprovado.
