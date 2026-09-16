export type UserOption = { id: string; user: { name: string; email: string } };
export type Professional = {
  commissionRate: string;
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  specialty: string | null;
  notes: string | null;
  membershipId: string | null;
  membership:
    | (UserOption & { active: boolean; user: UserOption['user'] & { status: string } })
    | null;
  active: boolean;
  version: number;
};
