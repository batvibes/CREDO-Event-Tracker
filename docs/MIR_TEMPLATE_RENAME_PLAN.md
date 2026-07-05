# Monthly Impact Report — Template Shape Rename Plan

**Document type:** Rename plan only (no template or code changes yet)  
**Based on:** `docs/MIR_TEMPLATE_MAP.md`  
**Template:** `CREDO-MCI-WEST-Monthly-Impact-Report-June-2026.pptx`

---

## Purpose

Before template-based export is implemented, every **dynamic** object in the master PowerPoint should have a stable, developer-friendly name. Export code (e.g. pptx-automizer) targets shapes by Selection Pane name (`Alt+F10` → double-click name → `F2`).

This plan lists **only dynamic objects** — shapes whose content export will populate from application data.

---

## Naming rules

| Rule | Example |
|---|---|
| Prefix | `mir_` |
| Case | lowercase `snake_case` |
| Be specific | `mir_month_label` not `mir_text_1` |
| Tables | Rename the **table shape**; cells are updated by row index (cells cannot be named in PowerPoint) |
| Slide scope | Names are unique **per slide** today; use distinct names on each slide anyway to avoid confusion |

---

## How to rename in PowerPoint (when ready)

1. Open the template in PowerPoint.
2. Press `Alt+F10` to open the **Selection Pane**.
3. Click the shape, then press `F2` (or double-click the name in the pane).
4. Type the **Proposed new shape name** from this plan.
5. Save the template. Do not change layout, text, or formatting during rename-only pass.

---

## Slide 1 — Data slide (dynamic objects)

### Month / year label

| | |
|---|---|
| **Current shape name** | `Text 1` |
| **Current content** | `JUNE 2026` |
| **Proposed new shape name** | `mir_month_label` |
| **Data source** | Selected month + year — `MIR_MONTH_NAMES[month]` + `year` (Draft Report month/year selectors) |
| **Notes** | Spike-confirmed target for pptx-automizer `modifyElement()`. Format: uppercase month name + space + year, e.g. `JULY 2026`. |

---

### Month Reach table

| | |
|---|---|
| **Current shape name** | `Table 0` |
| **Current content** | See cell table below |
| **Proposed new shape name** | `mir_month_reach_table` |
| **Data source** | `calculateMirSection1Data(month, year).monthReach` |
| **Notes** | Rename the table graphic frame only. Value cells (column 2) are updated by **row index** after export targets `mir_month_reach_table`. Row 0 header and column 1 labels stay static. |

| Row | Current label (col 1) | Current value (col 2) | Export updates col 2 from |
|---:|---|---|---|
| 0 | `Month Reach` | *(empty)* | — (static header) |
| 1 | `Commands Supported` | `2` | `.monthReach.commandsSupported` |
| 2 | `Beneficiaries Served` | `0` | `.monthReach.beneficiariesServed` |
| 3 | `Workshops Conducted` | `2` | `.monthReach.workshopsConducted` |
| 4 | `Retreats Conducted` | `0` | `.monthReach.retreatsConducted` |

---

### FYTD Mission Support table

| | |
|---|---|
| **Current shape name** | `Table 1` |
| **Current content** | See cell table below |
| **Proposed new shape name** | `mir_fytd_mission_support_table` |
| **Data source** | `calculateMirSection1Data(month, year).fytdMissionSupport` |
| **Notes** | Rename the table graphic frame only. Category labels (col 1, rows 1–4) match `MIR_FYTD_CATEGORY_LABELS` and remain static. |

| Row | Current label (col 1) | Current value (col 2) | Export updates col 2 from |
|---:|---|---|---|
| 0 | `FYTD Mission Support` | *(empty)* | — (static header) |
| 1 | `SUICIDE PREVENTION` | `25` | `.fytdMissionSupport.suicidePrevention` |
| 2 | `PERSONAL GROWTH` | `11` | `.fytdMissionSupport.personalGrowth` |
| 3 | `MARRIAGE ENRICHMENT` | `16` | `.fytdMissionSupport.marriageEnrichment` |
| 4 | `RETREATS` | `4` | `.fytdMissionSupport.retreats` |
| 5 | `FYTD Total` | `56` | `.fytdMissionSupport.fytdTotal` |
| 6 | `Commands` | `28` | `.fytdMissionSupport.commands` |

---

### Manpower summary body

