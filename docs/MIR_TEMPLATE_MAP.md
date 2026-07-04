# Monthly Impact Report — PowerPoint Template Map

**Document type:** Template inventory (no implementation)  
**Template file inventoried:** `CREDO-MCI-WEST-Monthly-Impact-Report-June-2026.pptx`  
**Location at inventory time:** `~/Downloads/CREDO-MCI-WEST-Monthly-Impact-Report-June-2026.pptx`  
**Slide count:** 2  
**Slide size:** 13.33″ × 7.5″ (standard widescreen)  
**Slide master:** `slideMaster1` (blank — no embedded text or images on master/layout)  
**Embedded media:** None (`ppt/media/` empty)  
**Charts:** None (no chart objects on any slide)

---

## Legend

| Column | Meaning |
|---|---|
| **Shape name** | PowerPoint Selection Pane name (`Alt+F10`) |
| **Static / Dynamic** | Whether export should leave content unchanged or populate from application data |
| **Data source** | Where dynamic values come from today or in planned export |
| **Future field** | Proposed application/export field identifier |

---

## Slide 1 — Monthly Impact Report (data slide)

### Document header

---

#### `report_title`

| | |
|---|---|
| **Shape name** | `Text 0` |
| **Type** | Title text box |
| **Current text** | `CREDO MCI WEST MONTHLY IMPACT REPORT` |
| **Purpose** | Main presentation title |
| **Static / Dynamic** | **Static** |
| **Data source** | Fixed branding copy |
| **Future field** | `mir.reportTitle` (static constant) |

---

#### `month_label`

| | |
|---|---|
| **Shape name** | `Text 1` |
| **Type** | Subtitle text box |
| **Current text** | `JUNE 2026` |
| **Purpose** | Report period label |
| **Static / Dynamic** | **Dynamic** |
| **Data source** | Selected Month + Year (`MIR_MONTH_NAMES[month]` + `year`) |
| **Future field** | `mir.monthLabel` → e.g. `"JULY 2026"` |

---

### Section 1 — Reach + Mission Support

---

#### `section1_banner_bg`

| | |
|---|---|
| **Shape name** | `Shape 2` |
| **Type** | Decorative rectangle (navy section banner background) |
| **Current text** | *(none)* |
| **Purpose** | Visual section divider / banner fill |
| **Static / Dynamic** | **Static** |
| **Data source** | Template styling |
| **Future field** | — (preserve as-is) |

---

#### `section1_header`

| | |
|---|---|
| **Shape name** | `Text 3` |
| **Type** | Section header text box |
| **Current text** | `1. REACH + MISSION SUPPORT` |
| **Purpose** | Section 1 title |
| **Static / Dynamic** | **Static** |
| **Data source** | Fixed section label |
| **Future field** | `mir.section1.title` (static constant) |

---

#### `table_month_reach` — Table `Table 0`

Left panel. Two columns: label | value.

| Future field | Cell (row, col) | Current label | Current value | Static / Dynamic | Data source |
|---|---|---|---|---|---|
| `mir.monthReach.header` | r0c0 | `Month Reach` | *(empty r0c1)* | Static label | Fixed panel title |
| `mir.monthReach.commandsSupported` | r1c0–c1 | `Commands Supported` | `2` | Dynamic value | `calculateMirSection1Data().monthReach.commandsSupported` |
| `mir.monthReach.beneficiariesServed` | r2c0–c1 | `Beneficiaries Served` | `0` | Dynamic value | `calculateMirSection1Data().monthReach.beneficiariesServed` |
| `mir.monthReach.workshopsConducted` | r3c0–c1 | `Workshops Conducted` | `2` | Dynamic value | `calculateMirSection1Data().monthReach.workshopsConducted` |
| `mir.monthReach.retreatsConducted` | r4c0–c1 | `Retreats Conducted` | `0` | Dynamic value | `calculateMirSection1Data().monthReach.retreatsConducted` |

Row labels (r1c0–r4c0) are **static**. Value cells (r1c1–r4c1) are **dynamic**.

---

#### `table_fytd_mission_support` — Table `Table 1`

Right panel. Two columns: label | value.

