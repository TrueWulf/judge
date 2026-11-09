# judge

detector of machine writing style

reads only english text and scores it 0-100 for ai-ness: twenty-five
metrics vote on cliches, rhythm, vocabulary and structure, and the
verdict comes from the balance of votes. genre detection shifts the
calibration.

'very unstable'

## usage

paste the text, press enter. the report shows the score, the weight
of every metric and the markers found, highlighted in the text.

## run

    npx http-server -p 8000

the site is plain html, css and js. any static file server will do.

## license

isc, see LICENSE.
