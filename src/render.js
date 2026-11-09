const BAR_WIDTH = 10;
const HIGH_SIGNAL = 60;

export function renderReport(result, container) {
  if (!result.english) {
    container.replaceChildren(renderAlert(result.verdict));
    return;
  }

  const parts = [];
  if (result.overall === null) {
    parts.push(renderAlert(result.verdict));
  } else {
    parts.push(renderSummary(result));
  }
  parts.push(renderTable(result.aspects));
  if (result.overall !== null) parts.push(renderFindings(result));
  container.replaceChildren(...parts);
}

function renderAlert(text) {
  const line = el('p', { class: 'verdict' });
  line.append(el('span', { class: 'score alert', text }));
  return line;
}

function renderSummary(result) {
  const verdict = el('p', { class: 'verdict' });
  const scoreText =
    result.margin > 0
      ? `${Math.round(result.overall)} \u00b1 ${result.margin}`
      : `${Math.round(result.overall)}`;
  verdict.append(
    el('span', { class: 'score', text: scoreText }),
    document.createTextNode(' / 100   '),
    el('strong', { text: result.verdict }),
  );

  const fragment = document.createDocumentFragment();
  fragment.append(
    verdict,
    el('p', {
      text: `${result.wordCount} words, confidence ${Math.round(result.confidence * 100)}%, ${result.genre}`,
    }),
  );
  return fragment;
}

function renderTable(aspects) {
  const head = el('tr');
  head.append(
    el('th', { text: 'aspect' }),
    el('th', { class: 'num', text: 'measured' }),
    el('th', { class: 'num', text: 'w' }),
    el('th', { text: 'signal' }),
  );

  const thead = el('thead');
  thead.append(head);

  const tbody = el('tbody');
  for (const aspect of aspects) tbody.append(renderRow(aspect));

  const table = el('table');
  table.append(thead, tbody);
  return table;
}

function renderRow(aspect) {
  const row = el('tr', { title: aspect.title });
  row.append(
    el('td', { text: aspect.label }),
    el('td', {
      class: 'num',
      text: aspect.measured ? `${formatNumber(aspect.raw)} ${aspect.unit}` : 'n/a',
    }),
    el('td', { class: 'num', text: formatWeight(aspect.weight) }),
    el('td', {
      class: 'signal',
      text: aspect.measured ? `${Math.round(aspect.score)}  ${asciiBar(aspect.score)}` : '-',
    }),
  );
  return row;
}

function renderFindings(result) {
  const findings = collectFindings(result);
  const section = el('section');
  section.append(el('h3', { text: 'findings' }));

  if (findings.length === 0) {
    section.append(el('p', { text: 'no markers' }));
    return section;
  }

  section.append(el('p', { text: `${findings.length} markers` }));

  const list = el('ol', { class: 'findings' });
  for (const finding of findings) {
    const item = el('li');
    item.append(
      el('mark', { text: finding.text, class: finding.strong ? 'strong' : '' }),
      el('span', {
        class: 'reason',
        text: `${finding.aspectLabel} \u2014 ${finding.reason}`,
      }),
    );
    list.append(item);
  }
  section.append(list, renderMarkedText(result, findings));
  return section;
}

function renderMarkedText(result, findings) {
  const box = el('div', { class: 'highlighted-text' });

  let cursor = 0;
  for (const segment of buildSegments(findings)) {
    if (segment.start > cursor) box.append(result.text.slice(cursor, segment.start));
    box.append(
      el('mark', {
        text: result.text.slice(segment.start, segment.end),
        class: segment.strong ? 'strong' : '',
        title: segment.reasons.join('; '),
      }),
    );
    cursor = segment.end;
  }
  if (cursor < result.text.length) box.append(result.text.slice(cursor));

  return box;
}

function collectFindings(result) {
  const findings = result.aspects.flatMap((aspect) =>
    aspect.evidence.map((item) => ({
      ...item,
      aspectLabel: aspect.label,
      strong: aspect.score >= HIGH_SIGNAL,
    })),
  );
  findings.sort((a, b) => a.start - b.start || a.end - b.end);
  return findings;
}

function buildSegments(findings) {
  const segments = [];
  for (const finding of findings) {
    const last = segments[segments.length - 1];
    const reason = `${finding.aspectLabel}: ${finding.reason}`;
    if (last !== undefined && finding.start < last.end) {
      last.end = Math.max(last.end, finding.end);
      last.strong = last.strong || finding.strong;
      if (!last.reasons.includes(reason)) last.reasons.push(reason);
      continue;
    }
    segments.push({
      start: finding.start,
      end: finding.end,
      reasons: [reason],
      strong: finding.strong,
    });
  }
  return segments;
}

function asciiBar(score) {
  const filled = Math.round((score / 100) * BAR_WIDTH);
  return `[${'#'.repeat(filled)}${'.'.repeat(BAR_WIDTH - filled)}]`;
}

function formatNumber(value) {
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function formatWeight(value) {
  return value.toFixed(1).replace(/\.0$/, '');
}

function el(tag, attrs = {}) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else if (value !== '') node.setAttribute(key, value);
  }
  return node;
}
