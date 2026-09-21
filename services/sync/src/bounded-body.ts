export type BoundedBodyResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; code: "invalid_request" | "request_too_large" };

/**
 * Reads a request body without ever buffering more than `maximumBytes`. A
 * declared Content-Length above the bound is rejected before any byte is
 * read; an undeclared or understated length is cut off as soon as the stream
 * crosses it.
 */
export async function readBoundedBytes(
  request: Request,
  maximumBytes: number,
): Promise<BoundedBodyResult> {
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      return { ok: false, code: "invalid_request" };
    }
    if (Number(declaredLength) > maximumBytes) {
      return { ok: false, code: "request_too_large" };
    }
  }
  if (request.body === null) {
    return { ok: false, code: "invalid_request" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    byteLength += chunk.value.byteLength;
    if (byteLength > maximumBytes) {
      await reader.cancel();
      return { ok: false, code: "request_too_large" };
    }
    chunks.push(chunk.value);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes: body };
}
