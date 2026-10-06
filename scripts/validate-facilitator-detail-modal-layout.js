/**
 * Facilitator profile modal scrolling and experience tables.
 * Run: node scripts/validate-facilitator-detail-modal-layout.js
 *
 * Does not connect to Supabase and does not apply a migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert(start !== -1 && end !== -1, `missing slice ${startNeedle}`);
  return source.slice(start, end === -1 ? source.length : end);
}

const css = read('css/styles.css');
const app = read('js/app.js');
const html = read('index.html');
const detailCss = sliceBetween(css, 'html:has(#facilitator-detail-modal[open])', '#facilitator-qualification-modal {');
const detailHtml = sliceBetween(html, 'id="facilitator-detail-modal"', 'id="facilitator-qualification-modal"');
const paint = sliceBetween(app, 'function openFacilitatorDetail', 'function closeFacilitatorDetail');
const tableWrap = sliceBetween(detailCss, '#facilitator-detail-modal .table-wrap {', '#facilitator-detail-modal .events-table th,');

assert(detailCss.includes('margin: auto'), 'the facilitator profile stays centered');
assert(detailCss.includes('width: min(880px, calc(100vw - 32px))'), 'the facilitator profile keeps its desktop width');
assert(detailCss.includes('max-height: calc(100dvh - 32px)'), 'the facilitator profile stays inside the viewport');
assert(detailCss.includes('display: flex') && detailCss.includes('flex-direction: column'), 'the profile content is a flex column');
assert(detailCss.includes('height: auto'), 'a short profile keeps its natural height');
assert(detailCss.includes('overflow: hidden'), 'the dialog and content do not become extra scrollers');
assert(detailCss.includes('flex-shrink: 0'), 'the profile header and footer do not shrink');
assert(
  detailCss.includes('flex: 1 1 auto') && detailCss.includes('min-height: 0') && detailCss.includes('overflow-y: auto'),
  'the profile body is the vertical scroller',
);
assert(detailCss.includes('overscroll-behavior: contain'), 'profile scrolling does not chain to the page');
assert(detailCss.includes('-webkit-overflow-scrolling: touch'), 'the profile body scrolls on touch devices');
assert(
  detailCss.includes('html:has(#facilitator-detail-modal[open])') && detailCss.includes('overflow: hidden'),
  'the page behind the open profile does not scroll',
);
assert(tableWrap.includes('overflow-x: auto') && tableWrap.includes('overflow-y: visible'), 'experience tables scroll horizontally only');
assert(tableWrap.includes('flex: 0 0 auto'), 'experience tables do not flex-shrink');
assert(tableWrap.includes('max-height: none') && tableWrap.includes('height: auto'), 'experience tables keep their natural height');
assert(!/max-height:\s*\d/.test(tableWrap), 'experience tables have no tiny max-height');
assert(detailCss.includes('#facilitator-detail-modal .modal-body > *'), 'profile sections are protected from flex collapse');
assert(detailHtml.includes('class="modal-header"') && detailHtml.includes('class="modal-body"') && detailHtml.includes('class="modal-footer"'), 'the profile keeps header, body, and footer');
assert(paint.includes("wrap.className = 'table-wrap'"), 'recorded facilitation uses the profile table wrapper');
assert(paint.includes("t4tWrap.className = 'table-wrap'"), 'T4T facilitation uses the same table wrapper');
assert(paint.includes('Most Recent Facilitation') && paint.includes('Most Recent T4T Facilitation'), 'both experience tables keep their columns');
assert(detailCss.includes('@media (max-width: 640px)'), 'narrow profile columns can wrap');

if (errors.length) {
  console.error(`validate-facilitator-detail-modal-layout: ${errors.length} failure(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('validate-facilitator-detail-modal-layout: ok');
