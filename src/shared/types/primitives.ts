export type ID = string & { readonly __brand: "ID" }
export type Timestamp = Date

export function createId(): ID {
  return crypto.randomUUID() as ID
}

export function toId(value: string): ID {
  return value as ID
}

export function createTimestamp(): Timestamp {
  return new Date() as Timestamp
}