| Future field | Cell (row, col) | Current label | Current value | Static / Dynamic | Data source |
|---|---|---|---|---|---|
| `mir.fytd.header` | r0c0 | `FYTD Mission Support` | *(empty r0c1)* | Static label | Fixed panel title |
| `mir.fytd.suicidePrevention` | r1c0–c1 | `SUICIDE PREVENTION` | `25` | Dynamic value | `calculateMirSection1Data().fytdMissionSupport.suicidePrevention` |
| `mir.fytd.personalGrowth` | r2c0–c1 | `PERSONAL GROWTH` | `11` | Dynamic value | `calculateMirSection1Data().fytdMissionSupport.personalGrowth` |
| `mir.fytd.marriageEnrichment` | r3c0–c1 | `MARRIAGE ENRICHMENT` | `16` | Dynamic value | `calculateMirSection1Data().fytdMissionSupport.marriageEnrichment` |
| `mir.fytd.retreats` | r4c0–c1 | `RETREATS` | `4` | Dynamic value | `calculateMirSection1Data().fytdMissionSupport.retreats` |
| `mir.fytd.total` | r5c0–c1 | `FYTD Total` | `56` | Dynamic value | `calculateMirSection1Data().fytdMissionSupport.fytdTotal` |
| `mir.fytd.commands` | r6c0–c1 | `Commands` | `28` | Dynamic value | `calculateMirSection1Data().fytdMissionSupport.commands` |

Category row labels (r1c0–r4c0) are **static** (match `MIR_FYTD_CATEGORY_LABELS`). Value cells are **dynamic**.

---

### Section 2 — Manpower / Manning

---

#### `section2_banner_bg`

| | |
|---|---|
| **Shape name** | `Shape 4` |
| **Type** | Decorative rectangle (section banner background) |
| **Current text** | *(none)* |
| **Purpose** | Section 2 banner fill |
| **Static / Dynamic** | **Static** |
| **Data source** | Template styling |
| **Future field** | — |

---

#### `section2_header`

| | |
|---|---|
| **Shape name** | `Text 5` |
| **Type** | Section header text box |
| **Current text** | `2. MANPOWER / MANNING` |
| **Purpose** | Section 2 title |
| **Static / Dynamic** | **Static** |
| **Data source** | Fixed section label |
| **Future field** | `mir.section2.title` (static constant) |

---

#### `section2_body`

| | |
|---|---|
| **Shape name** | `Text 6` |
| **Type** | Body text box |
| **Current text** | `Manpower / manning summary placeholder — detailed metrics and notes will be added in a future release.` |
| **Purpose** | Manpower summary area (metrics not yet defined in app) |
| **Static / Dynamic** | **Dynamic** *(planned)* |
| **Data source** | **Not implemented.** Future: Team / Manpower module summary or auto-generated metrics |
| **Future field** | `mir.manpower.summary` |

---

### Section 3 — Readiness Outcomes (FYTD)

---

#### `section3_banner_bg`

| | |
|---|---|
| **Shape name** | `Shape 7` |
| **Type** | Decorative rectangle (section banner background) |
| **Current text** | *(none)* |
| **Purpose** | Section 3 banner fill |
| **Static / Dynamic** | **Static** |
| **Data source** | Template styling |
| **Future field** | — |

---

#### `section3_header`

| | |
|---|---|
| **Shape name** | `Text 8` |
| **Type** | Section header text box |
| **Current text** | `3. READINESS OUTCOMES (FYTD) n = ___ assessments` |
| **Purpose** | Section 3 title; includes assessment count placeholder |
| **Static / Dynamic** | **Mixed** — prefix static; `n = ___ assessments` is dynamic placeholder |
| **Data source** | Title: static. Count: **Not implemented** (future post-event evaluation / assessment data) |
| **Future field** | `mir.section3.title` (static) + `mir.readiness.assessmentCount` (dynamic) |

---

#### `readiness_metric_1`

| | |
|---|---|
| **Shape name** | `Text 9` |
| **Type** | Metric text box (left of three) |
| **Current text** | `__%` |
| **Purpose** | Readiness outcome percentage #1 |
| **Static / Dynamic** | **Dynamic** *(planned)* |
| **Data source** | **Not implemented.** Future: readiness / evaluation metrics |
| **Future field** | `mir.readiness.metric1Percent` |

---

#### `readiness_metric_2`

| | |
|---|---|
| **Shape name** | `Text 10` |
| **Type** | Metric text box (center) |
| **Current text** | `__%` |
| **Purpose** | Readiness outcome percentage #2 |
| **Static / Dynamic** | **Dynamic** *(planned)* |
| **Data source** | **Not implemented.** |
| **Future field** | `mir.readiness.metric2Percent` |

---

#### `readiness_metric_3`

| | |
|---|---|
| **Shape name** | `Text 11` |
| **Type** | Metric text box (right) |
| **Current text** | `__%` |
| **Purpose** | Readiness outcome percentage #3 |
| **Static / Dynamic** | **Dynamic** *(planned)* |
| **Data source** | **Not implemented.** |
| **Future field** | `mir.readiness.metric3Percent` |

