const SVG_MAX_BYTES = 2 * 1024 * 1024;

const SVG_ACTIVE_CONTENT = [
  "<script",
  "<foreignobject",
  "<iframe",
  "<embed",
  "<object",
  "<!doctype",
  "<!entity",
  "<?xml-stylesheet",
  "javascript:",
  "@import",
  'href="http',
  "href='http",
];

// An attribute such as `onload=` or `onclick =` preceded by whitespace.
const EVENT_HANDLER_ATTRIBUTE = /\son[a-z]+\s*=/;

function skipProlog(source: string): string | null {
  let rest = source.trimStart();
  for (;;) {
    if (rest.startsWith("<?xml")) {
      const end = rest.indexOf("?>");
      if (end === -1) return null;
      rest = rest.slice(end + 2).trimStart();
    } else if (rest.startsWith("<!--")) {
      const end = rest.indexOf("-->");
      if (end === -1) return null;
      rest = rest.slice(end + 3).trimStart();
    } else {
      return rest;
    }
  }
}

/**
 * @name isInertSvg
 * @description Whether bytes are an SVG the media store may keep: UTF-8 with an
 * `<svg` root and no scripts, event handlers, embedded documents, entity
 * declarations, or external references. Must stay in sync with `is_inert_svg`
 * in `crates/skriuw-images/src/lib.rs`.
 *
 * @example
 * if (isInertSvg(bytes)) return "image/svg+xml";
 */
export function isInertSvg(bytes: Uint8Array): boolean {
  if (bytes.length > SVG_MAX_BYTES) return false;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  const lowered = text.toLowerCase();
  const root = skipProlog(lowered.replace(/^\uFEFF/, ""));
  if (root === null || !/^<svg[\s>/]/.test(root)) return false;
  return (
    !SVG_ACTIVE_CONTENT.some((pattern) => lowered.includes(pattern)) &&
    !EVENT_HANDLER_ATTRIBUTE.test(lowered)
  );
}
