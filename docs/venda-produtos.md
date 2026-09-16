# Venda de produtos na comanda

## Cadastro e uso

Em Produtos, configure a quantidade física de cada unidade vendida e seu preço de venda. Exemplo: base `ml`, frasco de 500 ml, preço R$ 30: quantidade por unidade `500` e preço `30,00`. O custo por unidade-base informado nas entradas continua separado do preço de venda. Produto sem preço não aparece na seleção da comanda. Cadastros existentes começam sem preço e com quantidade por unidade igual a 1; precisam ser configurados antes de vender. Somente unidades inteiras são vendidas nesta entrega.

Na comanda aberta, Adicionar produto busca produtos ativos com preço. Quantidade, nome, medida e preço são preservados no item; mudanças posteriores no cadastro não reescrevem a comanda. O item pode ser removido enquanto a comanda estiver aberta. Serviço e produto podem coexistir, ou a comanda pode conter apenas produtos. O desconto fixo é aplicado sobre o subtotal dos dois tipos; pagamento, estorno, caixa e resumo financeiro usam o total da comanda.

O estoque é verificado e baixado na primeira confirmação de pagamento, dentro da mesma transação do recebimento. Saldo insuficiente ou produto inativo recusam o pagamento inteiro; nenhum recebimento, venda ou baixa parcial é mantido. Reenvio idêntico não duplica a baixa. Comanda cancelada antes do pagamento não baixou estoque. Após o pagamento, estornar ou cancelar a venda não devolve o produto automaticamente; a devolução física deve ser conferida e registrada no estoque com motivo. O histórico do produto e o relatório de estoque identificam vendas separadamente de consumo, perda e baixa manual.

Comissões dos profissionais continuam restritas a serviços. Quando há desconto e produtos na mesma comanda, o valor líquido é rateado pelos valores dos serviços e produtos em centavos; apenas as bases dos serviços geram comissão. Pagamentos e estornos proporcionais preservam o percentual histórico.

## Acesso e API

Preço de venda e quantidade por unidade: `salePrice` (string decimal ou null) e `saleQuantity` (string decimal na unidade-base) em `POST/PATCH /api/products`. Apenas o custo de compra continua sob `produtos.visualizar_custo`.

- `GET /api/orders/options/products`: catálogo ativo com preço para quem pode editar comandas e visualizar produtos; saldo retornado somente com `estoque.visualizar`.
- `POST /api/orders/:id/products`: `{productId, units, version, reason?, requestKey}`; unidades inteiras de 1 a 10.000.
- `POST /api/orders/:id/products/:itemId/remove`: `{version, reason?, requestKey}` antes da finalização.

Escritas exigem `comandas.editar` e respeitam o escopo da comanda. Adição exige também `produtos.visualizar`; a baixa no checkout ocorre sob as permissões existentes de recebimento/fechamento. IDs de outro salão são recusados. A migration é `202609160002_product_sales` e deve ser aplicada ao Neon antes de publicar o código. A migration não preenche preços nem toca nos saldos existentes.
