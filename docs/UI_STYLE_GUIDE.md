# CREDO Event Tracker — UI Style Guide

**Version:** 1.0  
**Status:** Official design standard for all future work  
**Reference product:** Navy CREDO Monthly Impact Report (MIR) and related staff briefing materials  

---

## 1. Overall Design Philosophy

### Visual identity

The CREDO Event Tracker is an **interactive Navy report**, not a SaaS dashboard. Every screen should read as a digital extension of official CREDO staff products: structured briefings, mission narrative, manpower tables, and export-ready content.

**Core principles:**
- **Document first** — Pages feel like briefing pages, not app panels.
- **Mission tone** — Professional, restrained, authoritative; no playful or consumer-app styling.
- **Content hierarchy** — Information is ranked like a staff report: title → section → subsection → data.
- **Export parity** — On-screen layout should closely match PDF/PPTX output so users trust what they see is what they brief.

### White space

- Generous margins inside report content areas (32–40px horizontal, 24–40px vertical between sections).
- Avoid cramming controls beside content; toolbars sit above sections, not inside them.
- One primary narrative column per page; secondary metadata may sit in narrow side areas only when necessary.
- Line height for body/narrative text: **1.5–1.6**; table text: **1.35–1.45**.

### Typography

| Role | Font | Size | Weight | Notes |
|------|------|------|--------|-------|
| Page title | Arial, Helvetica, Segoe UI | 1.5–1.75rem | 700 | Uppercase or title case; Navy blue |
| Section title | Same | 1.0–1.125rem | 700 | ALL CAPS, letter-spacing 0.04–0.06em |
| Subsection label | Same | 0.8125–0.875rem | 600 | Sentence case or small caps |
| Body / narrative | Same | 0.9375rem (15px) | 400 | Report paragraphs, notes |
| Table header | Same | 0.75rem (12px) | 700 | ALL CAPS, letter-spacing 0.04em |
| Table body | Same | 0.875rem (14px) | 400 | Name fields may be 700 |
| Meta / helper | Same | 0.8125rem | 400 | Muted gray, italic only for empty states |
| KPI / stat (when used) | Same | 1.5–2rem | 700 | Sparingly; prefer report tables over dashboard cards |

**Do not use:** Rounded consumer fonts, heavy display type, or system default stacks without the report sans-serif family above.

### Color palette

| Token | Hex | Usage |
|-------|-----|-------|
| **Navy primary** | `#00205B` | Section titles, primary dividers, table header accents |
| **Navy muted** | `#1A3A6B` | Secondary headings, hover on navy elements |
| **Text primary** | `#111827` / `#1A1A1A` | Names, primary content |
| **Text body** | `#1F2937` | Table cells, narrative |
| **Text secondary** | `#4B5563` | Billet, supporting labels |
| **Text muted** | `#6B7280` / `#5C6570` | Helpers, empty states |
| **Background page** | `#F4F6F8` | App canvas behind report document |
| **Background document** | `#FFFFFF` | Report page surface |
| **Row alternate** | `#F4F7FB` | Zebra striping in tables |
| **Header band** | `#EEF2F7` | Table header background |
| **Border light** | `#DDE3EA` | Row separators, subtle boxes |
| **Border standard** | `#C5CDD8` | Document edge, section breaks |
| **Focus ring** | Navy at 12% opacity | Editable field focus |
| **Destructive** | `#991B1B` | Delete hover, errors |
| **Destructive muted** | `#B0B8C4` | Delete icon default |
| **CREDO accent (legacy)** | `#343F1D` | Sidebar active state only; do not spread to report body |

**Green/red/yellow status pills** (Events operational tracking) remain functional but should be **visually isolated** to the Events tracker until that page is restyled; new report pages use report palette only.

### Border usage

- **Section divider:** 4px solid Navy primary, full width under section title.
- **Table header rule:** 2px solid Navy primary below header row.
- **Row separators:** 1px `#DDE3EA`.
- **Document container:** 1px `#DDE3EA` — flat, no drop shadow on report pages.
- **Avoid:** Heavy box shadows, thick rounded cards, colored left-border accents (generic dashboard trope).

### Section spacing

- **Between major sections on same page:** 40px.
- **Title to divider:** 12px.
- **Divider to content:** 20px.
- **Between subsections:** 24px.
- **Table to next element:** 16–20px.

---

## 2. Report Sections

### Section headers

- Format: **ALL CAPS**, Navy primary, bold, letter-spaced.
- Examples: `MANPOWER / MANNING`, `COMMAND HIGHLIGHTS NOTES`, `FYTD MISSION CATEGORIES`.
- Optional right-aligned utility action (e.g. “+ Add Team Member”) on same row as title, never competing with title weight.

### Divider lines

- Always a **thick Navy bar** (4px) directly under the section title.
- Do not use thin gray lines alone for major section breaks.
- Subsections may use a **1px light rule** only when nesting within a major section.

### Cards vs document layout