---

#### `readiness_assessment_count`

| | |
|---|---|
| **Shape name** | `Text 12` |
| **Type** | Sub-label text box |
| **Current text** | `n = ___ assessments` |
| **Purpose** | Assessment sample size (duplicate of count in section header) |
| **Static / Dynamic** | **Dynamic** *(planned)* |
| **Data source** | **Not implemented.** Same as `mir.readiness.assessmentCount` |
| **Future field** | `mir.readiness.assessmentCountLabel` → e.g. `"n = 42 assessments"` |

---

### Section 4 — Command Highlights (Month)

---

#### `section4_banner_bg`

| | |
|---|---|
| **Shape name** | `Shape 13` |
| **Type** | Decorative rectangle (section banner background) |
| **Current text** | *(none)* |
| **Purpose** | Section 4 banner fill |
| **Static / Dynamic** | **Static** |
| **Data source** | Template styling |
| **Future field** | — |

---

#### `section4_header`

| | |
|---|---|
| **Shape name** | `Text 14` |
| **Type** | Section header text box |
| **Current text** | `4. COMMAND HIGHLIGHTS (MONTH)` |
| **Purpose** | Section 4 title |
| **Static / Dynamic** | **Static** |
| **Data source** | Fixed section label |
| **Future field** | `mir.section4.title` (static constant) |

---

#### `photo_frame_1`

| | |
|---|---|
| **Shape name** | `Shape 15` |
| **Type** | Photo frame rectangle (border/background) |
| **Current text** | *(none)* |
| **Purpose** | Fixed-ratio frame for command highlight photo #1 |
| **Static / Dynamic** | **Static** (frame geometry); paired image is dynamic |
| **Data source** | Template styling |
| **Future field** | — (preserve frame) |

---

#### `photo_slot_1_label`

| | |
|---|---|
| **Shape name** | `Text 16` |
| **Type** | Photo placeholder label (over frame 1) |
| **Current text** | `Photo placeholder` |
| **Purpose** | Placeholder label until photo inserted |
| **Static / Dynamic** | **Dynamic** — replace with image or clear on export |
| **Data source** | **Not implemented.** Future: Monthly Report photo upload #1 |
| **Future field** | `mir.photos[0]` |

---

#### `photo_frame_2`

| | |
|---|---|
| **Shape name** | `Shape 17` |
| **Type** | Photo frame rectangle |
| **Current text** | *(none)* |
| **Purpose** | Frame for command highlight photo #2 |
| **Static / Dynamic** | **Static** (frame) |
| **Data source** | Template styling |
| **Future field** | — |

---

#### `photo_slot_2_label`

| | |
|---|---|
| **Shape name** | `Text 18` |
| **Type** | Photo placeholder label (over frame 2) |
| **Current text** | `Photo placeholder` |
| **Purpose** | Placeholder label until photo inserted |
| **Static / Dynamic** | **Dynamic** |
| **Data source** | **Not implemented.** Future: Monthly Report photo upload #2 |
| **Future field** | `mir.photos[1]` |

---

#### `photo_frame_3`

| | |
|---|---|
| **Shape name** | `Shape 19` |
| **Type** | Photo frame rectangle |
| **Current text** | *(none)* |
| **Purpose** | Frame for command highlight photo #3 |
| **Static / Dynamic** | **Static** (frame) |
| **Data source** | Template styling |
| **Future field** | — |

---

#### `photo_slot_3_label`

| | |
|---|---|
| **Shape name** | `Text 20` |
| **Type** | Photo placeholder label (over frame 3) |
| **Current text** | `Photo placeholder` |
| **Purpose** | Placeholder label until photo inserted |
| **Static / Dynamic** | **Dynamic** |
| **Data source** | **Not implemented.** Future: Monthly Report photo upload #3 |
| **Future field** | `mir.photos[2]` |

---

### Footer

---

#### `report_footer`

| | |
|---|---|
| **Shape name** | `Text 21` |
| **Type** | Footer text box |
| **Current text** | `Source: CREDO Impact Tracker & Post-Event Evaluations` |
| **Purpose** | Data attribution / source line |
| **Static / Dynamic** | **Static** |
| **Data source** | Fixed attribution copy |
| **Future field** | `mir.footerSource` (static constant) |

---

## Slide 2 — Notes page

### Document header

---

#### `notes_report_title`

