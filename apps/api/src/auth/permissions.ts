export function resolvePermissions(
  granted: string[],
  overrides: { code: string; effect: 'ALLOW' | 'DENY' }[],
) {
  const effective = new Set(granted);
  for (const rule of overrides) if (rule.effect === 'ALLOW') effective.add(rule.code);
  for (const rule of overrides) if (rule.effect === 'DENY') effective.delete(rule.code);
  return [...effective].sort();
}
