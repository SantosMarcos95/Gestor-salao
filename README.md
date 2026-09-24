# Ateliê — Gestão de salão

React + TypeScript, API NestJS e PostgreSQL. Nome visual provisório: **Ateliê**.

Manual para a equipe do salão: [versão editável](docs/manual-do-usuario.md) e [versão para abrir no navegador e imprimir](docs/manual-do-usuario.html).

## Entrega atual

- Fundação com banco real, migrations e seed idempotente de permissões.
- Login com Argon2id, sessão de 8 horas em cookie HttpOnly e revogação no logout.
- Roles/permissões consultadas a cada requisição, com negação individual prioritária.
- Cadastro, busca paginada, edição concorrente e arquivamento de clientes.
- Auditoria com usuário, data, motivo e valores anteriores/posteriores.
- Interface responsiva de login, visão geral, clientes, usuários/perfis e auditoria.
- Cadastro de usuários, ativação/desativação por salão, perfis personalizados e permissões individuais.
- Proteção do último administrador, controle de edição concorrente e revogação de sessões ao desativar.
- Cadastro de profissionais com vínculo opcional ao usuário, especialidade e contatos.
- Catálogo de serviços com preço decimal, duração, busca e ativação/desativação.
- Jornadas semanais com intervalos, bloqueios por período e serviços realizados por profissional, na tela Disponibilidade.
- Agenda diária/semanal, múltiplos serviços, remarcação, status, histórico e cancelamento; valida jornada/bloqueios e acesso à agenda própria.
- Pagamentos manuais divididos, troco separado, estornos e cancelamento de venda; painel financeiro por período com vendas separadas dos recebimentos.
- Comandas com vários profissionais, importação da agenda, valores editáveis e desconto; atendimentos com início/fim e consumo confirmado com baixa única.
- Produtos com unidade-base, embalagens compatíveis e estoque mínimo; fornecedores e entradas, perdas, baixas e ajustes com histórico e proteção contra duplicação.
- Troca de senha pelo titular e redefinição administrativa com senha provisória e troca obrigatória.

O sistema completo ainda está em desenvolvimento. O financeiro inicial está disponível. Relatórios avançados, despesas, caixa diário e integrações bancárias **ainda não estão implementados**. Os menus **Comandas** e **Atendimentos** já permitem acompanhar serviços, valores e consumo de produtos. Após finalizar os serviços, use **Receber pagamento** na comanda. Os registros são manuais, sem cobrança ou devolução automática no banco. Produtos e estoque e Fornecedores estão disponíveis no menu; o saldo é compartilhado pelo salão, sem lotes ou separação por unidade. A agenda está disponível no menu **Agenda**. Na lista de clientes, o botão **Comandas** abre o histórico autorizado daquele cliente. O histórico de alterações da reserva já aparece nos detalhes da agenda. Não há recuperação de senha por e-mail nesta entrega. A tela de acessos permite criar contas com senha inicial e editar seus vínculos e permissões; alteração de nome ainda não faz parte desta etapa. O administrador pode alterar o e-mail de login pelo botão **Alterar e-mail** em **Usuários e permissões**, confirmando sua senha e o motivo; a troca encerra as sessões da conta alterada. A troca de senha fica em **Minha conta**; a redefinição de outro usuário fica em **Usuários e permissões**. Veja [o plano](docs/roadmap.md).

## Requisitos

- Node.js 20.19+ (ambiente validado: 20.20.2).
- npm.
- PostgreSQL 17. É possível executá-lo localmente pelo projeto, sem Docker.

## Iniciar no ambiente atual

Diretório: `/home/marcos_paulo/salao-gestao`.

As dependências, o arquivo `.env` local e as migrations já foram preparados. O banco do salão não contém clientes ou usuários fictícios.

Em um terminal, mantenha o banco em execução:

```bash
cd /home/marcos_paulo/salao-gestao
npm run db:local
```

