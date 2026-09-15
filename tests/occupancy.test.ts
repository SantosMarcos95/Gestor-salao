import { describe, expect, it } from 'vitest';
import { occupancy, workIntervals } from '../apps/api/src/reports/occupancy-rules';
describe('Ocupação de intervalos', () => {
  const minutes = (a: number, b: number): [number, number] => [a * 60000, b * 60000];
  it('une sobreposições e desconta bloqueios apenas dentro da jornada', () => {
    expect(
      occupancy(
        [minutes(0, 180), minutes(240, 480)],
        [minutes(60, 120), minutes(90, 150), minutes(500, 600)],
        [minutes(0, 90), minutes(30, 180), minutes(200, 270)],
      ),
    ).toEqual({
      workMinutes: 420,
      blockedMinutes: 90,
      availableMinutes: 330,
      occupiedMinutes: 120,
      freeMinutes: 210,
      outsideMinutes: 130,
      rate: 36.4,
    });
  });
  it('não divide por zero nem conta intervalos adjacentes duas vezes', () => {
    expect(occupancy([], [], [minutes(0, 60)]).rate).toBeNull();
    expect(occupancy([minutes(0, 60)], [minutes(0, 60)], [minutes(0, 60)]).availableMinutes).toBe(
      0,
    );
    expect(occupancy([minutes(0, 60)], [], [minutes(0, 30), minutes(30, 60)]).occupiedMinutes).toBe(
      60,
    );
  });
  it('expande jornada no fuso local, incluindo fim à meia-noite', () => {
    const work = workIntervals('2025-07-01', '2025-07-01', 'America/Sao_Paulo', [
      { weekday: 2, startMinute: 1380, endMinute: 1440 },
    ]);
    expect(work).toEqual([[Date.parse('2025-07-02T02:00Z'), Date.parse('2025-07-02T03:00Z')]]);
  });
});
