const FNV_PRIME = 16777619;
const OFFSET_BASIS = 2166136261;

export function stableHash(input: string): number {
  let hash = OFFSET_BASIS;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash * FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

export function bucketValue(identity: string, salt: string, percentage: number): { bucket: number; enabled: boolean } {
  const normalized = `${salt}:${identity}`;
  const hash = stableHash(normalized);
  const bucket = hash % 10000;
  const threshold = Math.floor((percentage / 100) * 10000);
  return { bucket, enabled: bucket < threshold };
}
