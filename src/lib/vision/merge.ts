// Driewegvergelijking houdt wijzigingen in onafhankelijke velden of records in stand.
export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function record(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
export function mergeEdits(base: unknown, local: unknown, remote: unknown): unknown {
  if (same(local, base)) return remote;
  if (same(remote, base) || same(local, remote)) return local;
  if (record(base) && record(local) && record(remote)) {
    return Object.fromEntries(
      [...new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])]
        .map((k) => [k, mergeEdits(base[k], local[k], remote[k])])
        .filter(([, v]) => v !== undefined),
    );
  }
  if (
    Array.isArray(base) &&
    Array.isArray(local) &&
    Array.isArray(remote) &&
    [...base, ...local, ...remote].every((v) => record(v) && typeof v.id === 'string')
  ) {
    const index = (xs: { id: string }[]) => new Map(xs.map((x) => [x.id, x]));
    const [b, l, r] = [base, local, remote].map(index);
    return [...new Set([...r.keys(), ...l.keys()])]
      .map((k) => mergeEdits(b.get(k), l.get(k), r.get(k)))
      .filter((v) => v !== undefined);
  }
  throw Error('Hetzelfde veld is ook op een ander apparaat gewijzigd.');
}
