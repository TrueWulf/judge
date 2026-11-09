import {
  ACADEMIC_REGISTER,
  ABSTRACT_NOUNS,
  CORPORATE_SPEAK,
  FIRST_PERSON,
  HEDGING,
  HUMAN_MARKERS,
  INTERNET_REGISTER,
  MARKETING_HYPE,
  SELF_DOUBT,
  TECHNICAL_WORDS,
} from './lexicons.js';
import { findPhraseMatches } from './match.js';
import {
  CALIBRATION,
  CONFIDENT_WORDS,
  GENRE_CALIBRATION,
  MIN_WORDS,
  VERDICT_BANDS,
} from './calibration.js';

const RELIABILITY_SPAN = 120;
const MARGIN_SPAN = 20;
const BE_FORMS = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being']);
const SECOND_PERSON = new Set(['you', 'your', 'yours', 'yourself', 'yourselves']);
const CODE_PATTERN = /=>|::|\{\}|\[\]|\(\)|\w+_\w+|\w+\.\w+\(|[{};]|<\/?\w+>/gu;

function per100(count, wordCount) {
  if (wordCount === 0) return 0;
  return (count / wordCount) * 100;
}

function countWords(tokens, lexicon) {
  let count = 0;
  for (const word of tokens.words) if (lexicon.has(word.text.toLowerCase())) count += 1;
  return count;
}

function countPhrases(tokens, lexicon) {
  return findPhraseMatches(tokens.raw, lexicon).length;
}

function passiveShare(tokens) {
  if (tokens.sentences.length === 0) return 0;
  const buckets = tokens.sentences.map(() => []);
  let index = 0;
  for (const word of tokens.words) {
    while (index < tokens.sentences.length && word.start >= tokens.sentences[index].end) {
      index += 1;
    }
    if (index < tokens.sentences.length) buckets[index].push(word.text.toLowerCase());
  }
  let passive = 0;
  for (const words of buckets) {
    for (let i = 0; i < words.length - 1; i++) {
      if (!BE_FORMS.has(words[i])) continue;
      const limit = Math.min(i + 3, words.length);
      let hit = false;
      for (let j = i + 1; j < limit; j++) {
        if (words[j].endsWith('ed')) {
          hit = true;
          break;
        }
      }
      if (hit) {
        passive += 1;
        break;
      }
    }
  }
  return (passive / tokens.sentences.length) * 100;
}

export function detectGenre(tokens) {
  const words = tokens.wordCount;
  if (words < MIN_WORDS) return 'general';

  const academic =
    per100(countPhrases(tokens, ACADEMIC_REGISTER), words) * 2 +
    per100(countWords(tokens, ABSTRACT_NOUNS), words) * 0.15 +
    passiveShare(tokens) * 0.1 +
    (/\bet al\b|\bibid\b|\bfig\.\s|\bpp?\.\s\d/iu.test(tokens.raw) ? 4 : 0);

  const conversational =
    per100(countPhrases(tokens, INTERNET_REGISTER), words) * 3 +
    per100(countPhrases(tokens, SELF_DOUBT), words) * 2 +
    per100(countPhrases(tokens, HUMAN_MARKERS), words) +
    per100(countWords(tokens, FIRST_PERSON), words);

  const marketing =
    per100(countPhrases(tokens, MARKETING_HYPE), words) * 3 +
    per100(countPhrases(tokens, CORPORATE_SPEAK), words) * 2 +
    per100(countWords(tokens, SECOND_PERSON), words);

  const codeHits = [...tokens.raw.matchAll(CODE_PATTERN)].length;
  const technical =
    per100(countWords(tokens, TECHNICAL_WORDS), words) * 3 + per100(codeHits, words) * 2;

  const scores = { academic, conversational, marketing, technical };
  let best = 'general';
  let bestScore = 4;
  for (const [genre, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = genre;
    }
  }
  return best;
}

export function calibrationFor(id, genre) {
  const base = CALIBRATION[id];
  const shift = GENRE_CALIBRATION[genre]?.[id];
  return shift === undefined ? base : { ...base, ...shift };
}

export function scoreAspect(raw, calibration) {
  const span = calibration.aiTypical - calibration.humanBaseline;
  if (span === 0) return 50;
  const normalized = ((raw - calibration.humanBaseline) / span) * 100;
  return Math.min(100, Math.max(0, normalized));
}

export function overallScore(aspects) {
  let machineVotes = 0;
  let humanVotes = 0;
  for (const aspect of aspects) {
    if (!aspect.measured) continue;
    const lean = aspect.score - 50;
    const ballot = aspect.weight * Math.abs(lean);
    if (lean > 0) machineVotes += ballot;
    else if (lean < 0) humanVotes += ballot;
  }
  const total = machineVotes + humanVotes;
  if (total === 0) return 50;
  return 50 + (50 * (machineVotes - humanVotes)) / total;
}

export function lengthFactor(wordCount) {
  return Math.min(1, Math.max(0, (wordCount - MIN_WORDS) / RELIABILITY_SPAN));
}

export function shrinkScore(score, wordCount) {
  return 50 + (score - 50) * lengthFactor(wordCount);
}

export function marginFor(wordCount) {
  return Math.round(MARGIN_SPAN * (1 - lengthFactor(wordCount)));
}

export function confidenceFor(wordCount) {
  return Math.min(1, Math.max(0, wordCount / CONFIDENT_WORDS));
}

export function verdictFor(score) {
  for (const band of VERDICT_BANDS) {
    if (score <= band.upTo) return band.verdict;
  }
  return VERDICT_BANDS[VERDICT_BANDS.length - 1].verdict;
}
