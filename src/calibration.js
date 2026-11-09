export const CALIBRATION = Object.freeze({
  'em-dash': { humanBaseline: -2.0, aiTypical: 8.0, weight: 1.0 },
  'ai-cliches': { humanBaseline: -3.0, aiTypical: 15.0, weight: 1.3 },
  'marketing-hype': { humanBaseline: -3.0, aiTypical: 10.0, weight: 1.1 },
  burstiness: { humanBaseline: 0.6, aiTypical: 0.3, weight: 1.7 },
  'paragraph-uniformity': { humanBaseline: 0.5, aiTypical: 0.1, weight: 0.9 },
  hedging: { humanBaseline: -1.0, aiTypical: 2.0, weight: 0.8 },
  'passive-voice': { humanBaseline: 2.0, aiTypical: 15.0, weight: 1.2 },
  mattr: { humanBaseline: 0.78, aiTypical: 0.92, weight: 0.9 },
  hapax: { humanBaseline: 38, aiTypical: 54, weight: 0.8 },
  'word-length': { humanBaseline: 5.2, aiTypical: 8.4, weight: 1.1 },
  'frequency-profile': { humanBaseline: 68, aiTypical: 48, weight: 0.9 },
  'sentence-starters': { humanBaseline: 1.05, aiTypical: 0.9, weight: 0.7 },
  structure: { humanBaseline: -0.1, aiTypical: 0.6, weight: 1.3 },
  'human-voice': { humanBaseline: 2.5, aiTypical: -1.5, weight: 1.6 },
  contractions: { humanBaseline: 3.0, aiTypical: -2.0, weight: 1.5 },
  'ai-openers': { humanBaseline: -5.0, aiTypical: 15.0, weight: 1.1 },
  triads: { humanBaseline: -2.0, aiTypical: 14.0, weight: 0.9 },
  specificity: { humanBaseline: 8.0, aiTypical: -6.0, weight: 1.2 },
  'first-person': { humanBaseline: 8.0, aiTypical: -3.0, weight: 1.3 },
  roughness: { humanBaseline: 5.0, aiTypical: -3.0, weight: 1.3 },
  abstraction: { humanBaseline: -3.0, aiTypical: 15.0, weight: 1.3 },
  'ngram-repetition': { humanBaseline: -1.0, aiTypical: 3.0, weight: 1.1 },
  'syntactic-parallelism': { humanBaseline: -3.0, aiTypical: 20.0, weight: 1.0 },
  'paragraph-lead': { humanBaseline: -3.0, aiTypical: 30.0, weight: 1.0 },
  'prompt-echo': { humanBaseline: -1.0, aiTypical: 6.0, weight: 1.5 },
});

export const GENRE_CALIBRATION = Object.freeze({
  academic: {
    'passive-voice': { humanBaseline: 12.0, aiTypical: 38.0 },
    hedging: { humanBaseline: 1.0, aiTypical: 4.0 },
    abstraction: { humanBaseline: 5.0, aiTypical: 19.0 },
    'word-length': { humanBaseline: 5.8, aiTypical: 8.2 },
    'frequency-profile': { humanBaseline: 62, aiTypical: 42 },
  },
  marketing: {
    'marketing-hype': { humanBaseline: 5.0, aiTypical: 25.0 },
    'ai-cliches': { humanBaseline: 3.0, aiTypical: 22.0 },
  },
  technical: {
    specificity: { humanBaseline: 25.0, aiTypical: 13.0 },
    'frequency-profile': { humanBaseline: 58, aiTypical: 42 },
    'word-length': { humanBaseline: 5.6, aiTypical: 8.0 },
  },
});

export const MIN_WORDS = 30;

export const CONFIDENT_WORDS = 300;

export const VERDICT_BANDS = Object.freeze([
  { upTo: 25, verdict: 'human' },
  { upTo: 50, verdict: 'mostly human' },
  { upTo: 75, verdict: 'mixed' },
  { upTo: 90, verdict: 'ai-like' },
  { upTo: 100, verdict: 'ai' },
]);
