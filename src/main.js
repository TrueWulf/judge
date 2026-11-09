import { analyze } from './analyze.js';
import { renderReport } from './render.js';

const input = required(document.getElementById('text'), HTMLTextAreaElement, 'text');
const report = required(document.getElementById('report'), HTMLElement, 'report');

input.addEventListener('keydown', onKeyDown);

function onKeyDown(event) {
  if (event.key !== 'Enter' || event.shiftKey) return;
  event.preventDefault();
  update();
}

function update() {
  const text = input.value;
  if (text.trim().length === 0) {
    report.hidden = true;
    report.replaceChildren();
    return;
  }
  renderReport(analyze(text), report);
  report.hidden = false;
}

function required(node, expected, id) {
  if (node instanceof expected) return node;
  throw new Error(`expected #${id} to be ${expected.name}, got ${node?.tagName ?? 'nothing'}`);
}
