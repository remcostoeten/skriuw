const HEADLINE_LIMIT = 44;

function trimHeadline(phrase: string) {
  if (phrase.length <= HEADLINE_LIMIT) {
    return phrase;
  }

  const cut = phrase.slice(0, HEADLINE_LIMIT);
  const boundary = cut.lastIndexOf(" ");

  return `${(boundary > 24 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

function firstBoldPhrase(body: string) {
  return body.match(/\*\*([^*\n]{4,})\*\*/)?.[1].trim();
}

function countChanges(body: string) {
  const bullets = body.match(/^[-*] +\S.*$/gm) ?? [];
  const fixes = bullets.filter((bullet) => /^[-*] +fix\b/.test(bullet)).length;
  const changes = bullets.filter((bullet) => !/^[-*] +chore\b/.test(bullet)).length;

  if (changes === 0) {
    return undefined;
  }

  if (fixes === changes) {
    return fixes === 1 ? "1 fix" : `${fixes} fixes`;
  }

  return changes === 1 ? "1 change" : `${changes} changes`;
}

/**
 * Picks a one-line headline from release notes: the first bold phrase when
 * the notes lead with a Highlights section, otherwise a count of the listed
 * changes so commit wording never reaches the homepage.
 */
export function releaseHeadline(body: string) {
  const phrase = firstBoldPhrase(body);

  return phrase ? trimHeadline(phrase) : countChanges(body);
}
