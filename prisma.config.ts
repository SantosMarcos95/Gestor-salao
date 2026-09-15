import 'dotenv/config';
import { defineConfig } from 'prisma/config';
export default defineConfig({
  schema: 'database/schema.prisma',
  migrations: { path: 'database/migrations', seed: 'tsx database/seed.ts' },
});
