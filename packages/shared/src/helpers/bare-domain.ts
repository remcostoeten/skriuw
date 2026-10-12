const GENERIC_TLDS =
  "com net org edu gov mil biz pro aero asia coop jobs mobi museum travel app dev xyz site online tech blog cloud design studio digital website news wiki club shop codes software agency academy company engineering";

const COUNTRY_TLDS =
  "ad ae af ag ai al ao aq ar au aw ax az ba bb bd be bf bg bh bi bj bm bn bo br bs bt bv bw bz ca cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm dz ec ee eg er es et eu fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu ie il im io iq ir it je jm jo jp ke kg kh ki km kn kp kr kw ky kz lb lc li lk lr ls lt lu lv ly ma mc me mg mh mn mp mq mr ms mt mu mv mw mx mz na nc ne nf ng ni nl np nr nu nz om pa pe pf pg ph pk pn pr pt pw qa re ro ru rw sa sb sc sd se sg si sj sk sl sm sn sr st su sv sx sy sz tc td tg th tj tk tl tm tn tr tt tv tw tz ua ug uk us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw";

const KNOWN_TLDS = new Set(`${GENERIC_TLDS} ${COUNTRY_TLDS}`.split(" "));

// A run of host characters, read from a fixed index.
const HOST_RUN = /[a-z0-9.-]+/iy;
// Any run of host characters, used to find where a candidate starts.
const HOST_RUN_START = /[a-z0-9][a-z0-9.-]*/gi;
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
// Characters that make the text a path, email, tag, mention, or part of a longer word.
const NOT_BEFORE = /[\p{L}\p{N}_.@/\\:#$~[-]/u;
const NOT_AFTER = /[\p{L}\p{N}_@]/u;
const PORT = /:\d{1,5}/y;
const PATH = /[/?#][^\s<>`]*/y;
const TRAILING_PUNCTUATION = ".,;:!?'\"*_~";

/**
 * @name trimUrlPunctuation
 * @description Drops sentence punctuation that follows a URL in prose, such
 * as a closing period or comma, and a closing parenthesis only when the URL
 * holds no matching opening one.
 *
 * @example
 * trimUrlPunctuation("skriuw.com/docs)."); // "skriuw.com/docs"
 * trimUrlPunctuation("en.wikipedia.org/wiki/Foo_(bar)"); // unchanged
 */
export function trimUrlPunctuation(url: string): string {
  let end = url.length;
  while (end > 0) {
    const last = url.charAt(end - 1);
    if (TRAILING_PUNCTUATION.includes(last)) {
      end -= 1;
      continue;
    }
    if (last !== ")") break;
    const kept = url.slice(0, end);
    if (kept.split("(").length >= kept.split(")").length) break;
    end -= 1;
  }
  return url.slice(0, end);
}

function readHost(text: string, index: number): string | null {
  HOST_RUN.lastIndex = index;
  const run = HOST_RUN.exec(text)?.[0];
  if (!run) return null;
  const host = run.replace(/\.+$/, "");
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((label) => HOST_LABEL.test(label))) return null;
  if (!KNOWN_TLDS.has(labels.at(-1) ?? "")) return null;
  if (host.length === run.length && NOT_AFTER.test(text.charAt(index + run.length))) return null;
  return host;
}

/**
 * @name matchBareDomain
 * @description Reads a bare domain such as `skriuw.com/docs` starting at
 * `index` and returns the index just past it, or -1 when the text there is not
 * one. The top-level domain must be a known, lowercase one (country codes
 * that double as file extensions or identifiers, such as `md`, `rs`, `sh`,
 * `is`, or `to`, are not known), the preceding
 * character must not make it part of a path, email, tag, or longer word, and
 * trailing sentence punctuation is left out.
 *
 * @example
 * matchBareDomain("see skriuw.com/docs.", 4); // 19
 * matchBareDomain("package.json"); // -1
 */
export function matchBareDomain(text: string, index = 0): number {
  if (index > 0 && NOT_BEFORE.test(text.charAt(index - 1))) return -1;
  const host = readHost(text, index);
  if (!host) return -1;
  let end = index + host.length;
  PORT.lastIndex = end;
  const port = PORT.exec(text)?.[0];
  if (port) end += port.length;
  PATH.lastIndex = end;
  const path = PATH.exec(text)?.[0];
  if (path) end += trimUrlPunctuation(path).length;
  return end;
}

/**
 * @name findBareDomain
 * @description Finds the first bare domain in `text` at or after `from`, as
 * the `[start, end)` range that {@link matchBareDomain} accepts.
 *
 * @example
 * findBareDomain("docs at skriuw.com/docs, ok"); // { start: 8, end: 23 }
 */
export function findBareDomain(text: string, from = 0): { start: number; end: number } | null {
  HOST_RUN_START.lastIndex = from;
  for (let run = HOST_RUN_START.exec(text); run; run = HOST_RUN_START.exec(text)) {
    const end = matchBareDomain(text, run.index);
    if (end > run.index) return { start: run.index, end };
  }
  return null;
}

/**
 * @name isBareDomain
 * @description Whether the whole of `text` is one bare domain, so it can be
 * linked to `https://` plus the text and written back as plain text.
 *
 * @example
 * isBareDomain("storybook.regeljelease.dev"); // true
 * isBareDomain("Node.js"); // false
 */
export function isBareDomain(text: string): boolean {
  return text.length > 0 && matchBareDomain(text) === text.length;
}
