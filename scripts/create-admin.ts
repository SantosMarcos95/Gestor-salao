import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import { initialRoles } from '../database/permissions';
import { z } from 'zod';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
const prisma = new PrismaClient();
const fields = {
  ADMIN_EMAIL: z
    .string()
    .trim()
    .email('Informe um e-mail válido, como nome@email.com.')
    .transform((v) => v.toLowerCase()),
  ADMIN_PASSWORD: z
    .string()
    .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
    .max(128, 'A senha pode ter no máximo 128 caracteres.'),
  ADMIN_NAME: z
    .string()
    .trim()
    .min(2, 'Seu nome precisa ter pelo menos 2 caracteres.')
    .max(150, 'Seu nome pode ter no máximo 150 caracteres.'),
  SALON_NAME: z
    .string()
    .trim()
    .min(2, 'O nome do salão precisa ter pelo menos 2 caracteres.')
    .max(150, 'O nome do salão pode ter no máximo 150 caracteres.'),
};
async function main() {
  if (process.stdin.isTTY && !process.env.ADMIN_PASSWORD) {
    let muted = false;
    const output = new Writable({
      write(chunk, _encoding, callback) {
        if (!muted) process.stdout.write(chunk);
        callback();
      },
    });
    const rl = createInterface({ input: process.stdin, output, terminal: true });
    rl.on('SIGINT', () => {
      rl.close();
      process.stdout.write('\n');
      process.exit(130);
    });
    async function ask(field: keyof typeof fields, prompt: string) {
      while (true) {
        const pending = rl.question(prompt);
        muted = field === 'ADMIN_PASSWORD';
        let value: string;
        try {
          value = await pending;
        } finally {
          muted = false;
          if (field === 'ADMIN_PASSWORD') process.stdout.write('\n');
        }
        const result = fields[field].safeParse(value);
        if (result.success) {
          process.env[field] = result.data;
          return;
        }
        for (const issue of result.error.issues) console.error(issue.message);
      }
    }
    try {
      await ask('SALON_NAME', 'Nome do salão: ');
      await ask('ADMIN_NAME', 'Seu nome: ');
      await ask('ADMIN_EMAIL', 'Seu e-mail: ');
      await ask('ADMIN_PASSWORD', 'Sua senha (8–128 caracteres; não será exibida): ');
    } finally {
      muted = false;
      rl.close();
    }
  }
  const input = z.object(fields).parse(process.env);
  const passwordHash = await hash(input.ADMIN_PASSWORD);
  await prisma.$transaction(async (tx) => {
    // Serializes first-install bootstrap, including concurrent executions.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(8214561)`;
    if (await tx.salon.count()) throw new Error('ALREADY_INITIALIZED');
    const permissions = await tx.permission.findMany();
    if (permissions.length === 0) throw new Error('MISSING_SEED');
    const salon = await tx.salon.create({
      data: { name: input.SALON_NAME, locations: { create: { name: 'Unidade principal' } } },
    });
    const user = await tx.user.create({
      data: { name: input.ADMIN_NAME, email: input.ADMIN_EMAIL, passwordHash },
    });
    const member = await tx.salonUser.create({ data: { salonId: salon.id, userId: user.id } });
    for (const [code, preset] of Object.entries(initialRoles)) {
      const role = await tx.role.create({
        data: {
          salonId: salon.id,
          code,
          name: preset.name,
          protected: code === 'ROLE_ADMIN',
          permissions: {
            create: permissions
              .filter((p) => preset.permissions.includes(p.code))
              .map((p) => ({ permissionId: p.id })),
          },
        },
      });
      if (code === 'ROLE_ADMIN')
        await tx.userRole.create({
          data: { salonId: salon.id, membershipId: member.id, roleId: role.id },
        });
    }
    await tx.auditLog.create({
      data: {
        salonId: salon.id,
        actorId: member.id,
        action: 'SISTEMA_INICIALIZADO',
        entity: 'salons',
        entityId: salon.id,
        requestId: randomUUID(),
        after: { name: salon.name },
      },
    });
  });
  console.log('Salão e administrador criados. Use o e-mail e a senha informados para entrar.');
}
main()
  .catch((error) => {
    if (error instanceof z.ZodError) {
      for (const issue of error.issues)
        console.error(
          `${issue.path.join('.')}: ${issue.message === 'Required' ? 'Campo obrigatório não informado.' : issue.message}`,
        );
    } else
      console.error(
        error.message === 'ALREADY_INITIALIZED'
          ? 'O sistema já foi inicializado. Nenhum dado foi alterado.'
          : 'Não foi possível inicializar. Confira banco, migrations e seed.',
      );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
