import { instant, type Period } from '../appointments/rules';
export type Interval = [number, number];
export function union(intervals: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const [start, end] of intervals.filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0])) {
    const last = result.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else result.push([start, end]);
  }
  return result;
}
export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const result: Interval[] = [];
  let i = 0,
    j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i][0], b[j][0]),
      end = Math.min(a[i][1], b[j][1]);
    if (end > start) result.push([start, end]);
    if (a[i][1] < b[j][1]) i++;
    else j++;
  }
  return result;
}
const duration = (ranges: Interval[]) => ranges.reduce((n, [a, b]) => n + (b - a) / 60000, 0);
export function workIntervals(
  from: string,
  to: string,
  timezone: string,
  periods: Period[],
): Interval[] {
  const result: Interval[] = [];
  const local = (date: string, minute: number) => {
    if (minute === 1440)
      return instant(
        new Date(Date.parse(date + 'T12:00Z') + 86400000).toISOString().slice(0, 10) + 'T00:00',
        timezone,
      ).getTime();
    return instant(
      `${date}T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
      timezone,
    ).getTime();
  };
  for (let day = Date.parse(from + 'T12:00Z'); day <= Date.parse(to + 'T12:00Z'); day += 86400000) {
    const date = new Date(day).toISOString().slice(0, 10),
      weekday = new Date(day).getUTCDay();
    for (const p of periods.filter((p) => p.weekday === weekday))
      result.push([local(date, p.startMinute), local(date, p.endMinute)]);
  }
  return union(result);
}
export function occupancy(work: Interval[], blocks: Interval[], booked: Interval[]) {
  const w = union(work),
    b = union(blocks),
    a = union(booked);
  const blocked = intersect(w, b),
    inside = intersect(w, a);
  const workMinutes = duration(w),
    blockedMinutes = duration(blocked);
  const availableMinutes = workMinutes - blockedMinutes;
  const occupiedMinutes = duration(inside) - duration(intersect(inside, b));
  return {
    workMinutes,
    blockedMinutes,
    availableMinutes,
    occupiedMinutes,
    freeMinutes: availableMinutes - occupiedMinutes,
    outsideMinutes: duration(a) - occupiedMinutes,
    rate: availableMinutes ? Math.round((occupiedMinutes / availableMinutes) * 1000) / 10 : null,
  };
}
