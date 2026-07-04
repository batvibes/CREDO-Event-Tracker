/**
 * Proof-of-concept: populate the reference MIR PowerPoint template via pptx-automizer.
 * Not wired into the app. Run: node scripts/spike-mir-template-export.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Automizer, ModifyTextHelper } = require('pptx-automizer');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_TEMPLATE =
  '/Users/jamesbrantley/Downloads/CREDO-MCI-WEST-Monthly-Impact-Report-June-2026.pptx';
const SPIKE_MONTH_LABEL = process.env.MIR_SPIKE_MONTH_LABEL || 'JULY 2026';
const OUTPUT_NAME = 'spike-mir-template-export.pptx';

const templatePath = path.resolve(process.env.MIR_TEMPLATE_PATH || DEFAULT_TEMPLATE);
const templateDir = path.dirname(templatePath);
const templateFile = path.basename(templatePath);
const outputDir = path.join(__dirname, 'spike-output');

function fail(message) {
  console.error(`[spike-mir] ERROR: ${message}`);
  process.exit(1);
}

async function verifySlideText(pptxPath, shapeName) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath));
  const slidePaths = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const ai = Number(a.match(/slide(\d+)/)[1]);
      const bi = Number(b.match(/slide(\d+)/)[1]);
      return ai - bi;
    });

  for (const slidePath of slidePaths) {
    const slideXml = await zip.file(slidePath).async('string');
    const nameMatch = slideXml.match(
      new RegExp(
        `<p:cNvPr[^>]*name="${shapeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]*?<\\/p:sp>`,
      ),
    );
    if (!nameMatch) continue;
    const textMatches = [...nameMatch[0].matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)];
    const text = textMatches.map((m) => m[1]).join('').trim();
    if (text && !text.includes('NOTES')) {
      return { slidePath, text };
    }
  }

  return { slidePath: null, text: 'NOT_FOUND' };
}

async function main() {
  console.log('[spike-mir] Monthly Impact Report template spike');
  console.log(`[spike-mir] Template: ${templatePath}`);
  console.log(`[spike-mir] Replace month label with: ${SPIKE_MONTH_LABEL}`);

  if (!fs.existsSync(templatePath)) {
    fail(
      `Template not found. Set MIR_TEMPLATE_PATH or place the reference file at:\n  ${DEFAULT_TEMPLATE}`,
    );
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const automizer = new Automizer({
    templateDir,
    outputDir,
    autoImportSlideMasters: true,
    removeExistingSlides: true,
    cleanup: true,
    verbosity: 1,
  });

  // loadRoot = output container; load(..., 'mir') = importable source slides from same file.
  const pres = automizer.loadRoot(templateFile).load(templateFile, 'mir');

  // Slide 1: replace visible month/year label (shape "Text 1" = "JUNE 2026" in reference).
  pres.addSlide('mir', 1, (slide) => {
    slide.modifyElement('Text 1', [ModifyTextHelper.setText(SPIKE_MONTH_LABEL)]);
  });

  // Slide 2: include notes slide unchanged from template.
  pres.addSlide('mir', 2);

  const outputPath = path.join(outputDir, OUTPUT_NAME);
  const summary = await pres.write(OUTPUT_NAME);

  console.log('[spike-mir] Template loaded: yes');
  console.log('[spike-mir] Text replacement attempted on shape "Text 1" (slide 1)');
  console.log(`[spike-mir] Output file: ${outputPath}`);
  console.log('[spike-mir] Write summary:', JSON.stringify(summary, null, 2));

  if (!fs.existsSync(outputPath)) {
    fail(`Expected output file was not created at ${outputPath}`);
  }

  const stats = fs.statSync(outputPath);
  console.log(`[spike-mir] Output size: ${stats.size} bytes`);

  const verify = await verifySlideText(outputPath, 'Text 1');

  console.log(
    `[spike-mir] Verified ${verify.slidePath ?? 'unknown slide'} "Text 1" content: "${verify.text}"`,
  );
  if (verify.text === SPIKE_MONTH_LABEL) {
    console.log('[spike-mir] Text replacement: SUCCESS');
  } else {
    console.log('[spike-mir] Text replacement: FAILED or unverified');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[spike-mir] Unhandled error:', err);
  process.exit(1);
});