| | |
|---|---|
| **Current shape name** | `Text 6` |
| **Current content** | `Manpower / manning summary placeholder — detailed metrics and notes will be added in a future release.` |
| **Proposed new shape name** | `mir_manpower_summary` |
| **Data source** | **Not implemented.** Future: Team / Manpower module auto-summary |
| **Notes** | Distinct from Slide 2 notes (`mir_notes_manpower`). This is the Slide 1 metrics/summary area. Rename now so export is ready when manpower metrics exist. |

---

### Readiness — section header (includes assessment placeholder)

| | |
|---|---|
| **Current shape name** | `Text 8` |
| **Current content** | `3. READINESS OUTCOMES (FYTD) n = ___ assessments` |
| **Proposed new shape name** | `mir_readiness_section_header` |
| **Data source** | **Mixed.** Prefix `3. READINESS OUTCOMES (FYTD)` is static. `n = ___ assessments` portion is dynamic (future assessment count). |
| **Notes** | Option A: use tagged text replace (`{{mir_assessment_count}}`) inside this shape. Option B (future): split into static header + `mir_readiness_assessment_count` sub-label. For rename-only pass, one shape name is sufficient. |

---

### Readiness — percentage placeholders

| Current shape name | Current content | Proposed new shape name | Data source | Notes |
|---|---|---|---|---|
| `Text 9` | `__%` | `mir_readiness_percent_1` | **Not implemented.** Future post-event evaluation metric #1 | Leftmost metric box |
| `Text 10` | `__%` | `mir_readiness_percent_2` | **Not implemented.** Future post-event evaluation metric #2 | Center metric box |
| `Text 11` | `__%` | `mir_readiness_percent_3` | **Not implemented.** Future post-event evaluation metric #3 | Rightmost metric box |

---

### Readiness — assessment count (sub-label)

| | |
|---|---|
| **Current shape name** | `Text 12` |
| **Current content** | `n = ___ assessments` |
| **Proposed new shape name** | `mir_readiness_assessment_count` |
| **Data source** | **Not implemented.** Future assessment record count |
| **Notes** | Duplicates count also embedded in `mir_readiness_section_header`. Export should set **both** to the same value, or consolidate to one shape in a later template revision. |

---

### Photo placeholders (Command Highlights)

Photo slots are **text labels over static frame rectangles**. Export will inject images and hide or clear the label.

| Current shape name | Current content | Proposed new shape name | Data source | Notes |
|---|---|---|---|---|
| `Text 16` | `Photo placeholder` | `mir_photo_slot_1` | **Not implemented.** Future: monthly report photo upload #1 | Paired frame: `Shape 15` (optional static rename: `mir_photo_frame_1`) |
| `Text 18` | `Photo placeholder` | `mir_photo_slot_2` | **Not implemented.** Future: monthly report photo upload #2 | Paired frame: `Shape 17` (optional: `mir_photo_frame_2`) |
| `Text 20` | `Photo placeholder` | `mir_photo_slot_3` | **Not implemented.** Future: monthly report photo upload #3 | Paired frame: `Shape 19` (optional: `mir_photo_frame_3`) |

**Photo frame shapes (`Shape 15`, `Shape 17`, `Shape 19`)** are static geometry but renaming them to `mir_photo_frame_1` … `_3` is recommended during the same pass — export may use frame bounds for image sizing even though frames carry no dynamic text.

---

## Slide 2 — Notes slide (dynamic objects)

### Month / year notes subtitle

| | |
|---|---|
| **Current shape name** | `Text 1` |
| **Current content** | `JUNE 2026 — NOTES` |
| **Proposed new shape name** | `mir_notes_month_label` |
| **Data source** | Selected month + year + static suffix ` — NOTES` |
| **Notes** | Same month/year inputs as Slide 1 `mir_month_label`. Example output: `JULY 2026 — NOTES`. |

---

### Notes bodies

| Current shape name | Current content | Proposed new shape name | Data source | Notes |
|---|---|---|---|---|
| `Text 4` | `testing` | `mir_notes_reach` | `monthly_reports.reach_notes` | Draft Report field 1 — Reach + Mission Support Notes |
| `Text 7` | `Enter manpower / manning notes.` | `mir_notes_manpower` | `monthly_reports.manpower_notes` | Draft Report field 2 — Manpower / Manning Notes |
| `Text 10` | `Enter readiness outcomes notes.` | `mir_notes_readiness` | `monthly_reports.readiness_notes` | Draft Report field 3 — Readiness Outcomes Notes |
| `Text 13` | `Enter command highlights notes.` | `mir_notes_command_highlights` | `monthly_reports.command_highlights_notes` | Draft Report field 4 — Command Highlights Notes |

