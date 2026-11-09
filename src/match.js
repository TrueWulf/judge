function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const EDGE = "['\u2019\\p{L}\\p{N}]";

const regexCache = new Map();

export function phraseToRegex(phrase) {
  const cached = regexCache.get(phrase);
  if (cached !== undefined) return cached;
  const body = phrase.split("'").map(escapeRegex).join("['\u2019]");
  const pattern = new RegExp(`(?<!${EDGE})${body}(?!${EDGE})`, 'giu');
  regexCache.set(phrase, pattern);
  return pattern;
}

export function findPhraseMatches(text, phrases) {
  const matches = [];
  for (const phrase of phrases) {
    const pattern = phraseToRegex(phrase);
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match !== null) {
      matches.push({ phrase, start: match.index, end: match.index + match[0].length });
      if (match[0].length === 0) pattern.lastIndex += 1;
      match = pattern.exec(text);
    }
  }
  matches.sort((a, b) => a.start - b.start);
  return matches;
}

const openerCache = new Map();

export function openerToRegex(phrase) {
  const cached = openerCache.get(phrase);
  if (cached !== undefined) return cached;
  const body = phrase.split("'").map(escapeRegex).join("['\u2019]");
  const pattern = new RegExp(`^${body}(?!${EDGE})`, 'iu');
  openerCache.set(phrase, pattern);
  return pattern;
}
