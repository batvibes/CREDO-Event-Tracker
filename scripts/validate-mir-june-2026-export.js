/**
 * Generate June 2026 MIR export for validation (Sections 1 + 2).
 * Run: node scripts/validate-mir-june-2026-export.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import {
  buildMirPresentationZip,
  calculateMirSection2Data,
} from '../js/monthly-report-pptx-export.js';

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

const mockTeamMembers = [
  {
    id: '1',
    name: 'LCDR Jane Smith',
    billetOrRole: 'CREDO Director',
    statusNextAction: 'Onboard / Lead Q3 planning',
    prdEaos: 'DEC 2027',
    displayOrder: 0,
  },
  {
    id: '2',
    name: 'LT Marcus Chen',
    billetOrRole: 'Deputy Director',
    statusNextAction: 'PCS prep / Handoff brief',
    prdEaos: 'JUN 2026',
    displayOrder: 1,
  },
  {
    id: '3',
    name: 'HMCS Alex Rivera',
    billetOrRole: 'Admin Lead',
    statusNextAction: 'Active / Training pipeline',
    prdEaos: 'MAR 2028',
    displayOrder: 2,
  },
];

const section2Data = calculateMirSection2Data(mockTeamMembers);

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
  section2Data,
  notes,
});

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, outputBytes);
console.log(`Wrote ${OUTPUT} (${outputBytes.length} bytes)`);

const rowsJson = path.join(os.tmpdir(), 'mir-section2-rows.json');
fs.writeFileSync(rowsJson, JSON.stringify(section2Data.rows));
execSync(
  `python3 "${path.join(__dirname, 'validate-mir-section2-export.py')}" "${TEMPLATE}" "${OUTPUT}" "${rowsJson}"`,
  { stdio: 'inherit' },
);
fs.unlinkSync(rowsJson);
