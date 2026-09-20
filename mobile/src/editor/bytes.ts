import type { EditorBytes } from "./protocol";

/**
 * Base64 for the `EditorBytes` payloads the editor protocol carries. Written
 * out rather than taken from `atob`/`btoa` or `Buffer`: the host runs on
 * Hermes, the tests run on Node, and the two must agree byte for byte.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const VALUES = new Map<string, number>([...ALPHABET].map((character, index) => [character, index]));

export function encodeBase64(bytes: Uint8Array): string {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const triple = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    encoded += ALPHABET[(triple >> 18) & 63];
    encoded += ALPHABET[(triple >> 12) & 63];
    encoded += second === undefined ? "=" : ALPHABET[(triple >> 6) & 63];
    encoded += third === undefined ? "=" : ALPHABET[triple & 63];
  }
  return encoded;
}

export function decodeBase64(text: string): Uint8Array {
  const body = text.replace(/=+$/, "");
  const bytes = new Uint8Array(Math.floor((body.length * 6) / 8));
  let accumulator = 0;
  let bits = 0;
  let written = 0;
  for (const character of body) {
    const value = VALUES.get(character);
    if (value === undefined) {
      throw new Error(`base64 payload has an illegal character: ${JSON.stringify(character)}`);
    }
    accumulator = (accumulator << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[written] = (accumulator >> bits) & 255;
      written += 1;
    }
  }
  return bytes;
}

export function isEditorBytes(value: unknown): value is EditorBytes {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as EditorBytes).$bytes === "string"
  );
}

export function editorBytes(buffer: ArrayBuffer): EditorBytes {
  return { $bytes: encodeBase64(new Uint8Array(buffer)) };
}
