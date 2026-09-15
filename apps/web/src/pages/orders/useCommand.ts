import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
export function useCommand() {
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const previous = useRef({ body: '', key: crypto.randomUUID() });
  async function send<T>(path: string, body: object): Promise<T | null> {
    if (busy) return null;
    setBusy(true);
    setError('');
    const serialized = JSON.stringify({ path, body });
    if (previous.current.body !== serialized)
      previous.current = { body: serialized, key: crypto.randomUUID() };
    try {
      const result = await api<T>(path, {
        method: 'POST',
        body: JSON.stringify({ ...body, requestKey: previous.current.key }),
      });
      await Promise.all(
        [
          'dashboard',
          'reports-production',
          'reports-occupancy',
          'reports-stock',
          'reports-receipts',
          'finance',
          'finance-summary',
          'payments',
          'orders',
          'order',
          'visits',
          'visit',
          'products',
          'stock-history',
          'audit',
          'appointments',
          'appointment',
          'agenda-options',
        ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
      );
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { send, busy, error };
}
