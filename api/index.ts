// The API is compiled with TypeScript's legacy decorator settings before Vercel
// bundles this function. Importing the source here makes Vercel's own TS
// transform reinterpret Nest decorators as standard decorators.
import { createApp } from '../apps/api/dist/bootstrap.js';

let handler: ((req: any, res: any) => void) | undefined;

export default async function api(req: any, res: any) {
  if (!handler) {
    const app = await createApp();
    await app.init();
    handler = app.getHttpAdapter().getInstance();
  }
  return handler(req, res);
}
