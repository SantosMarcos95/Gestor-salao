import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Request, Response } from 'express';
export type Identity = {
  userId: string;
  membershipId: string;
  salonId: string;
  sessionId: string;
  permissions: string[];
  name: string;
  salonName: string;
  roles: string[];
  mustChangePassword: boolean;
};
export type AuthRequest = Request & { identity: Identity; requestId: string };
export function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({
      message: 'Revise os campos informados.',
      fields: result.error.flatten().fieldErrors,
    });
  return result.data;
}
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const res = context.getResponse<Response>();
    const req = context.getRequest<AuthRequest>();
    if (error instanceof Prisma.PrismaClientInitializationError)
      error = new ServiceUnavailableException('Serviço temporariamente indisponível.');
    let status = error instanceof HttpException ? error.getStatus() : 500;
    let body: string | object =
      error instanceof HttpException
        ? error.getResponse()
        : { message: 'Não foi possível concluir a operação. Tente novamente.' };
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2003', 'P2034'].includes(error.code)
    ) {
      status = 409;
      body = {
        message: 'A operação conflita com outro registro. Atualize a página e tente novamente.',
      };
    }
    if (status >= 500)
      console.error(
        JSON.stringify({
          requestId: req.requestId,
          status,
          type: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
    res.status(status).json({
      ...(typeof body === 'string' ? { message: body } : body),
      statusCode: status,
      requestId: req.requestId,
    });
  }
}