| | |
|---|---|
| **Shape name** | `Text 0` |
| **Type** | Title text box |
| **Current text** | `CREDO MCI WEST MONTHLY IMPACT REPORT` |
| **Purpose** | Same title as Slide 1 |
| **Static / Dynamic** | **Static** |
| **Data source** | Fixed branding copy |
| **Future field** | `mir.reportTitle` (static constant) |

---

#### `notes_month_label`

| | |
|---|---|
| **Shape name** | `Text 1` |
| **Type** | Subtitle text box |
| **Current text** | `JUNE 2026 — NOTES` |
| **Purpose** | Report period + notes page indicator |
| **Static / Dynamic** | **Dynamic** |
| **Data source** | Selected Month + Year + static suffix `" — NOTES"` |
| **Future field** | `mir.notesMonthLabel` → e.g. `"JULY 2026 — NOTES"` |

---

### Notes — Reach + Mission Support

---

#### `notes_section1_header`

| | |
|---|---|
| **Shape name** | `Text 2` |
| **Type** | Section header text box |
| **Current text** | `REACH + MISSION SUPPORT — NOTES` |
| **Purpose** | Notes section 1 label |
| **Static / Dynamic** | **Static** |
| **Data source** | Fixed section label |
| **Future field** | `mir.notes.section1.title` (static constant) |

---

#### `notes_section1_frame`

| | |
|---|---|
| **Shape name** | `Shape 3` |
| **Type** | Notes body frame rectangle |
| **Current text** | *(none)* |
| **Purpose** | Bordered area for Section 1 notes |
| **Static / Dynamic** | **Static** |
| **Data source** | Template styling |
| **Future field** | — |

---

#### `notes_reach_body`

| | |
|---|---|
| **Shape name** | `Text 4` |
| **Type** | Notes body text box |
| **Current text** | `testing` |
| **Purpose** | User-authored Reach + Mission Support notes |
| **Static / Dynamic** | **Dynamic** |
| **Data source** | `monthly_reports.reach_notes` (Draft Report field 1) |
| **Future field** | `mir.notes.reachNotes` |

---

### Notes — Manpower / Manning

---

#### `notes_section2_header`

| | |
|---|---|
| **Shape name** | `Text 5` |
| **Type** | Section header text box |
| **Current text** | `MANPOWER / MANNING — NOTES` |
| **Purpose** | Notes section 2 label |
| **Static / Dynamic** | **Static** |
| **Data source** | Fixed section label |
| **Future field** | `mir.notes.section2.title` (static constant) |

---

#### `notes_section2_frame`

| | |
|---|---|
| **Shape name** | `Shape 6` |
| **Type** | Notes body frame rectangle |
| **Current text** | *(none)* |
| **Purpose** | Bordered area for Section 2 notes |
| **Static / Dynamic** | **Static** |
| **Data source** | Template styling |
| **Future field** | — |

---

#### `notes_manpower_body`

| | |
|---|---|
| **Shape name** | `Text 7` |
| **Type** | Notes body text box |
| **Current text** | `Enter manpower / manning notes.` |
| **Purpose** | User-authored Manpower / Manning notes |
| **Static / Dynamic** | **Dynamic** |
| **Data source** | `monthly_reports.manpower_notes` (Draft Report field 2) |
| **Future field** | `mir.notes.manpowerNotes` |

---

### Notes — Readiness Outcomes

---

#### `notes_section3_header`

| | |
|---|---|
| **Shape name** | `Text 8` |
| **Type** | Section header text box |
| **Current text** | `READINESS OUTCOMES — NOTES` |
| **Purpose** | Notes section 3 label |
| **Static / Dynamic** | **Static** |
| **Data source** | Fixed section label |
| **Future field** | `mir.notes.section3.title` (static constant) |

---

#### `notes_section3_frame`

| | |
|---|---|
| **Shape name** | `Shape 9` |
| **Type** | Notes body frame rectangle |
| **Current text** | *(none)* |
| **Purpose** | Bordered area for Section 3 notes |
| **Static / Dynamic** | **Static** |
| **Data source** | Template styling |
| **Future field** | — |

---

#### `notes_readiness_body`

| | |
|---|---|
| **Shape name** | `Text 10` |
| **Type** | Notes body text box |
| **Current text** | `Enter readiness outcomes notes.` |
| **Purpose** | User-authored Readiness Outcomes notes |
| **Static / Dynamic** | **Dynamic** |
| **Data source** | `monthly_reports.readiness_notes` (Draft Report field 3) |
| **Future field** | `mir.notes.readinessNotes` |

---

### Notes — Command Highlights

---

#### `notes_section4_header`

