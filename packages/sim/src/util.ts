/** Narrow an indexed lookup that content validation guarantees exists. */
export function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`wetwire sim: missing ${what}`);
  return value;
}
