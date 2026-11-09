# judge

rule-based detector of machine writing style.

reads an english text and scores it 0-100 for ai-ness. twenty-five
metrics look at cliches, rhythm, vocabulary, structure and typing
roughness. every metric votes and the verdict comes from the balance
of votes, not an average. the genre (academic, conversational,
marketing, technical) is detected and the calibration shifts with it.
non-english input gets "lang not supported". nothing leaves the
browser: no build, no dependencies, no data collected.

## usage

paste the text into the block and press enter. the report shows the
score (with a margin on short texts), the weight of every metric and
the markers found, highlighted inline in yellow and red. hover a
table row to see what the metric measures.

texts under 30 words get "min 30 words" instead of a score.

## run

    python3 -m http.server 8000

the site is plain html, css and js. any static file server works;
python is just the one that is always around.

## license

isc, see LICENSE.
