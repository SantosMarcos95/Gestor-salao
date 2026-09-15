import { createApp } from '../apps/api/src/bootstrap';

let handler: ((req: any, res: any) => void) | undefined;

export default async function api(req: any, res: any) {
  if (!handler) {
    const app = await createApp();
    await app.init();
    handler = app.getHttpAdapter().getInstance();
  }
  return handler(req, res);
}
