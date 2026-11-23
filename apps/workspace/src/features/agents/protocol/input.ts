import { isJsonObject, type JsonObject, type JsonValue } from "./json";

/** A refusal the agent can act on; it is returned as a tool error, not a protocol error. */
export class ToolRefusal extends Error {
  override name = "ToolRefusal";
}

/**
 * @name refuse
 * @description Stops a tool with a message the calling agent reads as the
 * tool's error result.
 *
 * @example
 * if (!node) refuse(`No folder or note has id ${id}.`);
 */
export function refuse(message: string): never {
  throw new ToolRefusal(message);
}

/**
 * Typed reads over a tool's JSON arguments. Every read checks the shape the
 * tool's input schema promises, because agents do not always honour it.
 */
export class ToolInput {
  readonly #values: JsonObject;
  readonly #path: string;

  constructor(values: JsonObject, path = "") {
    this.#values = values;
    this.#path = path;
  }

  has(key: string): boolean {
    return this.#values[key] !== undefined;
  }

  raw(key: string): JsonValue | undefined {
    return this.#values[key];
  }

  string(key: string): string {
    const value = this.#values[key];
    if (typeof value !== "string") refuse(`${this.#name(key)} must be a string.`);
    return value;
  }

  text(key: string): string {
    const value = this.string(key).trim();
    if (value.length === 0) refuse(`${this.#name(key)} must not be empty.`);
    return value;
  }

  optionalString(key: string): string | undefined {
    return this.has(key) ? this.string(key) : undefined;
  }

  optionalText(key: string): string | undefined {
    return this.has(key) ? this.text(key) : undefined;
  }

  /** Absent is undefined, null clears, a string sets. */
  nullableString(key: string): string | null | undefined {
    if (!this.has(key)) return undefined;
    return this.#values[key] === null ? null : this.string(key);
  }

  optionalBoolean(key: string): boolean | undefined {
    if (!this.has(key)) return undefined;
    const value = this.#values[key];
    if (typeof value !== "boolean") refuse(`${this.#name(key)} must be true or false.`);
    return value;
  }

  optionalInteger(key: string, minimum: number, maximum: number): number | undefined {
    if (!this.has(key)) return undefined;
    const value = this.#values[key];
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < minimum ||
      value > maximum
    ) {
      refuse(`${this.#name(key)} must be a whole number from ${minimum} to ${maximum}.`);
    }
    return value;
  }

  choice<const Choice extends string>(key: string, choices: readonly Choice[]): Choice {
    const value = this.string(key);
    const match = choices.find((choice) => choice === value);
    if (match === undefined) refuse(`${this.#name(key)} must be one of: ${choices.join(", ")}.`);
    return match;
  }

  optionalChoice<const Choice extends string>(
    key: string,
    choices: readonly Choice[],
  ): Choice | undefined {
    return this.has(key) ? this.choice(key, choices) : undefined;
  }

  stringList(key: string): string[] {
    const value = this.#values[key];
    if (!Array.isArray(value)) refuse(`${this.#name(key)} must be a list of strings.`);
    return value.map((entry, index) => {
      if (typeof entry !== "string") refuse(`${this.#name(key)}[${index}] must be a string.`);
      return entry;
    });
  }

  optionalStringList(key: string): string[] | undefined {
    return this.has(key) ? this.stringList(key) : undefined;
  }

  idList(key: string): string[] {
    const ids = this.stringList(key);
    if (ids.length === 0) refuse(`${this.#name(key)} must name at least one id.`);
    return [...new Set(ids)];
  }

  objectList(key: string): ToolInput[] {
    const value = this.#values[key];
    if (!Array.isArray(value)) refuse(`${this.#name(key)} must be a list of objects.`);
    return value.map((entry, index) => {
      if (!isJsonObject(entry)) refuse(`${this.#name(key)}[${index}] must be an object.`);
      return new ToolInput(entry, `${this.#name(key)}[${index}].`);
    });
  }

  optionalObjectList(key: string): ToolInput[] | undefined {
    return this.has(key) ? this.objectList(key) : undefined;
  }

  optionalEntries(key: string): [string, JsonValue][] | undefined {
    if (!this.has(key)) return undefined;
    const value = this.#values[key];
    if (!isJsonObject(value)) refuse(`${this.#name(key)} must be an object.`);
    return Object.entries(value);
  }

  #name(key: string): string {
    return `${this.#path}${key}`;
  }
}
