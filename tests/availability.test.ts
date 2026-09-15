import { describe, expect, it } from 'vitest';
import { localInstant, workInput } from '../apps/api/src/availability/validation';
describe('horários do salão', () => {
  it('resolve o horário local independentemente do fuso do servidor', () => {
    expect(localInstant('2026-10-05T09:00', 'America/Sao_Paulo').toISOString()).toBe(
      '2026-10-05T12:00:00.000Z',
    );
    expect(localInstant('2026-10-05T00:00', 'Asia/Kathmandu').toISOString()).toBe(
      '2026-10-04T18:15:00.000Z',
    );
  });
  it('rejeita datas impossíveis, horários inexistentes e ambíguos na mudança de fuso', () => {
    for (const [local, zone] of [
      ['2026-02-30T09:00', 'America/Sao_Paulo'],
      ['2026-03-08T02:30', 'America/New_York'],
      ['2026-11-01T01:30', 'America/New_York'],
    ])
      expect(() => localInstant(local, zone)).toThrow();
  });
  it('aceita períodos adjacentes, folga e o fim à meia-noite', () => {
    expect(
      workInput.safeParse({ version: 1, reason: 'Jornada semanal', periods: [] }).success,
    ).toBe(true);
    expect(
      workInput.safeParse({
        version: 1,
        reason: 'Jornada semanal',
        periods: [
          { weekday: 0, startMinute: 0, endMinute: 720 },
          { weekday: 0, startMinute: 720, endMinute: 1440 },
        ],
      }).success,
    ).toBe(true);
  });
});
