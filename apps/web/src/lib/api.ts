export type Profile = {
  membershipId: string;
  mustChangePassword: boolean;
  name: string;
  salonName: string;
  roles: string[];
  permissions: string[];
};
export type Client = {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  birthDate: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
};
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
export type Audit = {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: string;
  actor: { user: { name: string } };
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch {
    throw new ApiError('Não foi possível conectar. Confira sua conexão e tente novamente.', 0);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/me')
      window.dispatchEvent(new Event('session-expired'));
    const message =
      response.status === 429
        ? 'Muitas tentativas. Aguarde um minuto antes de tentar novamente.'
        : typeof body.message === 'string'
          ? body.message
          : 'Não foi possível concluir. Tente novamente.';
    throw new ApiError(message, response.status);
  }
  return body as T;
}
