import {
  ABSTRACT_NOUNS,
  ACADEMIC_REGISTER,
  AI_CLICHES,
  AI_OPENERS,
  CONCRETE_NOUNS,
  CORPORATE_SPEAK,
  DATE_WORDS,
  DISCOURSE_MARKERS,
  FIRST_PERSON,
  FORMAL_CONNECTIVES,
  HEDGING,
  HUMAN_MARKERS,
  INTERNET_REGISTER,
  IRREGULAR_PARTICIPLES,
  MARKETING_HYPE,
  PROMPT_ECHO,
  SELF_DOUBT,
  STOPWORDS,
  TECHNICAL_WORDS,
  TOP_1000_WORDS,
  WRAP_UP,
} from './lexicons.js';
import { findPhraseMatches, openerToRegex } from './match.js';

const EM_DASH = '\u2014';
const WORDS_PER_K = 1000;
const MATTR_WINDOW = 50;
const MATTR_STEP = 10;
const MTLD_THRESHOLD = 0.72;
const MIN_WORDS = 30;
const LONG_WORD = 8;

const BE_FORMS = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being']);
const LIST_MARKER = /^\s*(?:[-*•–—]|\d+[.)]|[a-z][.)])\s+/imu;

const CONTRACTION =
  /\b[\p{L}\p{N}]+'(?:re|ve|ll|d|m)\b|\b[\p{L}\p{N}]+n't\b|\b(?:it|that|there|here|what|who|where|when|how|he|she|they|we|you|let|someone|everyone|nobody)'s\b/giu;

const ITEM = String.raw`[\p{L}\p{N}][\p{L}\p{N}'-]*`;
const TRIAD = new RegExp(
  String.raw`\b${ITEM}(?: +${ITEM}){0,3}, +${ITEM}(?: +${ITEM}){0,3}, +(?:and|or) +${ITEM}(?: +${ITEM}){0,3}\b`,
  'gu',
);

const ABSTRACT_SUFFIX = /(?:tion|sion|ment|ness|ity|ence|ance|ism|ship|hood|tude)$/iu;

function findSentenceOpeners(tokens) {
  const matches = [];
  for (const sentence of tokens.sentences) {
    const gerund = /^\p{L}+ing\b/iu.exec(sentence.text);
    if (gerund !== null) {
      matches.push({
        phrase: gerund[0],
        start: sentence.start,
        end: sentence.start + gerund[0].length,
      });
      continue;
    }
    for (const phrase of AI_OPENERS) {
      const match = openerToRegex(phrase).exec(sentence.text);
      if (match === null) continue;
      matches.push({ phrase, start: sentence.start, end: sentence.start + match[0].length });
      break;
    }
  }
  return matches;
}

function toEvidence(matches, reason, raw) {
  return matches.map((match) => ({
    text: raw.slice(match.start, match.end),
    start: match.start,
    end: match.end,
    reason,
  }));
}

function spanEvidence(span, reason, limit = 80) {
  return [
    {
      text: span.text.slice(0, limit),
      start: span.start,
      end: Math.min(span.end, span.start + limit),
      reason,
    },
  ];
}

