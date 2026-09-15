# Onde editar o sistema

O frontend usa React e TypeScript e fica em `apps/web/src`. A página de login e o painel interno do salão pertencem à mesma aplicação. Ainda não há site público do salão ou página comercial separada.

## Frontend

```text
apps/web/src/
├── main.tsx                     Inicializa React, consultas e navegação
├── App.tsx                      Verifica a sessão e abre login ou painel
├── components/
│   ├── Brand.tsx                Marca Ateliê
│   └── Dialog.tsx               Estrutura dos diálogos de acesso
├── layouts/
│   └── SalonLayout.tsx          Menu, cabeçalho, rodapé e rotas internas
├── lib/
│   └── api.ts                   Comunicação com a API e tipos compartilhados
├── pages/
│   ├── professionals/           Lista e formulário de profissionais
│   ├── services/                Lista, formulário e preço dos serviços
│   ├── account/AccountPage.tsx   Troca de senha do titular
│   ├── login/LoginPage.tsx      Tela de entrada
│   ├── dashboard/DashboardPage.tsx  Visão geral
│   ├── clients/
│   │   ├── ClientsPage.tsx      Lista e busca de clientes
│   │   ├── ClientDialog.tsx     Formulário de cadastro/edição
│   │   └── ArchiveDialog.tsx    Arquivamento com motivo
│   ├── access/
│   │   ├── AccessPage.tsx       Lista de usuários e perfis
│   │   ├── UserDialog.tsx       Cadastro e edição de acesso
│   │   ├── ResetPasswordDialog.tsx  Redefinição administrativa
│   │   ├── RoleDialog.tsx       Criação e edição de perfis
│   │   └── types.ts            Tipos desta área
│   └── audit/AuditPage.tsx      Histórico de atividades
└── styles/global.css           Cores, fontes, componentes e regras responsivas
```

Para mudar textos do login, abra `LoginPage.tsx`. Para alterar o menu, abra `SalonLayout.tsx`. Para ajustar cores e espaçamentos, abra `global.css`.

## Outras pastas

| Pasta          | Conteúdo                                                   |
| -------------- | ---------------------------------------------------------- |
| `apps/api/src` | Backend NestJS, autenticação, regras de acesso e cadastros |
| `database`     | Modelo Prisma, migrations e permissões iniciais            |
| `scripts`      | Inicialização do banco e criação do primeiro administrador |
| `tests`        | Testes unitários, integração e navegador                   |
| `docs`         | Arquitetura, contrato da API, plano e registro de retomada |
| `.vscode`      | Configurações e tarefas do editor para este projeto        |

## Trabalhar no VS Code

- Use **Ctrl+P** e digite o nome do arquivo, como `LoginPage` ou `global.css`.
- Em **Extensões**, instale as recomendações do projeto para habilitar a formatação ao salvar: Prettier e EditorConfig.
- Use **Terminal → Executar tarefa** para iniciar banco/sistema, compilar ou verificar o código. Inicie banco e sistema apenas se ainda não estiverem rodando.
- As pastas geradas `node_modules`, `dist` e `.local` ficam ocultas no explorador. Continuam no disco e podem ser exibidas alterando `files.exclude` em `.vscode/settings.json`.

## Formatação pelo terminal

```bash
npm run format
npm run format:check
```

O primeiro comando formata os arquivos; o segundo apenas verifica. A configuração é compartilhada pelo projeto. Arquivos locais, dependências, builds, migrations, schema Prisma e lockfile não são formatados por esses comandos.

## Disponibilidade

- `apps/web/src/pages/availability/AvailabilityPage.tsx`: lista da equipe e abertura das configurações.
- `WorkDialog.tsx`, `BlocksDialog.tsx`, `ServicesDialog.tsx`, nessa mesma pasta: jornada, bloqueios e serviços realizados.
- `apps/api/src/availability/availability.ts`: endpoints, permissões, transações e auditoria.
- `apps/api/src/availability/validation.ts`: regras de períodos e resolução de datas locais no fuso do salão.
- `tests/availability.test.ts` e `tests/availability.mjs`: regras, integração e navegador.

## Agenda

- `apps/web/src/pages/appointments/AppointmentsPage.tsx`: filtros, navegação e estado da agenda.
- `AgendaGrid.tsx`: grade diária por profissional e semanal por dia.
- `AppointmentDialog.tsx`, `AppointmentDetail.tsx`, `OptionPicker.tsx`, `types.ts`: formulário, detalhes/histórico, busca paginada e contratos.
- `apps/api/src/appointments/appointments.ts`: consultas e escritas transacionais.
- `apps/api/src/appointments/rules.ts` e `validation.ts`: escopo próprio, jornada, estados e validação.
- `tests/appointments.test.ts` e `tests/appointments.mjs`: regras, integração e navegador em banco isolado.

### Produtos e estoque

- `apps/web/src/pages/inventory/`: listas de produtos/fornecedores, formulários, movimentação e histórico.
- `apps/api/src/inventory/`: validações decimais, cadastro e transações do estoque.
- `tests/inventory.test.ts` e `tests/inventory.mjs`: regras, banco isolado e navegador.

### Comandas e atendimentos

- `apps/api/src/orders/`: comandas, atendimentos, consumo, autorização e cálculo dos totais.
- `apps/web/src/pages/orders/`: listas, detalhe, formulários e ações; rotas `/comandas` e `/atendimentos`.
- `tests/orders.test.ts` e `tests/orders.mjs`: cálculo decimal, concorrência, escopo, integração com estoque/agenda e navegador.

### Pagamentos e financeiro

- `apps/api/src/finance/`: cálculo do pagamento/troco, checkout, estornos, cancelamento de venda, resumo e listagens financeiras.
- `apps/web/src/pages/finance/`: seção de pagamentos da comanda e painel `/financeiro`.
- `tests/finance.test.ts` e `tests/finance.mjs`: regras, precisão, rollback, concorrência, datas, permissões e navegador.
- `AGENTS.md`: orientação permanente de salvar resumos de continuidade durante o trabalho.
