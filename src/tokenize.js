const LETTER = /\p{L}/u;
const WHITESPACE = /\s/u;
const TERMINATOR = /[.!?…\u2026]/u;
const CLOSER = /["'»”’)\]}]/u;

const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'mt',
  'vs',
  'etc',
  'e.g',
  'i.e',
  'fig',
  'al',
  'no',
  'vol',
  'pp',
  'dept',
  'inc',
  'ltd',
  'co',
  'corp',
  'u.s',
  'u.k',
  'a.m',
  'p.m',
  'ph.d',
  'b.a',
  'm.a',
]);

export function tokenize(raw) {
  const paragraphs = splitParagraphs(raw);
  const sentences = splitSentences(raw);
  const words = splitWords(raw);
  return { raw, paragraphs, sentences, words, wordCount: words.length };
}

function splitParagraphs(text) {
  const spans = [];
  const chunks = text.split(/\n\s*\n/u);
  let cursor = 0;
  for (const chunk of chunks) {
    const start = text.indexOf(chunk, cursor);
    if (start === -1) continue;
    const span = trimSpan(text, start, start + chunk.length);
    if (span.text.length > 0) spans.push(span);
    cursor = start + chunk.length;
  }
  return spans;
}

function splitSentences(text) {
  const spans = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (!TERMINATOR.test(text[i])) continue;

    let j = i;
    while (j + 1 < text.length && TERMINATOR.test(text[j + 1])) j++;

    let k = j + 1;
    while (k < text.length && CLOSER.test(text[k])) k++;

    const atEnd = k >= text.length;
    const followedBySpace = !atEnd && WHITESPACE.test(text[k]);
    if (!atEnd && !followedBySpace) continue;

    if (text[i] === '.' && isAbbreviationBefore(text, i)) continue;
    if (text[i] === '.' && isDecimalPoint(text, i, k)) continue;

    const span = trimSpan(text, start, k);
    if (span.text.length > 0) spans.push(span);
    start = k;
    while (start < text.length && WHITESPACE.test(text[start])) start++;
    i = k - 1;
  }
  const tail = trimSpan(text, start, text.length);
  if (tail.text.length > 0) spans.push(tail);
  return spans;
}

function splitWords(text) {
  const spans = [];
  const pattern = new RegExp("[\\p{L}\\p{N}]+(?:['\\u2019-][\\p{L}\\p{N}]+)*", 'gu');
  let match = pattern.exec(text);
  while (match !== null) {
    spans.push({ text: match[0], start: match.index, end: match.index + match[0].length });
    match = pattern.exec(text);
  }
  return spans;
}

function isAbbreviationBefore(text, index) {
  let start = index;
  while (start > 0 && (LETTER.test(text[start - 1]) || text[start - 1] === '.')) start--;
  return ABBREVIATIONS.has(text.slice(start, index).toLowerCase());
}

function isDecimalPoint(text, dotIndex, afterCloser) {
  const before = dotIndex > 0 ? text[dotIndex - 1] : '';
  const after = afterCloser < text.length ? text[afterCloser] : '';
  return /\d/u.test(before) && /\d/u.test(after);
}

function trimSpan(text, start, end) {
  let s = start;
  let e = end;
  while (s < e && WHITESPACE.test(text[s])) s++;
  while (e > s && WHITESPACE.test(text[e - 1])) e--;
  return { text: text.slice(s, e), start: s, end: e };
}
