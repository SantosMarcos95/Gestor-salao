# Aceite operacional dos fluxos publicados

Preparado em 24/09/2026. Este roteiro não representa aceite concluído. Testes automatizados anteriores foram executados em banco isolado; o smoke público de 24/09 confirmou página e health 200 e sessão protegida com 401.

## Conferência inicial, somente leitura

Acessar https://gestor-salao-api.vercel.app com a conta existente, sem compartilhar senha ou sessão. Conferir durante o uso normal:

- Agenda: data, horário, profissional e serviço de um agendamento conhecido. Detalhe sem comanda oferece “Abrir comanda” quando elegível; com vínculo oferece “Ver comanda”. Nesta conferência, apenas visualizar.
- Comanda existente: cliente, serviços, profissional, produtos, desconto e total correspondem ao atendimento. Se houver vínculo, o acesso pela agenda abre a mesma comanda.
- Produtos: preço por unidade vendida e quantidade física por embalagem correspondem ao cadastro usado pelo salão.
- Meu financeiro/comissões: profissional e período corretos. Funcionário consulta apenas os próprios vínculos; administrador consulta a equipe. Comissão representa valor gerado, não repasse efetuado.
- Caixa: conferir se existe turno aberto, saldo inicial, movimentos e saldo esperado. PIX/cartão não entram no saldo da gaveta.

Registrar apenas módulo, resultado e descrição do problema, sem nomes de clientes, valores privados ou credenciais nos registros do projeto.

## Conferência durante operações reais necessárias

Não criar vendas, estornos ou cancelamentos fictícios em produção. Casos artificiais ficam no banco isolado.

1. Na próxima abertura real de comanda pela agenda, conferir importação do serviço e vínculo único.
2. Na próxima venda real de produto, conferir total e quantidade física: a baixa ocorre no primeiro pagamento, não ao adicionar o item. Comissão incide apenas sobre serviços após o rateio do desconto.
3. No próximo recebimento real em dinheiro, conferir valor aplicado sem troco no turno aberto. A primeira abertura de caixa ativa a exigência de turno aberto para operações posteriores em dinheiro.
4. No fechamento real do caixa, comparar contado e esperado; registrar motivo se houver diferença.
5. Se um cancelamento for necessário: sem comanda, realizar pela agenda; com comanda, realizar pela comanda e conferir atualização da agenda. Motivo obrigatório. Cancelamento anterior ao pagamento não baixa estoque; estorno posterior não devolve produto automaticamente.

## Pendências de alertas

Comunicação dos dois workflows com Healthchecks confirmada em 24/09. Conferir no painel os dois checks, período de 1 dia, tolerância de 12 horas e canal de e-mail. Entrega de e-mail ainda não testada; procedimento de ensaio em `docs/backup-cloud-drive.md`. Não simular falha nos checks reais.

## Registro de aceite

Até 24/09: conferência autenticada pendente, sem operação real executada pelo agente. Registrar data, módulo, resultado observado e eventual correção quando cada conferência ocorrer.