| Use **document layout** | Avoid **card layout** |
|-------------------------|------------------------|
| Team / Manpower | KPI tiles with shadows |
| AAR builder & preview | Floating white cards on gray |
| MIR draft editor | Rounded “widget” panels |
| Branding settings | Material-style elevation |
| History logs | Dashboard stat blocks |

**Document layout:** Single white report surface, flat border, internal sections separated by Navy dividers — not individual card per section.

**Exception:** Login modal and destructive confirmations may use minimal modal chrome; still flat, no heavy shadow.

---

## 3. Tables

### Report-style tables

- Full width within document margin.
- Fixed or proportional column widths defined per table type.
- Header row: light gray band (`#EEF2F7`), uppercase Navy labels, 2px Navy bottom border.
- No outer grid boxing; horizontal rules between rows only.
- Typography: bold for primary identifier (name), smaller secondary line beneath (billet/role).

### Editable tables

- Cells contain inline inputs that **look like report text** until focused.
- Default: transparent background, no visible border.
- Focus: light background `#FAFBFC`, 1px `#DDE3EA` border, minimal padding increase.
- Row-level actions (delete icon) sit at **far right of row**, not in a labeled “Actions” column.
- Save on blur; no per-cell Save buttons.

### Read-only tables

- Same layout as editable; fields render as plain text (no input chrome).
- No hover affordances implying editability.
- Viewer role: entire page read-only, not disabled-gray inputs.

### Hover behavior

- **Report tables:** Subtle row highlight optional (`#FAFBFC`); never bright blue selection bars.
- **Editable rows:** No hover required; focus state is sufficient.
- **Do not:** Full-row click-to-edit, aggressive hover color inverts.

### Alternate row backgrounds

- Odd rows: white.
- Even rows: `#F4F7FB`.
- Header and empty-state rows exempt.

### Empty states

- Single row, colspan full width.
- Centered, italic, muted gray (`#5C6570`).
- Copy brief and factual: *“No team members yet.”* / *“No reports for this period.”*
- No illustrations or large empty-state graphics.

---

## 4. Editable Fields

### Text fields

- Inline in tables and narrative blocks.
- Read appearance: bold (names) or regular (supporting text); no box.
- Edit appearance on focus only (see Editable tables).
- Placeholders: descriptive, gray, sentence case.

### Textareas

- Used for narrative sections (Command Highlights, AAR observations, MIR notes).
- Full width within document.
- Min height ~220px; vertical resize allowed.
- Default: borderless, sits on white like a report paragraph block.
- Focus: light gray background, thin border — still reads as narrative, not a form widget.

### Date fields

- When restyled: plain text display with calendar picker on focus.
- Format consistent with reports: `DD MMM YYYY` or ISO in data, formatted for display.
- No bulky browser-default styling; custom-styled to match report fields.

### Dropdowns

- Minimal: 1px border, square corners (2px radius max), Navy focus border.
- Used for filters and report parameters, not inside narrative blocks.
- Filter bars may remain utilitarian but should migrate toward report toolbar styling over time.

### Read-only mode

- Strip all borders and backgrounds from inputs.
- Cursor: default, not `not-allowed` unless field is temporarily locked mid-edit.
- Viewer role: hide all add/delete/edit controls entirely.

### Focus states

- Navy-tinted border or subtle background shift — never bright green accent rings.
- No animated glow or large box-shadow halos.
- Tab order: logical top-to-bottom, section-by-section.

---

## 5. Buttons

### Primary

- **Use:** Generate Report, Export PPTX/PDF, Mark Final, Sign In.
- Style: Navy fill `#00205B`, white text, 2px radius, no shadow.
- Hover: `#1A3A6B`.
- Label: action verb, title case or sentence case (not ALL CAPS).

### Secondary

- **Use:** Add Team Member, Clear Filters, Cancel.
- Style: White fill, 1px Navy border, Navy text.
- Hover: Navy fill, white text.
- Compact padding (7px 14px); must not dominate the page.

### Utility

- **Use:** Generate Report (filter bar), Refresh, Download CSV.
- Style: Outlined or text-only, muted until hover.
- Group in horizontal toolbars above tables, right-aligned where appropriate.

### Destructive

- **Use:** Delete row, Delete draft, Remove photo.
- **Never** a full red button in report body.
- Default: small trash icon, muted gray `#B0B8C4`.
- Hover: `#991B1B` with faint red wash background.
- Always confirm with explicit dialog for irreversible actions.

---

## 6. Icons

| Action | Treatment |
|--------|-----------|
| **Add** | `+` in secondary button label preferred over icon-only; if icon: simple line plus, 16px |
| **Delete** | Trash SVG, 14px, row-aligned far right; utility destructive styling |
| **Edit** | Pencil only when opening a distinct editor; inline edit has no icon |
| **Preview** | Eye or document icon, 16px, utility button beside Export |
| **Export** | Download or document-arrow; pairs with “Export PPTX” / “Export PDF” label |
| **Settings** | Gear in sidebar only; report pages use section titles, not gear icons |

**Rules:**
- Line icons only; no filled emoji-style icons.
- 14–16px in tables; 16–18px in toolbars.
- Always paired with `aria-label` when icon-only.
- Navy or muted gray default; never multicolor.