| | |
|---|---|
| **Shape name** | `Text 11` |
| **Type** | Section header text box |
| **Current text** | `COMMAND HIGHLIGHTS — NOTES` |
| **Purpose** | Notes section 4 label |
| **Static / Dynamic** | **Static** |
| **Data source** | Fixed section label |
| **Future field** | `mir.notes.section4.title` (static constant) |

---

#### `notes_section4_frame`

| | |
|---|---|
| **Shape name** | `Shape 12` |
| **Type** | Notes body frame rectangle |
| **Current text** | *(none)* |
| **Purpose** | Bordered area for Section 4 notes |
| **Static / Dynamic** | **Static** |
| **Data source** | Template styling |
| **Future field** | — |

---

#### `notes_highlights_body`

| | |
|---|---|
| **Shape name** | `Text 13` |
| **Type** | Notes body text box |
| **Current text** | `Enter command highlights notes.` |
| **Purpose** | User-authored Command Highlights notes |
| **Static / Dynamic** | **Dynamic** |
| **Data source** | `monthly_reports.command_highlights_notes` (Draft Report field 4) |
| **Future field** | `mir.notes.commandHighlightsNotes` |

---

## Inventory summary

| Category | Slide 1 | Slide 2 | Total |
|---|---:|---:|---:|
| Title text boxes | 1 | 1 | 2 |
| Subtitle text boxes | 1 | 1 | 2 |
| Section header text boxes | 4 | 4 | 8 |
| Footer text boxes | 1 | 0 | 1 |
| Body / metric text boxes | 5 | 4 | 9 |
| Photo placeholder labels | 3 | 0 | 3 |
| Tables | 2 | 0 | 2 |
| Table data cells (dynamic values) | 9 | 0 | 9 |
| Photo frame shapes | 3 | 0 | 3 |
| Section banner / notes frame shapes | 4 | 4 | 8 |
| Embedded images (`p:pic`) | 0 | 0 | 0 |
| Charts | 0 | 0 | 0 |

---

## Dynamic vs static summary

| Status | Count | Objects |
|---|---:|---|
| **Static** | 28 | Titles, section headers, footer, banner/frame shapes, table row labels, panel headers |
| **Dynamic — implemented today** | 14 | `month_label`, `notes_month_label`, both tables (9 values), four notes bodies |
| **Dynamic — planned / not in app** | 8 | Manpower summary, 3 readiness %, assessment count (×2), 3 photo slots |

---

## Application data source reference

### Implemented today

| Future field | Application source |
|---|---|
| `mir.monthLabel` | `#mir-draft-month` + `#mir-draft-year` |
| `mir.notesMonthLabel` | Same + `" — NOTES"` suffix |
| `mir.monthReach.*` | `calculateMirSection1Data(month, year).monthReach` |
| `mir.fytd.*` | `calculateMirSection1Data(month, year).fytdMissionSupport` |
| `mir.notes.reachNotes` | `monthly_reports.reach_notes` |
| `mir.notes.manpowerNotes` | `monthly_reports.manpower_notes` |
| `mir.notes.readinessNotes` | `monthly_reports.readiness_notes` |
| `mir.notes.commandHighlightsNotes` | `monthly_reports.command_highlights_notes` |

### Not implemented (template placeholders only)

| Future field | Planned source |
|---|---|
| `mir.manpower.summary` | Team / Manpower module (TBD) |
| `mir.readiness.metric1Percent` | Post-event evaluations / readiness data (TBD) |
| `mir.readiness.metric2Percent` | Post-event evaluations / readiness data (TBD) |
| `mir.readiness.metric3Percent` | Post-event evaluations / readiness data (TBD) |
| `mir.readiness.assessmentCount` | Assessment records (TBD) |
| `mir.photos[0..2]` | Monthly Report photo uploads (TBD) |

---

## Export implementation notes (for future use only)

1. **Shape names are generic** (`Text 0`, `Table 0`, etc.). Consider renaming in PowerPoint Selection Pane before production export for maintainability — e.g. `mir_month_label`, `mir_table_month_reach`.
2. **Photo slots are text labels + rectangles**, not native picture placeholders or embedded images. Export should replace `Text 16/18/20` with images via image relation swap (pptx-automizer `ModifyImageHelper`) or hide labels after insertion.
3. **Table cells are not individually named** — export must target `Table 0` / `Table 1` by shape name and update cells by row index.
4. **No charts or embedded media** exist in the current template; adding either requires re-inventory.
5. **Slide master is blank** — all visible content lives on the two slides themselves.

---

*Generated from OOXML inspection of the reference template. No template or application files were modified.*
