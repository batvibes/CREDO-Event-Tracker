/**
 * Generate June 2026 MIR export for validation.
 * Run: node scripts/validate-mir-june-2026-export.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMirPresentationZip } from '../js/monthly-report-pptx-export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'public/templates/MIR_Master_Template.pptx');
const OUTPUT = path.join(__dirname, 'spike-output/CREDO-MCI-WEST-Monthly-Impact-Report-June-2026.pptx');

const section1Data = {
  monthReach: {
    commandsSupported: 12,
    beneficiariesServed: 1840,
    workshopsConducted: 18,
    retreatsConducted: 3,
  },
  fytdMissionSupport: {
    marriageEnrichment: 707,
    personalGrowth: 412,
    suicidePrevention: 718,
    retreats: 55,
    fytdTotal: 1892,
    commands: 24,
  },
};

const notes = {
  reachNotes: 'June reach notes from Event Tracker validation export.',
  manpowerNotes: '',
  readinessNotes: '',
  commandHighlightsNotes: '',
};

const templateBuffer = fs.readFileSync(TEMPLATE);
const outputBytes = await buildMirPresentationZip({
  templateBuffer,
  monthName: 'June',
  year: 2026,
  section1Data,
  notes,
});

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, outputBytes);
console.log(`Wrote ${OUTPUT} (${outputBytes.length} bytes)`);