Se ele já estiver em execução na porta 5432, não inicie outra instância. O comando executa PostgreSQL real, restrito a `127.0.0.1`, e mantém os dados em `.local/postgres`. Ctrl+C encerra o processo sem apagar os dados. Essa opção é somente para desenvolvimento.

Em outro terminal, crie seu primeiro acesso:

```bash
cd /home/marcos_paulo/salao-gestao
npm run admin:create
```

O assistente solicita nome do salão, seu nome, e-mail e senha. A senha não aparece na tela e precisa ter entre 8 e 128 caracteres. A inicialização é permitida uma única vez; não recria nem apaga um salão existente.

Depois, inicie a aplicação:

```bash
npm run dev
```

Abra **http://localhost:5173**. A API fica em `http://127.0.0.1:3001/api`. Utilize exatamente a origem configurada em `WEB_ORIGIN`; trocar `localhost` por `127.0.0.1` no navegador requer ajustar essa variável.

## Instalação do zero

```bash
npm ci
cp .env.example .env
npm run db:generate
```

Inicie o banco em um terminal com `npm run db:local`. Em outro:

```bash
npm run db:migrate
npm run db:seed
npm run admin:create
npm run dev
```

Alternativa com Docker instalado: `docker compose up -d db`, em vez de `npm run db:local`. Não execute as duas opções na mesma porta.

O seed adiciona permissões faltantes, sem criar clientes demonstrativos, senhas padrão ou sobrescrever personalizações. As três roles são criadas na inicialização do salão. Futuras novas permissões não são concedidas automaticamente a roles existentes.

## Verificação

```bash
npm run build
npm run typecheck
npm test
npm run test:integration
```

Os testes de integração criam um PostgreSQL separado na porta 15439 e uma API na 3009 e outra na 3010 para os testes de senhas. Usam somente dados descartáveis de teste e não alteram o banco do salão. Não rode duas cópias simultaneamente.

Testes com navegador:

```bash
npx playwright install chromium
npm run test:e2e
```

O navegador usa a porta 5179. Capturas ficam em `.local/screenshots`, fora do versionamento. As dependências do Chromium precisam estar disponíveis no sistema.

## Organização no VS Code

Veja o [guia do código](docs/guia-do-codigo.md) para localizar cada tela e usar as tarefas do editor. A formatação é padronizada com Prettier: `npm run format` formata e `npm run format:check` verifica.

## Estrutura

```text
apps/api/src/          API e módulos
apps/web/src/          Interface React
database/             Modelo, migrations e seeds
scripts/              Banco local e criação do administrador
tests/                Regras e integração real
docs/                 Arquitetura, API e plano
```

## Produção

Esta entrega é uma base de desenvolvimento, não um deploy pronto para operação comercial. Antes da publicação: PostgreSQL gerenciado ou serviço administrado, HTTPS, proxy reverso, backups com restauração testada, conta de banco da API sem privilégios de proprietário/DDL, política de retenção, recuperação de acesso e revisão operacional. Não reutilize a senha local de desenvolvimento em produção.

O backend escuta em loopback; publique por proxy reverso. `WEB_ORIGIN` deve usar HTTPS com `NODE_ENV=production`, ativando o cookie Secure. A API bloqueia requisições de alteração vindas de outras origens. Não habilite confiança irrestrita em cabeçalhos de proxy; ajuste-a à infraestrutura antes de usar o limitador por IP atrás de proxy. O limitador atual é em memória para uma instância.

Migrations devem ser aplicadas com uma credencial de administração separada da credencial de runtime. O trigger de auditoria bloqueia UPDATE, DELETE e TRUNCATE, mas um proprietário do banco pode remover triggers; ele não substitui a separação de credenciais.

`deepmerge-ts` usa override para a versão 8 devido ao alerta de esgotamento de pilha em versões anteriores. Geração Prisma, migrations, seed e testes foram validados com esse override. O lockfile fixa as versões efetivamente usadas.
