export type Override = { code: string; effect: 'ALLOW' | 'DENY' };
export type Member = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  status: string;
  roleIds: string[];
  roles: string[];
  overrides: Override[];
  permissions: string[];
  revision: string;
};
export type Role = {
  id: string;
  name: string;
  protected: boolean;
  permissions: string[];
  revision: string;
};
export type Permission = { code: string; description: string };
