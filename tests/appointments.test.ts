import { describe, expect, it } from 'vitest';
import { withinWork, transitions } from '../apps/api/src/appointments/rules';
import { dateInput } from '../apps/api/src/appointments/validation';
describe('jornada aplicada à agenda', () => {
  const periods = [
    { weekday: 1, startMinute: 540, endMinute: 720 },
    { weekday: 1, startMinute: 780, endMinute: 1080 },
  ];
  const fits = (start: string, end: string) =>
    withinWork(new Date(start), new Date(end), 'America/Sao_Paulo', periods);
  it('aceita limite exato e rejeita almoço, folga e minuto fora da jornada', () => {
    expect(fits('2026-10-05T12:00Z', '2026-10-05T15:00Z')).toBe(true);
    expect(fits('2026-10-05T14:30Z', '2026-10-05T16:30Z')).toBe(false);
    expect(fits('2026-10-05T11:59Z', '2026-10-05T12:30Z')).toBe(false);
    expect(fits('2026-10-06T12:00Z', '2026-10-06T13:00Z')).toBe(false);
  });
  it('atravessa meia-noite somente quando os dois dias permitem', () => {
    const p = [
      { weekday: 1, startMinute: 1380, endMinute: 1440 },
      { weekday: 2, startMinute: 0, endMinute: 60 },
    ];
    expect(
      withinWork(
        new Date('2026-10-06T02:30Z'),
        new Date('2026-10-06T03:30Z'),
        'America/Sao_Paulo',
        p,
      ),
    ).toBe(true);
    expect(
      withinWork(
        new Date('2026-10-06T02:30Z'),
        new Date('2026-10-06T03:30Z'),
        'America/Sao_Paulo',
        p.slice(0, 1),
      ),
    ).toBe(false);
  });
  it('mantém estados finais sem reabertura e rejeita datas de consulta impossíveis', () => {
    for (const s of ['COMPLETED', 'CANCELLED', 'NO_SHOW'] as const)
      expect(transitions[s]).toEqual([]);
    expect(dateInput.safeParse('2026-02-30').success).toBe(false);
    expect(dateInput.safeParse('2028-02-29').success).toBe(true);
  });
});
