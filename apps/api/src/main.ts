import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { ErrorFilter } from './common';
import { AppModule } from './app.module';
import type { Request, Response, NextFunction } from 'express';

async function main() {
  if (!process.env.DATABASE_URL || !process.env.WEB_ORIGIN)
    throw new Error('Configure DATABASE_URL e WEB_ORIGIN.');
  const origin = new URL(process.env.WEB_ORIGIN).origin;
  if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://'))
    throw new Error('Produção exige WEB_ORIGIN com HTTPS.');
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.use((req: Request & { requestId?: string }, res: Response, next: NextFunction) => {
    req.requestId = randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    res.setHeader('Cache-Control', 'no-store');
    // Same-origin cookie authentication: reject ALL untrusted state-changing requests, including login.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== origin)
      return res
        .status(403)
        .json({ message: 'Origem da solicitação não autorizada.', requestId: req.requestId });
    next();
  });
  app.enableCors({ origin, credentials: true });
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3001), '127.0.0.1');
}
main().catch(() => {
  console.error(
    'Não foi possível iniciar a API. Verifique as variáveis de ambiente e a conexão com o PostgreSQL.',
  );
  process.exitCode = 1;
});
