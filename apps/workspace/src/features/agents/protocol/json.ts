export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

export type JsonObject = { [key: string]: JsonValue };

export type FrozenJson =
  | string
  | number
  | boolean
  | null
  | readonly FrozenJson[]
  | { readonly [key: string]: FrozenJson };

/**
 * @name isJsonObject
 * @description Narrows a parsed JSON value to a plain object, excluding arrays
 * and null.
 *
 * @example
 * if (isJsonObject(message)) readMethod(message);
 */
export function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return (
    value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)
  );
}

/**
 * @name parseJson
 * @description Parses JSON text received over the agent bridge, returning null
 * when the text is not JSON.
 *
 * @example
 * const message = parseJson('{"jsonrpc":"2.0"}');
 */
export function parseJson(text: string): JsonValue | null {
  try {
    const parsed: JsonValue = JSON.parse(text);
    return parsed;
  } catch {
    return null;
  }
}
