export type Item = {
  id: string;
  serviceId: string;
  name: string;
  price: string;
  durationMinutes: number;
};
export type Visit = {
  id: string;
  orderId: string;
  professionalName: string;
  status: string;
  version: number;
  appointmentId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  professional: { membershipId: string | null };
  order: { id: string; clientName: string; status: string };
  items: Item[];
  total: string;
  consumptions: {
    id: string;
    productName: string;
    quantity: string;
    baseUnit: string;
    unitCost?: string | null;
    createdAt: string;
  }[];
};
export type Order = {
  id: string;
  clientId: string;
  clientName: string;
  status: string;
  version: number;
  subtotal: string;
  discount: string;
  total: string;
  notes: string | null;
  createdAt: string;
  visits: Visit[];
  productItems: {
    id: string;
    productName: string;
    baseUnit: string;
    saleQuantity: string;
    units: number;
    unitPrice: string;
    total: string;
    movementId: string | null;
  }[];
  history?: {
    id: string;
    action: string;
    reason: string;
    createdAt: string;
    actor: { user: { name: string } };
  }[];
};
export const orderStates: Record<string, string> = {
  OPEN: 'Aberta',
  READY: 'Serviços finalizados',
  CLOSED: 'Quitada',
  DUE: 'Saldo pendente',
  CANCELLED: 'Cancelada',
};
export const visitStates: Record<string, string> = {
  WAITING: 'Aguardando',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
};
export const auditNames: Record<string, string> = {
  COMANDA_ABERTA: 'Comanda aberta',
  VENDA_REGISTRADA: 'Venda registrada',
  PAGAMENTO_REGISTRADO: 'Pagamento registrado',
  COMANDA_QUITADA: 'Comanda quitada',
  PAGAMENTO_ESTORNADO: 'Recebimento estornado',
  VENDA_CANCELADA: 'Venda cancelada',
  ATENDIMENTO_ADICIONADO: 'Atendimento adicionado',
  AGENDAMENTO_IMPORTADO: 'Serviços da agenda adicionados',
  DESCONTO_ALTERADO: 'Desconto alterado',
  VALORES_ALTERADOS: 'Valores alterados',
  COMANDA_PRONTA: 'Serviços finalizados',
  COMANDA_CANCELADA: 'Comanda cancelada',
  ATENDIMENTO_INICIADO: 'Atendimento iniciado',
  ATENDIMENTO_CONCLUIDO: 'Atendimento concluído',
  ATENDIMENTO_CANCELADO: 'Atendimento cancelado',
  CONSUMO_CONFIRMADO: 'Consumo confirmado',
  PRODUTO_ADICIONADO: 'Produto adicionado',
  PRODUTO_REMOVIDO: 'Produto removido',
};
export type Option = { id: string; name: string };
export const decimal = (v: FormDataEntryValue | null) =>
  String(v ?? '')
    .trim()
    .replace(',', '.');