---

## 7. Navigation

### Sidebar

- Dark navy/slate background (existing) — **chrome only**, not report content.
- Logo + “CREDO / MCI West” at top.
- Nav items: Events, Calendar, Reports, Team, Settings (+ future MIR, AAR when added).
- Active item: CREDO green accent — acceptable as app chrome; report pages themselves stay white document.
- User email + Log out at bottom; minimal, not prominent.

### Page titles

- Main area header (outside report document): existing H1/H2 hierarchy may remain temporarily.
- **Report content** inside document uses **section titles** (MIR standard), not duplicate web page titles.
- Long term: page header becomes brief; report document carries the authoritative title.

### Sub-tabs

- Used for Draft / History, Builder / Preview / History.
- Style: underline or bottom-border active indicator in Navy — not pill tabs.
- ALL CAPS or small caps labels; flat, no rounded pill background.
- Sub-tabs sit directly above report document, separated by 1px rule from content.

### Toolbars

- Horizontal strip above a section or below sub-tabs.
- Contains filters (left), actions (right): Export, Mark Final, Add.
- Background: white or `#F4F7FB` band; 1px bottom border.
- Not floating; full width of report document.

---

## 8. Reports — Page Character

### Team / Manpower

- **Reference implementation direction** (current Team page restyle).
- Manpower table + Command Highlights narrative block.
- Feels like MIR manpower slide + notes slide combined into one scrollable briefing page.
- No legacy form fields; no “Settings panel” styling.

### After Action Reports (AAR)

- Single-event briefing document.
- Sections mirror AAR PDF structure: header block (event metadata), narrative blocks, lessons learned, sign-off.
- Builder mode: editable report sections on white document.
- Preview mode: exact PDF layout on screen (WYSIWYG).
- History: chronological log styled as annex table — date, event, finalized by, export link — not a generic data grid.

### Monthly Impact Reports (MIR)

- Primary reference for entire app visual language.
- Cover metadata (month, FY, command) in header band.
- Numbered or titled sections matching slide order: manpower, mission categories (FYTD), command highlights, photos.
- Draft editor: document with section dividers; photo slots as fixed-ratio frames (briefing slide proportions).
- Export button prominent but secondary styling; Mark Final uses primary Navy.
- History log: table of month/year, status (Draft/Final), created, actions — report table styling.

### Branding

- Settings sub-area but **report-styled**, not a generic upload form.
- Sections: Organization name, sidebar logo, PowerPoint logo paths.
- Preview thumbnails in fixed frames matching MIR usage.
- Reads as “report template configuration,” not “app theme picker.”

### History Logs

- Unified pattern across AAR and MIR:
  - Section title: `REPORT HISTORY` or `AAR HISTORY LOG`
  - Navy divider
  - Read-only report table
  - Row actions: Preview, Export (utility icons/text links) — no row delete unless admin policy allows
- Empty state: italic single line.

---

## 9. Consistency Rules

1. **All new pages** use document layout on white surface; sidebar is the only persistent dark chrome.
2. **Every major section** gets ALL CAPS Navy title + 4px Navy divider.
3. **All data tables** on report pages use report table spec (header band, zebra rows, thin separators).
4. **All inline editing** saves on blur; no Save/Cancel per field.
5. **Permissions** control visibility of controls, not disabled styling — viewers see clean read-only reports.
6. **Column headers** are uppercase; body content is sentence case except proper nouns.
7. **Actions column headers** are never used; row icons or toolbar buttons instead.
8. **Spacing tokens** from Section 1 apply globally; do not invent per-page margins.
9. **Export targets** (PDF/PPTX) define layout; UI changes must be checked against export fidelity.
10. **Migration path:** Events/Calendar/Reports retain current styling until explicitly restyled; new work must not copy their dashboard patterns into report modules.

---

## 10. Things to Avoid

- Generic SaaS dashboard: KPI cards, shadow cards, rounded widgets, colorful charts as decoration.
- Material Design / Bootstrap default look: heavy shadows, ripple effects, bright primary buttons everywhere.
- **Actions** columns in tables.
- Large red Delete buttons in report body.
- Pill-shaped tabs for report navigation.
- Form-heavy layouts (labels left, fields right) outside of modals.
- Disabled-gray read-only inputs for viewers.
- Emoji or colorful icons.
- Inter/font-only startup aesthetic without Navy structure.
- Competing title styles (web H1 + report section title saying the same thing).
- Per-page color experiments — stay on palette.
- Auto-save toast spam; errors use brief alert or inline message, not notification centers.
- Photo crop UIs that expose raw web-app chrome; photo editing stays in fixed briefing frames.

---

## Summary

The CREDO Event Tracker should feel like **opening a classified staff briefing packet on screen**: white pages, Navy structure, uppercase section discipline, tables that belong in a flag briefing, and controls that stay out of the way until needed. The Monthly Impact Report is the north star; Team / Manpower is the first implemented expression of this standard; AAR, MIR, Branding, and History modules must conform to this guide as they are built or restyled.