---

## Rename checklist (dynamic objects only)

Use this as the manual rename worksheet in PowerPoint.

### Slide 1 — 14 shape renames (+ 3 optional frames)

| ☐ | Current name | Proposed name |
|---|---|---|
| ☐ | `Text 1` | `mir_month_label` |
| ☐ | `Table 0` | `mir_month_reach_table` |
| ☐ | `Table 1` | `mir_fytd_mission_support_table` |
| ☐ | `Text 6` | `mir_manpower_summary` |
| ☐ | `Text 8` | `mir_readiness_section_header` |
| ☐ | `Text 9` | `mir_readiness_percent_1` |
| ☐ | `Text 10` | `mir_readiness_percent_2` |
| ☐ | `Text 11` | `mir_readiness_percent_3` |
| ☐ | `Text 12` | `mir_readiness_assessment_count` |
| ☐ | `Text 16` | `mir_photo_slot_1` |
| ☐ | `Text 18` | `mir_photo_slot_2` |
| ☐ | `Text 20` | `mir_photo_slot_3` |
| ☐ | `Shape 15` *(optional)* | `mir_photo_frame_1` |
| ☐ | `Shape 17` *(optional)* | `mir_photo_frame_2` |
| ☐ | `Shape 19` *(optional)* | `mir_photo_frame_3` |

### Slide 2 — 5 shape renames

| ☐ | Current name | Proposed name |
|---|---|---|
| ☐ | `Text 1` | `mir_notes_month_label` |
| ☐ | `Text 4` | `mir_notes_reach` |
| ☐ | `Text 7` | `mir_notes_manpower` |
| ☐ | `Text 10` | `mir_notes_readiness` |
| ☐ | `Text 13` | `mir_notes_command_highlights` |

**Total dynamic renames:** 19 required + 3 optional photo frames = **22 shapes**

---

## Objects intentionally not renamed

Static titles, section headers, footer, and decorative banner/frame shapes do **not** need developer-facing names unless export must target them. These remain unchanged in this plan:

- Slide 1: `Text 0`, `Text 3`, `Text 5`, `Text 14`, `Text 21`, `Shape 2`, `Shape 4`, `Shape 7`, `Shape 13`
- Slide 2: `Text 0`, `Text 2`, `Text 5`, `Text 8`, `Text 11`, `Shape 3`, `Shape 6`, `Shape 9`, `Shape 12`

If desired later, static objects can use `mir_static_` prefix (e.g. `mir_static_report_title`) — out of scope for this pass.

---

## After renaming — verification steps

1. Re-run template inventory against the renamed file and confirm all proposed names appear in the Selection Pane.
2. Update `docs/MIR_TEMPLATE_MAP.md` shape name column to match (separate task).
3. Update `scripts/spike-mir-template-export.js` to target `mir_month_label` instead of `Text 1` (separate task, when asked).
4. Store the renamed master template in repo or Supabase Storage as the canonical export source.

---

## Quick reference — proposed name → data source

| Proposed shape name | Data source |
|---|---|
| `mir_month_label` | Month/year selectors |
| `mir_month_reach_table` | `calculateMirSection1Data().monthReach` (rows 1–4, col 2) |
| `mir_fytd_mission_support_table` | `calculateMirSection1Data().fytdMissionSupport` (rows 1–6, col 2) |
| `mir_manpower_summary` | Team / Manpower module (TBD) |
| `mir_readiness_section_header` | Static prefix + dynamic assessment count (TBD) |
| `mir_readiness_percent_1` | Readiness metrics (TBD) |
| `mir_readiness_percent_2` | Readiness metrics (TBD) |
| `mir_readiness_percent_3` | Readiness metrics (TBD) |
| `mir_readiness_assessment_count` | Assessment records (TBD) |
| `mir_photo_slot_1` | Monthly report photo #1 (TBD) |
| `mir_photo_slot_2` | Monthly report photo #2 (TBD) |
| `mir_photo_slot_3` | Monthly report photo #3 (TBD) |
| `mir_notes_month_label` | Month/year selectors + ` — NOTES` |
| `mir_notes_reach` | `monthly_reports.reach_notes` |
| `mir_notes_manpower` | `monthly_reports.manpower_notes` |
| `mir_notes_readiness` | `monthly_reports.readiness_notes` |
| `mir_notes_command_highlights` | `monthly_reports.command_highlights_notes` |

---

*Plan only. No template, application, export, or database files were modified.*
