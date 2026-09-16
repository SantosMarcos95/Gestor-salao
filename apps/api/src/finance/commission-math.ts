// Exact cent allocation. Stable input order breaks remainder ties.
export function allocate(total: bigint, weights: bigint[]): bigint[] {
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (total < 0n || weights.some((v) => v < 0n) || (sum === 0n && total !== 0n))
    throw new Error('Invalid allocation');
  if (!sum) return weights.map(() => 0n);
  const result = weights.map((w) => (total * w) / sum);
  let rest = total - result.reduce((a, b) => a + b, 0n);
  const ranks = weights
    .map((w, i) => ({ i, rem: (total * w) % sum }))
    .sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  for (const r of ranks) {
    if (!rest) break;
    result[r.i]++;
    rest--;
  }
  return result;
}
export const commissionAmount = (base: bigint, rate: bigint) => (base * rate + 5000n) / 10000n;
export const signedCents = (s: string): bigint => {
  if (s.startsWith('-')) return -signedCents(s.slice(1));
  const [w, p = ''] = s.split('.');
  return BigInt(w) * 100n + BigInt(p.padEnd(2, '0'));
};
