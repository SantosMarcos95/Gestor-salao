import 'reflect-metadata';
import { createApp } from './bootstrap';

async function main() {
  const app = await createApp();
  await app.listen(Number(process.env.PORT ?? 3001), '127.0.0.1');
}
main().catch(() => {
  console.error(
    'Não foi possível iniciar a API. Verifique as variáveis de ambiente e a conexão com o PostgreSQL.',
  );
  process.exitCode = 1;
});
