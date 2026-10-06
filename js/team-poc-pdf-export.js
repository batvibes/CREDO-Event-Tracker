import { buildFacilitatorPdfFilename, exportFacilitatorTablePdf } from './facilitator-report-pdf-export.js';
import { structuredPersonalName } from './team-personnel-editor.js';

const COLUMNS = [
  { key: 'rank', label: 'Rank / Title', weight: 1 },
  { key: 'name', label: 'Full Name', weight: 1.55 },
  { key: 'command', label: 'Command / Organization', weight: 2.15 },
  { key: 'installation', label: 'Installation', weight: 1.35 },
  { key: 'active', label: 'Active Status', weight: 0.78 },
  { key: 'staff', label: 'CREDO Staff', weight: 0.72 },
  { key: 'facilitator', label: 'Facilitator', weight: 1.15 },
  { key: 'poc', label: 'Point of Contact', weight: 0.78 },
  { key: 'billet', label: 'Billet / Role', weight: 1.35 },
  { key: 'prd', label: 'PRD / EAOS', weight: 0.85 },
];

function cleanName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function teamPocPdfFullName(person) {
  const structured = structuredPersonalName(person?.firstName, person?.lastName);
  if (structured) return structured;
  return cleanName(person?.name);
}

function yesNo(value) {
  return value === true ? 'Yes' : 'No';
}

function teamPocPdfRow(person) {
  return {
    rank: person?.rankTitle || '',
    name: teamPocPdfFullName(person),
    command: person?.commandOrganization || '',
    installation: person?.installation || '',
    active: person?.active === true ? 'Active' : 'Inactive',
    staff: yesNo(person?.isCredoStaff),
    facilitator: yesNo(person?.isFacilitator),
    poc: yesNo(person?.isPoc),
    billet: person?.staffBilletOrRole || '',
    prd: person?.staffPrdEaos || '',
  };
}

export function teamPocPdfFilename() {
  return buildFacilitatorPdfFilename('Points of Contact Directory');
}

export async function exportTeamPocDirectoryPdf(people) {
  const rows = (people ?? []).map(teamPocPdfRow);
  await exportFacilitatorTablePdf({
    title: 'Points of Contact Directory',
    scopeLines: [`Records: ${rows.length}`],
    columns: COLUMNS,
    rows,
    filename: teamPocPdfFilename(),
    orientation: 'landscape',
  });
}