function coefficientOfVariation(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return null;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function perThousand(count, wordCount) {
  if (wordCount === 0) return 0;
  return (count / wordCount) * WORDS_PER_K;
}

function unmeasured() {
  return { raw: 0, evidence: [], measured: false };
}

function wordsBySentence(tokens) {
  const buckets = tokens.sentences.map(() => []);
  let sentenceIndex = 0;
  for (const word of tokens.words) {
    while (
      sentenceIndex < tokens.sentences.length &&
      word.start >= tokens.sentences[sentenceIndex].end
    ) {
      sentenceIndex += 1;
    }
    if (sentenceIndex < tokens.sentences.length) buckets[sentenceIndex].push(word);
  }
  return buckets;
}

function countWordsIn(tokens, span) {
  let count = 0;
  for (const word of tokens.words) {
    if (word.start < span.start) continue;
    if (word.end > span.end) break;
    count += 1;
  }
  return count;
}

function isContentWord(word) {
  const lower = word.toLowerCase();
  return lower.length >= 4 && !STOPWORDS.has(lower);
}

function isCapitalised(word) {
  const first = word[0] ?? '';
  return first !== '' && first === first.toUpperCase() && first !== first.toLowerCase();
}

function isPassiveSentence(words) {
  for (let i = 0; i < words.length - 1; i++) {
    if (!BE_FORMS.has(words[i].text.toLowerCase())) continue;
    const limit = Math.min(i + 3, words.length);
    for (let j = i + 1; j < limit; j++) {
      const word = words[j].text.toLowerCase();
      if (word.endsWith('ed') || IRREGULAR_PARTICIPLES.has(word)) return true;
    }
  }
  return false;
}

function mostTypicalSpan(tokens, spans) {
  if (spans.length === 0) return null;
  const lengths = spans.map((span) => countWordsIn(tokens, span));
  const mean = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  lengths.forEach((length, index) => {
    const distance = Math.abs(length - mean);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return spans[bestIndex];
}

function lowerTokens(tokens) {
  return tokens.words.map((word) => word.text.toLowerCase());
}

function frequencyMap(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function ngramCounts(values, n) {
  const counts = new Map();
  for (let i = 0; i + n <= values.length; i++) {
    const key = values.slice(i, i + n).join('\u0001');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function letterCount(word) {
  let count = 0;
  for (const char of word) if (/\p{L}/u.test(char)) count += 1;
  return count;
}

function normalizedEntropy(counts, total) {
  if (total === 0) return 0;
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / total;
    entropy -= p * Math.log(p);
  }
  const maxEntropy = Math.log(counts.size);
  return maxEntropy === 0 ? 0 : entropy / maxEntropy;
}

export function emDash(tokens) {
  const evidence = [];
  for (let i = 0; i < tokens.raw.length; i++) {
    if (tokens.raw[i] !== EM_DASH) continue;
    evidence.push({
      text: EM_DASH,
      start: i,
      end: i + 1,
      reason: 'em dash (U+2014), the punctuation mark machines overuse',
    });
  }
  return {
    raw: perThousand(evidence.length, tokens.wordCount),
    evidence,
    measured: tokens.wordCount >= MIN_WORDS,
  };
}

export function aiCliches(tokens) {
  const matches = findPhraseMatches(tokens.raw, AI_CLICHES);
  return {
    raw: perThousand(matches.length, tokens.wordCount),
    evidence: toEvidence(matches, 'ai cliche', tokens.raw),
    measured: tokens.wordCount >= MIN_WORDS,
  };
}

export function marketingHype(tokens) {
  const hype = findPhraseMatches(tokens.raw, MARKETING_HYPE);
  const corporate = findPhraseMatches(tokens.raw, CORPORATE_SPEAK);
  const matches = [...hype, ...corporate].sort((a, b) => a.start - b.start);
  return {
    raw: perThousand(matches.length, tokens.wordCount),
    evidence: toEvidence(matches, 'inflated professional register', tokens.raw),
    measured: tokens.wordCount >= MIN_WORDS,
  };
}

export function burstiness(tokens) {
  const representative = mostTypicalSpan(tokens, tokens.sentences);
  const lengths = tokens.sentences.map((sentence) => countWordsIn(tokens, sentence));
  const cv = coefficientOfVariation(lengths);
  if (cv === null || representative === null || tokens.sentences.length < 5) return unmeasured();
  return {
    raw: cv,
    evidence: spanEvidence(representative, 'sentence length sits near the average, an even machine rhythm'),
    measured: true,
  };
}

export function paragraphUniformity(tokens) {
  const representative = mostTypicalSpan(tokens, tokens.paragraphs);
  const lengths = tokens.paragraphs.map((paragraph) => countWordsIn(tokens, paragraph));
  const cv = coefficientOfVariation(lengths);
  if (cv === null || representative === null || tokens.paragraphs.length < 3) return unmeasured();
  return {
    raw: cv,
    evidence: spanEvidence(representative, 'paragraph length sits near the average, an even structure'),
    measured: true,
  };
}

export function hedging(tokens) {
  const matches = findPhraseMatches(tokens.raw, HEDGING);
  return {
    raw: tokens.wordCount === 0 ? 0 : (matches.length / tokens.wordCount) * 100,
    evidence: toEvidence(matches, 'hedge word', tokens.raw),
    measured: tokens.wordCount >= MIN_WORDS,
  };
}

export function passiveVoice(tokens) {
  const sentenceWords = wordsBySentence(tokens);
  const evidence = [];
  sentenceWords.forEach((words, index) => {
    if (!isPassiveSentence(words)) return;
    const span = tokens.sentences[index];
    evidence.push({
      text: span.text,
      start: span.start,
      end: span.end,
      reason: 'passive construction (be + past participle)',
    });
  });
  const total = tokens.sentences.length;
  return {
    raw: total === 0 ? 0 : (evidence.length / total) * 100,
    evidence,
    measured: total >= 3 && tokens.wordCount >= MIN_WORDS,
  };
}

export function mattr(tokens) {
  const words = lowerTokens(tokens);
  if (words.length < MATTR_WINDOW) return unmeasured();
  const windows = [];
  const lastStart = words.length - MATTR_WINDOW;
  for (let start = 0; start <= lastStart; start += MATTR_STEP) {
    const slice = words.slice(start, start + MATTR_WINDOW);
    windows.push({
      ratio: new Set(slice).size / slice.length,
      start,
    });
  }
  const mean = windows.reduce((sum, window) => sum + window.ratio, 0) / windows.length;
  const sparsest = windows.reduce((a, b) => (b.ratio < a.ratio ? b : a));
  const startOffset = tokens.words[sparsest.start].start;
  const endOffset = tokens.words[sparsest.start + MATTR_WINDOW - 1].end;
  return {
    raw: mean,
    evidence: [
      {
        text: tokens.raw.slice(startOffset, endOffset),
        start: startOffset,
        end: endOffset,
        reason: 'least varied 50-word window (lowest moving-average type-token ratio)',
      },
    ],
    measured: true,
  };
}

function mtldPass(words) {
  const counts = new Map();
  let types = 0;
  let factors = 0;
  let started = 0;
  for (let i = 0; i < words.length; i++) {
    const count = (counts.get(words[i]) ?? 0) + 1;
    counts.set(words[i], count);
    if (count === 1) types += 1;
    const span = i - started + 1;
    const ttr = types / span;
    if (span >= 10 && ttr <= MTLD_THRESHOLD) {
      factors += 1;
      started = i + 1;
      counts.clear();
      types = 0;
    }
  }
  const leftover = words.length - started;
  if (leftover > 0) {
    const leftoverTtr = types / leftover;
    factors += (1 - leftoverTtr) / (1 - MTLD_THRESHOLD);
  }
  return factors;
}

export function mtld(tokens) {
  const words = lowerTokens(tokens);
  if (words.length < 100) return unmeasured();
  const forward = mtldPass(words);
  const backward = mtldPass([...words].reverse());
  const factors = (forward + backward) / 2;
  const value = factors <= 0 ? words.length : words.length / factors;
  return {
    raw: value,
    evidence: spanEvidence(
      mostTypicalSpan(tokens, tokens.paragraphs) ?? tokens.sentences[0],
      'textual lexical diversity (MTLD): words carried before variety runs out',
    ),
    measured: true,
  };
}

export function guiraud(tokens) {
  const words = lowerTokens(tokens);
  if (words.length < MIN_WORDS) return unmeasured();
  const types = new Set(words).size;
  return {
    raw: types / Math.sqrt(words.length),
    evidence: [],
    measured: true,
  };
}

export function yuleK(tokens) {
  const words = lowerTokens(tokens);
  if (words.length < MIN_WORDS) return unmeasured();
  const counts = frequencyMap(words);
  let sum = 0;
  for (const count of counts.values()) sum += count * count;
  return {
    raw: (10000 * (sum - words.length)) / (words.length * words.length),
    evidence: [],
    measured: true,
  };
}

export function honore(tokens) {
  const words = lowerTokens(tokens);
  if (words.length < 100) return unmeasured();
  const counts = frequencyMap(words);
  let hapax = 0;
  for (const count of counts.values()) if (count === 1) hapax += 1;
  const types = counts.size;
  if (types === 0 || hapax === types) return unmeasured();
  return {
    raw: (100 * Math.log(words.length)) / (1 - hapax / types),
    evidence: [],
    measured: true,
  };
}

export function hapaxShare(tokens) {
  const words = lowerTokens(tokens);
  if (words.length < MIN_WORDS) return unmeasured();
  const counts = frequencyMap(words);
  let hapax = 0;
  for (const count of counts.values()) if (count === 1) hapax += 1;
  return {
    raw: hapax / words.length,
    evidence: [],
    measured: true,
  };
}

export function wordLength(tokens) {
  const words = lowerTokens(tokens);
  if (words.length < MIN_WORDS) return unmeasured();
  let letters = 0;
  let longWords = 0;
  for (const word of words) {
    const length = letterCount(word);
    letters += length;
    if (length >= LONG_WORD) longWords += 1;
  }
  return {
    raw: letters / words.length + (longWords / words.length) * 10,
    evidence: [],
    measured: true,
  };
}

export function frequencyProfile(tokens) {
  const words = lowerTokens(tokens).filter((word) => !/^\d+$/u.test(word));
  if (words.length < MIN_WORDS) return unmeasured();
  let common = 0;
  for (const word of words) if (TOP_1000_WORDS.has(word)) common += 1;
  return {
    raw: common / words.length,
    evidence: [],
    measured: true,
  };
}

export function sentenceStarters(tokens) {
  const sentenceWords = wordsBySentence(tokens);
  const starters = sentenceWords
    .filter((words) => words.length > 0)
    .map((words) => words[0].text.toLowerCase());
  if (starters.length < 5) return unmeasured();

  const counts = frequencyMap(starters);
  const entropy = normalizedEntropy(counts, starters.length);

  const evidence = [];
  const mostRepeated = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (mostRepeated[1] > 1) {
    sentenceWords.forEach((words, index) => {
      if (words.length === 0 || words[0].text.toLowerCase() !== mostRepeated[0]) return;
      const span = tokens.sentences[index];
      evidence.push({
        text: span.text.slice(0, 60),
        start: span.start,
        end: Math.min(span.end, span.start + 60),
        reason: `repeated sentence opener "${mostRepeated[0]}" (${mostRepeated[1]}x)`,
      });
    });
  }
  return { raw: entropy, evidence, measured: true };
}

export function structure(tokens) {
  const connectives = findPhraseMatches(tokens.raw, FORMAL_CONNECTIVES);
  const wrapUps = findPhraseMatches(tokens.raw, WRAP_UP);
  const lines = tokens.raw.split('\n').filter((line) => line.trim().length > 0);
  const listLines = lines.filter((line) => LIST_MARKER.test(line)).length;

  const connectiveScore = clamp01(perThousand(connectives.length, tokens.wordCount) / 50);
  const listScore = clamp01(lines.length === 0 ? 0 : listLines / lines.length / 0.4);
  const wrapUpScore = clamp01(wrapUps.length / 2);

  return {
    raw: 0.45 * connectiveScore + 0.25 * listScore + 0.3 * wrapUpScore,
    evidence: toEvidence([...connectives, ...wrapUps], 'structural marker', tokens.raw),
    measured: tokens.sentences.length >= 2 && tokens.wordCount >= MIN_WORDS,
  };
}

export function humanVoice(tokens) {
  const matches = [
    ...findPhraseMatches(tokens.raw, HUMAN_MARKERS),
    ...findPhraseMatches(tokens.raw, SELF_DOUBT),
    ...findPhraseMatches(tokens.raw, INTERNET_REGISTER),
  ].sort((a, b) => a.start - b.start);
  return {
    raw: tokens.wordCount === 0 ? 0 : (matches.length / tokens.wordCount) * 100,
    evidence: toEvidence(matches, 'human speech marker', tokens.raw),
    measured: tokens.wordCount >= MIN_WORDS,
  };
}

export function contractions(tokens) {
  const evidence = [...tokens.raw.matchAll(CONTRACTION)].map((match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
    reason: 'contraction, an informal human habit',
  }));
  return {
    raw: tokens.wordCount === 0 ? 0 : (evidence.length / tokens.wordCount) * 100,
    evidence,
    measured: tokens.wordCount >= MIN_WORDS,
  };
}

export function aiOpeners(tokens) {
  const matches = findSentenceOpeners(tokens);
  const total = tokens.sentences.length;
  return {
    raw: total === 0 ? 0 : (matches.length / total) * 100,
    evidence: toEvidence(matches, 'machine-typical sentence opener', tokens.raw),
    measured: total >= 3 && tokens.wordCount >= MIN_WORDS,
  };
}

export function triads(tokens) {
  const matches = [...tokens.raw.matchAll(TRIAD)].map((match) => ({
    phrase: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
  return {
    raw: perThousand(matches.length, tokens.wordCount),
    evidence: toEvidence(matches, 'serial three-item list', tokens.raw),
    measured: tokens.wordCount >= MIN_WORDS,
  };
}

export function specificity(tokens) {
  const evidence = [];
  const sentenceStarts = new Set(tokens.sentences.map((sentence) => sentence.start));

  for (const word of tokens.words) {
    let reason = '';
    if (/\d/u.test(word.text)) reason = 'number or amount';
    else if (DATE_WORDS.has(word.text.toLowerCase())) reason = 'date reference';
    else if (CONCRETE_NOUNS.has(word.text.toLowerCase())) reason = 'concrete object';
    else if (TECHNICAL_WORDS.has(word.text.toLowerCase())) reason = 'technical artifact';
    else if (word.text.length > 2 && isCapitalised(word.text) && !sentenceStarts.has(word.start)) {
      reason = 'named thing';
    }
    if (reason === '') continue;
    evidence.push({ text: word.text, start: word.start, end: word.end, reason });
  }

  for (const match of tokens.raw.matchAll(/["\u201c\u201d\u2018\u2019]/gu)) {
    evidence.push({
      text: match[0],
      start: match.index,
      end: match.index + 1,
      reason: 'quoted speech',
    });
  }

  evidence.sort((a, b) => a.start - b.start);
  return {
    raw: tokens.wordCount === 0 ? 0 : (evidence.length / tokens.wordCount) * 100,
    evidence,
    measured: tokens.wordCount >= MIN_WORDS,
  };
}

export function firstPerson(tokens) {
  const evidence = [];
  for (const word of tokens.words) {
    if (!FIRST_PERSON.has(word.text.toLowerCase())) continue;
    evidence.push({
      text: word.text,
      start: word.start,
      end: word.end,
      reason: 'first-person pronoun',
    });
  }
  return {
    raw: tokens.wordCount === 0 ? 0 : (evidence.length / tokens.wordCount) * 100,
    evidence,
    measured: tokens.wordCount >= MIN_WORDS,
  };
}

export function roughness(tokens) {
  const evidence = [];

  for (const sentence of tokens.sentences) {
    const first = sentence.text[0] ?? '';
    if (first === '' || !isCapitalised(first)) {
      evidence.push({
        text: sentence.text.slice(0, 20),
        start: sentence.start,
        end: Math.min(sentence.end, sentence.start + 20),
        reason: 'sentence opens lowercase',
      });
    }
  }

  for (const match of tokens.raw.matchAll(/(\p{L})\1{2,}| {2,}|[!?]{2,}|\.{4,}|\b[A-Z]{6,}\b/gu)) {
    evidence.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
      reason: 'typing irregularity',
    });
  }

  evidence.sort((a, b) => a.start - b.start);
  return {
    raw: (evidence.length / Math.max(tokens.wordCount, 1)) * 100,
    evidence,
    measured: tokens.wordCount >= MIN_WORDS,
  };
}

export function abstraction(tokens) {
  const evidence = [];
  for (const word of tokens.words) {
    const lower = word.text.toLowerCase();
    let reason = '';
    if (ABSTRACT_NOUNS.has(lower)) reason = 'abstract noun';
    else if (ABSTRACT_SUFFIX.test(lower)) reason = 'abstract nominalisation';
    if (reason === '') continue;
    evidence.push({ text: word.text, start: word.start, end: word.end, reason });
  }
  return {
    raw: tokens.wordCount === 0 ? 0 : (evidence.length / tokens.wordCount) * 100,
    evidence,
    measured: tokens.wordCount >= MIN_WORDS,
  };
}

export function ngramRepetition(tokens) {
  const words = lowerTokens(tokens);
  if (words.length < MIN_WORDS) return unmeasured();
  const shares = [];
  let worst = null;
  for (const n of [3, 4]) {
    const counts = ngramCounts(words, n);
    let total = 0;
    let repeated = 0;
    for (const [key, count] of counts) {
      total += count;
      if (count > 1) {
        repeated += count;
        if (worst === null || count > worst.count) worst = { key, count };
      }
    }
    if (total > 0) shares.push((total - (total - repeated)) / total);
  }
  if (shares.length === 0) return unmeasured();
  const raw = (shares.reduce((a, b) => a + b, 0) / shares.length) * 100;
  const evidence = [];
  if (worst !== null) {
    const needle = worst.key.split('\u0001').join(' ');
    const index = tokens.raw.toLowerCase().indexOf(needle.split(' ')[0]);
    if (index !== -1) {
      evidence.push({
        text: tokens.raw.slice(index, index + needle.length + 20),
        start: index,
        end: Math.min(tokens.raw.length, index + needle.length + 20),
        reason: `repeated phrase (${worst.count}x)`,
      });
    }
  }
  return { raw, evidence, measured: true };
}

export function collocationShuffle(tokens) {
  const words = lowerTokens(tokens);
  if (words.length < MIN_WORDS + 1) return unmeasured();
  let predictable = 0;
  let runStart = -1;
  let bestRun = null;
  for (let i = 0; i + 1 < words.length; i++) {
    const score = (TOP_1000_WORDS.has(words[i]) ? 1 : 0) + (TOP_1000_WORDS.has(words[i + 1]) ? 1 : 0);
    predictable += score / 2;
    if (score === 2) {
      if (runStart === -1) runStart = i;
    } else if (runStart !== -1) {
      if (bestRun === null || i - runStart > bestRun.end - bestRun.start) {
        bestRun = { start: runStart, end: i + 1 };
      }
      runStart = -1;
    }
  }
  if (runStart !== -1 && (bestRun === null || words.length - runStart > bestRun.end - bestRun.start)) {
    bestRun = { start: runStart, end: words.length };
  }
  const raw = (predictable / (words.length - 1)) * 100;
  const evidence = [];
  if (bestRun !== null && bestRun.end - bestRun.start >= 3) {
    const startOffset = tokens.words[bestRun.start].start;
    const endOffset = tokens.words[bestRun.end - 1].end;
    evidence.push({
      text: tokens.raw.slice(startOffset, endOffset),
      start: startOffset,
      end: endOffset,
      reason: 'run of stock common-word pairings',
    });
  }
  return { raw, evidence, measured: true };
}

function sentenceSkeleton(words) {
  return words
    .slice(0, 8)
    .map((word) => {
      const lower = word.text.toLowerCase();
      if (/\d/u.test(lower)) return 'n';
      if (STOPWORDS.has(lower)) return lower;
      return '#';
    })
    .join(' ');
}

export function syntacticParallelism(tokens) {
  const sentenceWords = wordsBySentence(tokens).filter((words) => words.length > 0);
  if (sentenceWords.length < 6 || tokens.wordCount < 40) return unmeasured();
  const skeletons = sentenceWords.map(sentenceSkeleton);
  let parallel = 0;
  const evidence = [];
  for (let i = 1; i < skeletons.length; i++) {
    if (skeletons[i] !== skeletons[i - 1]) continue;
    parallel += 1;
    const span = tokens.sentences[i];
    evidence.push({
      text: span.text.slice(0, 60),
      start: span.start,
      end: Math.min(span.end, span.start + 60),
      reason: 'repeats the grammatical shape of the sentence before it',
    });
  }
  return {
    raw: (parallel / (skeletons.length - 1)) * 100,
    evidence,
    measured: true,
  };
}

export function discourseEntropy(tokens) {
  const sentenceWords = wordsBySentence(tokens);
  const markers = [];
  sentenceWords.forEach((words, index) => {
    if (words.length === 0) return;
    const startText = tokens.sentences[index].text.toLowerCase();
    for (const marker of DISCOURSE_MARKERS) {
      if (!openerToRegex(marker).test(startText)) continue;
      markers.push({ marker, span: tokens.sentences[index] });
      break;
    }
  });
  if (markers.length < 4) return unmeasured();
  const counts = frequencyMap(markers.map((entry) => entry.marker));
  const entropy = normalizedEntropy(counts, markers.length);
  const mostRepeated = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const evidence = [];
  if (mostRepeated[1] > 1) {
    for (const entry of markers) {
      if (entry.marker !== mostRepeated[0]) continue;
      evidence.push({
        text: entry.span.text.slice(0, 40),
        start: entry.span.start,
        end: Math.min(entry.span.end, entry.span.start + 40),
        reason: `repeated connective "${mostRepeated[0]}" (${mostRepeated[1]}x)`,
      });
      break;
    }
  }
  return { raw: entropy, evidence, measured: true };
}

export function hedgeDensitySpread(tokens) {
  const matches = findPhraseMatches(tokens.raw, HEDGING);
  if (matches.length < 3 || tokens.wordCount < 40) return unmeasured();
  const buckets = [0, 0, 0];
  for (const match of matches) {
    const ratio = match.start / Math.max(tokens.raw.length, 1);
    buckets[Math.min(2, Math.floor(ratio * 3))] += 1;
  }
  const densest = Math.max(...buckets);
  const raw = (densest / matches.length) * 100;
  const segment = buckets.indexOf(densest);
  const segStart = Math.floor((segment * tokens.raw.length) / 3);
  const segEnd = Math.floor(((segment + 1) * tokens.raw.length) / 3);
  return {
    raw,
    evidence: [
      {
        text: tokens.raw.slice(segStart, segStart + 60),
        start: segStart,
        end: Math.min(segEnd, segStart + 60),
        reason: `hedges cluster: ${densest} of ${matches.length} sit in one stretch`,
      },
    ],
    measured: true,
  };
}

function paragraphLead(span) {
  const cleaned = span.text.replace(LIST_MARKER, '').replace(/^[^\p{L}\p{N}]+/u, '');
  const word = cleaned.split(/\s/u)[0] ?? '';
  return word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
}

export function paragraphLeadRepeat(tokens) {
  if (tokens.paragraphs.length < 3 || tokens.wordCount < 40) return unmeasured();
  const leads = tokens.paragraphs.map(paragraphLead);
  const counts = frequencyMap(leads.filter((lead) => lead.length > 0));
  let repeated = 0;
  const evidence = [];
  tokens.paragraphs.forEach((paragraph, index) => {
    const lead = leads[index];
    if (lead.length === 0 || (counts.get(lead) ?? 0) < 2) return;
    repeated += 1;
    evidence.push({
      text: paragraph.text.slice(0, 40),
      start: paragraph.start,
      end: Math.min(paragraph.end, paragraph.start + 40),
      reason: `paragraph opens with the repeated lead "${lead}"`,
    });
  });
  return {
    raw: (repeated / tokens.paragraphs.length) * 100,
    evidence,
    measured: true,
  };
}

export function promptEcho(tokens) {
  const matches = findPhraseMatches(tokens.raw, PROMPT_ECHO);
  return {
    raw: perThousand(matches.length, tokens.wordCount),
    evidence: toEvidence(matches, 'prompt echo, a direct trace of generation', tokens.raw),
    measured: tokens.wordCount >= MIN_WORDS,
  };
}

export const METRICS = Object.freeze([
  {
    id: 'em-dash',
    label: 'Em dash frequency',
    unit: 'per 1k words',
    title: 'Em dashes per 1,000 words. Machines punctuate with far more em dashes than people do. 0 is human-typical; 8 and up reads machine.',
    compute: emDash,
  },
  {
    id: 'ai-cliches',
    label: 'AI cliches',
    unit: 'per 1k words',
    title: 'Stock AI phrases per 1,000 words ("delve into", "rich tapestry", "in today\'s fast-paced world"). 0 is human-typical; 15 and up is machine formula.',
    compute: aiCliches,
  },
  {
    id: 'marketing-hype',
    label: 'Marketing hype',
    unit: 'per 1k words',
    title: 'Sales and corporate inflation per 1,000 words ("unlock", "synergy", "circle back"). 0 is human-typical; 10 and up is copywriting.',
    compute: marketingHype,
  },
  {
    id: 'burstiness',
    label: 'Burstiness (rhythm)',
    unit: 'cv of sentence length',
    title: 'Variation of sentence length (coefficient of variation). People write in bursts; machines keep an even rhythm. 0.55 is human-typical; 0.32 is machine-flat.',
    compute: burstiness,
  },
  {
    id: 'paragraph-uniformity',
    label: 'Paragraph uniformity',
    unit: 'cv of paragraph length',
    title: 'Variation of paragraph length. Even blocks signal machine structure. 0.60 is human-typical; 0.35 is machine-typical.',
    compute: paragraphUniformity,
  },
  {
    id: 'hedging',
    label: 'Hedging',
    unit: '% of words',
    title: 'Softening qualifiers ("perhaps", "tends to", "it could be argued"). Machines hedge to sound safe. 0 is human-typical; 2% and up is machine caution.',
    compute: hedging,
  },
  {
    id: 'passive-voice',
    label: 'Passive voice',
    unit: '% of sentences',
    title: 'Sentences with be + past participle. Machines hide the actor. 2% is human-typical; 15% and up reads machine (academic text shifts this).',
    compute: passiveVoice,
  },
  {
    id: 'mattr',
    label: 'Lexical variety (MATTR)',
    unit: 'moving TTR, window 50',
    title: 'Moving-average type-token ratio over 50-word windows. Polished machine prose carries dense varied vocabulary; everyday prose repeats more. 0.78 is human-typical; 0.92 is machine-typical.',
    compute: mattr,
  },
  {
    id: 'mtld',
    label: 'Lexical diversity (MTLD)',
    unit: 'words per factor',
    title: 'How many words pass before vocabulary variety collapses below the threshold. Machine prose sustains variety longer than everyday writing. 75 is human-typical; 175 is machine-typical.',
    compute: mtld,
  },
  {
    id: 'guiraud',
    label: "Guiraud's R",
    unit: 'types / sqrt(tokens)',
    title: 'Vocabulary richness scaled by length. 8.8 is human-typical; 10.8 is machine-typical.',
    compute: guiraud,
  },
  {
    id: 'yule-k',
    label: "Yule's K",
    unit: 'concentration index',
    title: 'Shape of the word frequency distribution. Everyday prose concentrates on a few words; machine prose spreads evenly. 200 is human-typical; 42 is machine-typical.',
    compute: yuleK,
  },
  {
    id: 'honore',
    label: "Honore's R",
    unit: 'diversity index',
    title: 'Rewards rare words used once, penalizes reuse of them. Polished machine prose deploys rare words freely. 2000 is human-typical; 2900 is machine-typical.',
    compute: honore,
  },
  {
    id: 'hapax',
    label: 'Hapax share',
    unit: '% of words',
    title: 'Share of words that appear exactly once. 38% is human-typical; 54% is machine-typical.',
    compute: hapaxShare,
  },
  {
    id: 'word-length',
    label: 'Word length',
    unit: 'mean letters + long share',
    title: 'Average letters per word plus ten times the share of words of 8+ letters. Machines lean on long formal words. 5.2 is human-typical; 8.4 is machine-typical.',
    compute: wordLength,
  },
  {
    id: 'frequency-profile',
    label: 'Frequency profile',
    unit: '% top-1000 words',
    title: 'Share of words drawn from the 1,000 most frequent English words. Machine prose reaches for rarer vocabulary; everyday human prose stays common. 68% is human-typical; 48% is machine-typical.',
    compute: frequencyProfile,
  },
  {
    id: 'sentence-starters',
    label: 'Sentence starter variety',
    unit: 'normalised entropy',
    title: 'Variety of sentence-opening words. 1.05 is human-typical; 0.90 is machine-typical.',
    compute: sentenceStarters,
  },
  {
    id: 'structure',
    label: 'Structure and formality',
    unit: '0-1',
    title: 'Scaffolding: transition connectives, list layout, tidy wrap-ups. 0 is human-typical; 0.6 is machine-organized.',
    compute: structure,
  },
  {
    id: 'human-voice',
    label: 'Human speech markers',
    unit: '% of words',
    title: 'Speech and slang markers ("honestly", "ngl", "kinda"). More means more human; the score runs backwards. 2.5% is human-typical.',
    compute: humanVoice,
  },
  {
    id: 'contractions',
    label: 'Contractions',
    unit: '% of words',
    title: "Don't, we're, it's. People contract; machines spell things out. The score runs backwards. 3% is human-typical.",
    compute: contractions,
  },
  {
    id: 'ai-openers',
    label: 'Machine sentence openers',
    unit: '% of sentences',
    title: 'Sentences opening with machine habits ("This is", "The key is", gerunds). 0 is human-typical; 15% and up is machine.',
    compute: aiOpeners,
  },
  {
    id: 'triads',
    label: 'Serial three-item lists',
    unit: 'per 1k words',
    title: '"fast, simple, and reliable" — the rule of three machines love. 0 is human-typical; 14 per 1k is machine-typical.',
    compute: triads,
  },
  {
    id: 'specificity',
    label: 'Specific detail',
    unit: '% of words',
    title: 'Numbers, dates, concrete objects, named things, quotes. People write "I paid 340 on Wednesday". The score runs backwards. 5% is human-typical.',
    compute: specificity,
  },
  {
    id: 'first-person',
    label: 'First-person voice',
    unit: '% of words',
    title: 'I, me, my, we. People narrate from inside a life. The score runs backwards. 8% is human-typical.',
    compute: firstPerson,
  },
  {
    id: 'roughness',
    label: 'Typing roughness',
    unit: 'per 100 words',
    title: 'Lowercase sentence starts, held keys ("sooo"), doubled spaces, SHOUTING. People type rough. The score runs backwards. 5 per 100 is human-typical.',
    compute: roughness,
  },
  {
    id: 'abstraction',
    label: 'Abstract wording',
    unit: '% of words',
    title: 'Abstract nouns and nominalisations ("framework", "communication"). People name things; machines name concepts. 0 is human-typical; 15% is machine.',
    compute: abstraction,
  },
  {
    id: 'ngram-repetition',
    label: 'Ngram repetition',
    unit: '% repeated tri/quad',
    title: 'Share of repeated three- and four-word sequences. Machines recycle constructions. 0 is human-typical; 3 per 100 words is machine-typical.',
    compute: ngramRepetition,
  },
  {
    id: 'collocation-shuffle',
    label: 'Collocation predictability',
    unit: '% stock pairings',
    title: 'Share of adjacent word pairs built from the 1,000 commonest words. Machine prose shuns stock pairings for decorated ones. 66% is human-typical; 54% is machine-typical.',
    compute: collocationShuffle,
  },
  {
    id: 'syntactic-parallelism',
    label: 'Syntactic parallelism',
    unit: '% matching neighbours',
    title: 'Consecutive sentences sharing the same grammatical skeleton. Machines march in lockstep. 0 is human-typical; 20% is machine-typical.',
    compute: syntacticParallelism,
  },
  {
    id: 'discourse-entropy',
    label: 'Discourse marker variety',
    unit: 'normalised entropy',
    title: 'Variety of connectives between sentences. Machine prose spreads across many connectors. The score runs backwards. 0.82 is human-typical.',
    compute: discourseEntropy,
  },
  {
    id: 'hedge-density-spread',
    label: 'Hedge clustering',
    unit: '% in one stretch',
    title: 'Where hedges pile up: one stretch or spread through the text. Machines dump caveats together. 45% is human-typical; 85% is machine-typical.',
    compute: hedgeDensitySpread,
  },
  {
    id: 'paragraph-lead',
    label: 'Paragraph lead repeats',
    unit: '% of paragraphs',
    title: 'Paragraphs opening with the same first word ("First,", "Moreover,"). 0 is human-typical; 30% is machine scaffolding.',
    compute: paragraphLeadRepeat,
  },
  {
    id: 'prompt-echo',
    label: 'Prompt echo',
    unit: 'per 1k words',
    title: 'Direct traces of generation ("as an AI", "let\'s explore", "I cannot"). Any hit is damning. 0 is human-typical; 6 per 1k is machine.',
    compute: promptEcho,
  },
]);
