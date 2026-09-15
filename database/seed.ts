import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { permissionCodes } from './permissions';
const prisma = new PrismaClient();
async function main() {
  await prisma.$transaction(
    permissionCodes.map((code) =>
      prisma.permission.upsert({
        where: { code },
        update: {},
        create: { code, description: code.replaceAll('.', ' · ').replaceAll('_', ' ') },
      }),
    ),
  );
  console.log('Catálogo de permissões atualizado. Nenhum usuário ou cliente fictício foi criado.');
}
main()
  .catch(() => {
    console.error('Falha no seed. Confira DATABASE_URL e as migrations.');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
