/**
 * Verify layout polish export: font bumps, FYTD labels, slide2 guide lines.
 * Run: node scripts/validate-mir-layout-polish-export.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMirPresentationZip } from '../js/monthly-report-pptx-export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'public/templates/MIR_Master_Template.pptx');
const OUTPUT = path.join(__dirname, 'spike-output/CREDO-MCI-WEST-Monthly-Impact-Report-June-2026-layout-polish.pptx');

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
  reachNotes: 'June reach notes with user text — guide lines should be removed.',
  manpowerNotes: '',
  readinessNotes: '',
  commandHighlightsNotes: 'Command highlight note for June.',
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

import { execSync } from 'node:child_process';
const report = execSync(`python3 - <<'PY'
import zipfile, re, xml.etree.ElementTree as ET
from pathlib import Path

p = Path("${OUTPUT}")
tpl = Path("${TEMPLATE}")

def extract(xml, name):
    pat = rf'<p:sp>(?:(?!</p:sp>).)*?name="{re.escape(name)}"(?:(?!</p:sp>).)*?</p:sp>'
    m = re.search(pat, xml, re.DOTALL)
    return m.group(0) if m else None

def sz(shape):
    return re.findall(r'sz="(\\d+)"', shape)

def emu_in(v):
    return round(int(v)/914400, 4)

with zipfile.ZipFile(p) as z:
    s1 = z.read('ppt/slides/slide1.xml').decode('utf-8')
    s2 = z.read('ppt/slides/slide2.xml').decode('utf-8')
with zipfile.ZipFile(tpl) as z:
    t1 = z.read('ppt/slides/slide1.xml').decode('utf-8')

errors = []

# XML validity
for part in ['ppt/slides/slide1.xml','ppt/slides/slide2.xml']:
    ET.fromstring(s1 if 'slide1' in part else s2)

# Font +0.5pt on values
for name, old, new in [
    ('mir_fytd_marriage', '1150', '1200'),
    ('mir_month_reach_commands', '920', '970'),
    ('mir_fytd_total', '1250', '1300'),
]:
    got = sz(extract(s1, name))
    if got != [new]:
        errors.append(f'{name} font expected [{new}] got {got}')

# FYTD labels taller, font unchanged
for name, label_sz in [('TextBox 118', '850'), ('TextBox 120', '850')]:
    sh = extract(s1, name)
    cy = re.search(r'cy="(\\d+)"', sh).group(1)
    if cy != '253087':
        errors.append(f'{name} cy expected 253087 got {cy}')
    if sz(sh) != [label_sz]:
        errors.append(f'{name} label font changed: {sz(sh)}')

# Guide lines: removed for reach + command highlights, kept for manpower + readiness
for rect in ['Rectangle 21','Rectangle 27','Rectangle 33','Rectangle 39']:
    in_export = rect in s2
    should_exist = rect in ('Rectangle 27','Rectangle 33')
    if should_exist and not in_export:
        errors.append(f'{rect} should remain for blank section')
    if not should_exist and in_export:
        errors.append(f'{rect} should be removed for user-text section')

if 'June reach notes with user text' not in s2:
    errors.append('reach user text missing')
if 'Enter manpower and manning notes' not in s2:
    errors.append('manpower placeholder missing')

if errors:
    print('FAIL')
    for e in errors:
        print(' ', e)
else:
    print('PASS layout polish verification')
    print(' FYTD TOTAL label y/h:', emu_in(re.search(r'y="(\\d+)"', extract(s1,'TextBox 118')).group(1)), emu_in(re.search(r'cy="(\\d+)"', extract(s1,'TextBox 118')).group(1)))
    print(' Output:', p)
PY`, { encoding: 'utf-8' });

console.log(report);
