export const EDITOR_WORKING_SET_LIMIT = 32;

/** A least-recently-used cache that never evicts caller-protected entries. */
export class EditorWorkingSet<Value> {
  private readonly entries = new Map<string, Value>();

  constructor(private readonly maximum: number) {
    if (!Number.isInteger(maximum) || maximum < 1) {
      throw new Error("editor working-set maximum must be a positive integer");
    }
  }

  get(key: string): Value | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: Value): void {
    this.entries.delete(key);
    this.entries.set(key, value);
  }

  prune(protectedKeys: ReadonlySet<string>): string[] {
    const evicted: string[] = [];
    while (this.entries.size > this.maximum) {
      let candidate: string | undefined;
      for (const key of this.entries.keys()) {
        if (!protectedKeys.has(key)) {
          candidate = key;
          break;
        }
      }
      if (candidate === undefined) break;
      this.entries.delete(candidate);
      evicted.push(candidate);
    }
    return evicted;
  }

  get size(): number {
    return this.entries.size;
  }
}
