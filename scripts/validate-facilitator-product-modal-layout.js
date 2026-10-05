/**
 * Facilitator Management product-detail modal presentation.
 * Run: node scripts/validate-facilitator-product-modal-layout.js
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
const productModalAt = css.indexOf('#facilitator-product-modal {');
assert(productModalAt !== -1, 'product modal layout rules exist');
const modalCss = css.slice(productModalAt);
const productHtml = sliceBetween(html, 'id="facilitator-product-modal"', 'id="aar-audit-modal"');
const paint = sliceBetween(app, 'function paintFacilitatorProductDetail', 'function openFacilitatorProduct');
const open = sliceBetween(app, 'function openFacilitatorProduct', 'function setupFacilitatorManagement');
const setup = sliceBetween(app, 'function setupFacilitatorManagement', 'function switchView');

assert(modalCss.includes('margin: auto'), 'the product modal is centered with margin auto');
assert(modalCss.includes('width: min(1100px, calc(100vw - 32px))'), 'the product modal keeps its desktop width');
assert(modalCss.includes('max-height: calc(100vh - 32px)'), 'the product modal stays inside the viewport');
assert(modalCss.includes('display: flex') && modalCss.includes('flex-direction: column'), 'the product modal content is a flex column');
assert(modalCss.includes('flex-shrink: 0'), 'the product modal header and footer stay fixed');
assert(modalCss.includes('flex: 1 1 auto') && modalCss.includes('min-height: 0') && modalCss.includes('overflow: auto'), 'the product modal body is the scroller');
assert(modalCss.includes('overscroll-behavior: contain'), 'modal scrolling does not chain to the page');
assert(modalCss.includes('#facilitator-product-modal .table-wrap {') && modalCss.includes('overflow: visible'), 'the product table does not take over vertical scrolling');
assert(modalCss.includes('min-width: 170px'), 'the Name column has room for a normal facilitator name');
assert(modalCss.includes('#facilitator-product-modal .facilitator-text-button {'), 'product modal names use the modal text-button style');
assert(modalCss.includes('border: none') && modalCss.includes('background: transparent') && modalCss.includes('color: #00205b'), 'product modal names are plain navy text');
assert(modalCss.includes('text-decoration: underline'), 'product modal names underline on hover');
assert(modalCss.includes(':focus-visible'), 'product modal names keep a keyboard focus state');
assert(!modalCss.includes('max-height: min(70vh, 720px)'), 'the product modal body is no longer a separate fixed-height scroller');

assert(productHtml.includes('class="modal-header"') && productHtml.includes('class="modal-body"') && productHtml.includes('class="modal-footer"'), 'the product modal keeps header, body, and footer');
assert(productHtml.includes('id="facilitator-product-close"') && productHtml.includes('id="facilitator-product-close-btn"'), 'the product modal keeps its close controls');
assert(paint.includes("button.className = 'facilitator-text-button'"), 'names remain buttons');
assert(paint.includes('openFacilitatorDetail') === false, 'painting the product table does not change the profile opener');
assert(setup.includes('openFacilitatorDetail(personButton.dataset.facilitatorPerson)'), 'a product name still opens the facilitator profile');
assert(paint.includes("'Name'") && paint.includes("'Qualification Record'"), 'the product personnel columns stay in place');
assert(open.includes('setFacilitatorProductPageScrollLocked(true)'), 'opening the product modal locks page scrolling');
assert(setup.includes("addEventListener('close'") && setup.includes('setFacilitatorProductPageScrollLocked(false)'), 'closing the product modal restores page scrolling');
assert(app.includes('function setFacilitatorProductPageScrollLocked'), 'page scroll locking is scoped to the product modal');

if (errors.length) {
  console.error(`validate-facilitator-product-modal-layout: ${errors.length} failure(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('validate-facilitator-product-modal-layout: ok');
