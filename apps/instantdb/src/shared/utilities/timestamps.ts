export type Timestamps = {
  createdAt: number;
  updatedAt: number;
};

/**
 * Adds timestamps to data object
 * @param data - The data to add timestamps to
 * @param isCreate - If true, adds createdAt. Always adds updatedAt.
 * @returns Data object with timestamps
 */
export function withTimestamps<T extends Record<string, any>>(
  data: T,
  isCreate = false
): T & Partial<Timestamps> {
  const now = Date.now();
  return {
    ...data,
    ...(isCreate && { createdAt: now }),
    updatedAt: now,
  };
}

/**
 * Creates a new timestamp for createdAt
 * @returns Current timestamp
 */
export function createTimestamp(): number {
  return Date.now();
}

