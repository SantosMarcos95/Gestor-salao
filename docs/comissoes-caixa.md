# Comissões por profissional e caixa

## Comissões

Administrador configura de 0 a 100% (até duas casas) em Profissionais. Cadastros existentes começam com 0%; configurar antes das novas vendas. Alterações são auditadas. Troca do usuário vinculado a um profissional passa a exigir administrador, pois transfere o acesso ao financeiro desse profissional.

Comissão nasce no pagamento, sobre os serviços após desconto. Desconto global da comanda é distribuído proporcionalmente aos preços dos serviços concluídos, com resto de centavos atribuído pelos maiores restos e desempate estável pelo ID do item. R$ 90 a 60% geram R$ 54 para o profissional e R$ 36 para o salão.

No primeiro checkout, preservamos serviço, profissional, percentual e base após desconto. Alterações posteriores de percentual não afetam essa venda nem o recebimento de seu saldo após estorno. Estornos reduzem proporcionalmente a base recebida da comanda. Cada evento recalcula o saldo acumulado e lança somente a diferença; reembolso completo zera a comissão e novo recebimento restaura o valor sem acumular erro de arredondamento. Arredondamento da comissão: meio centavo para cima, por item.

O checkout existente continua exigindo pagamento integral do saldo, podendo dividir entre formas. Não foi acrescentado parcelamento. Histórico anterior à implantação não recebe comissão calculada pelo percentual atual. Não há registro de repasse de comissão ao profissional nesta entrega: a tela mostra comissão gerada, não transferência realizada.

## Acesso

Meu financeiro/comissões está disponível a usuários autenticados. Funcionários veem apenas os profissionais vinculados ao próprio usuário, no mesmo salão. Sem vínculo, a tela orienta procurar o administrador. Um filtro por ID nunca amplia esse escopo. Administradores com o perfil protegido ROLE_ADMIN consultam a equipe e configuram percentuais. Nenhuma permissão geral de financeiro é concedida aos funcionários por este módulo; permissões gerais existentes continuam independentes.

Caixa exige `caixa.gerenciar`. A migration concede essa permissão aos perfis Administrador existentes; novos administradores recebem pelo catálogo de permissões. Pode ser delegada pelo controle de acesso existente.

## Caixa

Um turno aberto por salão (saldo compartilhado, não por funcionário ou unidade). Abertura registra saldo inicial, responsável e data. Recebimentos em dinheiro entram pelo valor aplicado, já descontado o troco; PIX/cartões/outros não movimentam a gaveta. Sangria exige valor positivo, motivo e saldo disponível. Estorno em dinheiro sai do turno aberto no momento do estorno, mesmo que o recebimento pertença a turno anterior. Saldo negativo por devolução é exibido, sem esconder divergência.

O primeiro turno ativa o controle: daí em diante, recebimentos e estornos em dinheiro exigem caixa aberto, com rollback integral em caso de recusa. Antes da primeira abertura, mantém-se a operação anterior; não são importados movimentos antigos. Oriente a equipe a abrir o caixa para ativar o acompanhamento.

Fechamento registra esperado, contado, diferença, responsável e observação. Diferença exige motivo. Se o saldo mudou desde a contagem exibida, é necessário atualizar e conferir antes de fechar. Locks serializam abertura, movimentos e fechamento; índice parcial impede dois turnos abertos. Reenvios idênticos não duplicam operações. Histórico fechado e movimentos não são editáveis. Não há exclusão, reabertura de turno encerrado ou suprimento adicional nesta entrega.

## API

- `GET /api/commissions/context`: data/fuso, profissionais permitidos e indicação de administrador.
- `GET /api/commissions?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&professionalId=UUID`: lançamentos paginados (20), totais de todo o filtro; até 366 dias de diferença, por data do lançamento no fuso do salão. Estornos negativos.
- `GET /api/cash?page=1`: histórico e turno atual com saldo esperado.
- `GET /api/cash/:id?page=1`: resumo, contagem, responsáveis e movimentos paginados.
- `POST /api/cash/open`: `opening`, `requestKey`, `confirmed:true`, `reason` opcional.
- `POST /api/cash/:id/withdraw`: `amount`, `reason` obrigatório, `requestKey`, `confirmed:true`.
- `POST /api/cash/:id/close`: `counted`, `expected` (último saldo exibido), `reason`, `requestKey`, `confirmed:true`.

Valores monetários são strings decimais com ponto. Percentual é `commissionRate` nos endpoints de cadastro de profissional, também string decimal. Autorização e escopo são verificados no servidor.

## Publicação

Migration: `202609160001_commissions_cash`. Coluna de percentual, tabelas de bases/lançamentos de comissão e turnos/movimentos de caixa, FKs, restrições, triggers de imutabilidade e permissão de caixa. Não recalcula nem altera pagamentos antigos.

Aplicar a migration no Neon antes de publicar o novo código. Alterações aditivas, compatíveis com o código anterior. A conexão disponível neste workspace foi identificada como local; não presumir que `npm run db:migrate` sem ambiente explícito atua no Neon. Não colocar secrets no chat, Git ou logs.

Com a conexão remota carregada privadamente em `NEON_DATABASE_URL`, executar:

```bash
DATABASE_URL="$NEON_DATABASE_URL" npm run db:migrate
```

Somente após confirmar o sucesso, publicar código e testar login, configuração do percentual e abertura do caixa na Vercel. Não executar `admin:create`: o usuário já confirmou conta e acesso no site.
