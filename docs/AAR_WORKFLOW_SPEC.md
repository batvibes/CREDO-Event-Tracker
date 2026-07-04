# CREDO After Action Report — Workflow & Visual Specification

**Document type:** Authoritative specification for the AAR feature  
**Visual model:** Official Navy CREDO After Action Report (uploaded reference)  
**Design principle:** The AAR Builder must look like an **interactive official briefing document**, not a web form or dashboard.

---

## 1. Design intent

The After Action Reports experience has two distinct modes:

| Mode | Feel | Analogy |
|------|------|---------|
| **Event Search** | Clean staff tool — filters, results, actions | Annex index to a briefing packet |
| **AAR Document** | Full-width letter-style report | The official AAR page itself |

Users should feel they are **opening and editing a report**, not filling out a CRUD form. Read-only content renders as **report text**. Only four AAR-specific fields behave as inline editable regions within the document.

---

## 2. Navigation & entry

**Path:** Sidebar → **Reports** → sub-tab **After Action Reports**

**Page chrome (outside document):**
- Reports H1 unchanged
- Subtitle: **After Action Reports**
- Sub-tabs: **Event Reports** | **After Action Reports** (Navy underline style, not pills)

**Default state on open:** Event Search screen (State A). Never open directly into a split-panel or side-by-side builder.

---

## 3. Screen states

### State A — Event Search (default)

**Purpose:** Find events eligible for an AAR.

**Layout (top → bottom):**
1. Section title: **FIND EVENTS**
2. Navy 4px divider
3. Filter toolbar
4. Results summary line
5. Results list (cards or clean table — see §6)
6. Empty state when no search run or no matches

**Primary actions:** **Search Events** (or **Find Events**)

**No AAR document visible.**

---

### State B — Search Results (populated)

Same as State A with results shown.

**Per-result actions** (exact button names):

| AAR status | Primary button label |
|------------|---------------------|
| No AAR started | **Create AAR** |
| Draft in progress (partial editable fields saved) | **Continue Draft** |
| Finalized (future; spec-ready now) | **View Final** |

Only one primary action per row (highest applicable state). Viewer role: replace with **View AAR** (read-only document, no editing).

**Optional secondary:** none on results row (keep clean).

**Bulk action (optional, later):** not in v1 unless explicitly needed — one event → one AAR document at a time.

---

### State C — AAR Document (builder)

**Purpose:** Edit the official AAR for one selected event.

**Entry:** User clicks **Create AAR**, **Continue Draft**, or **View Final** on a result row.

**Layout:**
- Full-width single column
- Gray canvas (`#E8EAED`) behind a centered **letter-width document** (8.5in max)
- Document is the only focus — no side panel, no parallel event table
- Top toolbar (outside document, above canvas):
  - **← Back to Events** (returns to State B, preserves last search)
  - Event context line: `{Event Type} · {Date} · {Command}` (muted)
  - If multiple events were in results, no multi-switcher in v1 — one document per navigation

**Bottom toolbar (outside document, below canvas):**
- **Back to Events** (secondary)
- Future slots (not v1): Preview, Export PDF, Mark Final — **do not show** until implemented

**Document itself:** State D content (editable report)

---

### State D — AAR Document (read-only / View Final / Viewer)

Same layout as State C, but:
- All four editable regions render as plain report text
- No focus rings, no input borders
- **View Final** and viewer mode use this presentation

---

### State E — Empty / no results

**Copy:** *No events match the selected filters.*  
**Style:** Italic, muted gray, centered in results area.  
**No illustration.**

---

### State F — Loading

**Copy:** *Loading events…* or *Loading report…*  
Brief, muted, inline — no spinner-heavy dashboard UI.

---

## 4. Workflow (exact sequence)

```
1. User opens Reports → After Action Reports
      ↓
2. Event Search screen (State A)
      ↓
3. User sets filters → clicks Search Events
      ↓
4. Results display (State B)
      ↓
5. User clicks Create AAR | Continue Draft | View Final
      ↓
6. Full-width AAR document opens (State C or D)
      ↓
7. User edits Cost, Attire, Travel Time, Lessons Learned (admin/editor only)
      → auto-save on blur
      ↓
8. User clicks Back to Events → returns to State B with filters/results preserved
```

---

## 5. Search fields

Mirror Event Reports filter types (separate `aar-*` controls — do not share DOM with Event Reports tab).

| Field | Control | Enabled when |
|-------|---------|--------------|
| **Filter Type** | Dropdown | Always |
| Calendar Year | Year dropdown | Filter = Calendar Year |
| Fiscal Year | Year dropdown | Filter = Fiscal Year |
| Month & Year | Month + Year dropdowns | Filter = Month & Year |
| Date Range | Start date + End date | Filter = Date Range |
| Command | Command dropdown | Filter = Command |
| Event Type | Event type dropdown | Filter = Event Type |

**Filter Type options:**
- Calendar Year
- Fiscal Year
- Month & Year
- Date Range
- Command
- Event Type

**Toolbar buttons:**

| Button | Style | Action |
|--------|-------|--------|
| **Search Events** | Primary (Navy fill) | Run filter, populate results |
| **Clear Filters** | Secondary (Navy outline) | Reset filters and results |

**Not included on search screen:** Export, Generate AAR (bulk), checkboxes (optional — prefer row actions over multi-select for v1).

---

## 6. Result card / row layout

**Preferred:** Clean **result rows** in a report-style table (not dashboard cards with shadows).

**Columns:**

| Column | Content |
|--------|---------|
| Date | Formatted event date or TBD |
| Event Type | Full type name |
| Command | Command or TBD |
| Location | Location or TBD |
| Sequence # | Computed AAR sequence (e.g. `010126`) — read-only preview |
| Status | `Not Started` / `Draft` / `Final` (badge text, flat) |
| Action | **Create AAR** / **Continue Draft** / **View Final** |

**Row styling:**
- Alternating `#FFFFFF` / `#F4F7FB`
- 1px `#DDE3EA` row separators
- No delete column, no checkboxes (v1)
- Hover: subtle `#FAFBFC` only

**Results header line:** `{n} events` left-aligned, muted small caps optional.

---

## 7. AAR document — exact sections

Document container: `<article class="aar-document">` — **8.5in × 11in proportion**, white `#FFFFFF`, 1px `#C8CDD3` border, light shadow on gray canvas.

Typography: **Arial / Helvetica**, **11pt** body, **1.45** line height (matches official print reference).

---

### Section 0 — Header

**Read-only. Not editable.**

```
[CREDO logo]     CREDO MCI WEST
                 AFTER ACTION REPORT
```

- Logo: small square (~42–48px), left
- Title block: right or center per official reference
- **CREDO MCI WEST** — bold, uppercase, navy `#00205B`
- **AFTER ACTION REPORT** — bold, uppercase, slightly smaller
- Bottom rule: **2px solid `#1F2937`** across full document width
- Padding below header: ~16–20px

---

### Section 1 — RMT INFORMATION

**Section title:** `RMT INFORMATION` — ALL CAPS, bold, navy, letter-spaced  
**Divider:** 4px navy bar under title

**Content:** Label / value rows (two-column grid). **All read-only.**

| Label | Source |
|-------|--------|
| Event Title | Derived: `{Event Type}` or stored title if added later |
| Event Type | `events.event_type` |
| Event Date(s) | `start_date`–`end_date` or single `date` |
| Command | `events.command` |
| Location | `events.location` |
| Facilitator(s) | `events.facilitators` |
| Staff | `events.staffing` |
| Point(s) of Contact | `events.poc` |
| Time | `events.time` (if present) |

**Presentation:** Left column = label (bold, small caps, ~9pt). Right column = value (regular 11pt). Empty values: blank line (not em dash in builder; em dash acceptable in View Final only).

---

### Section 2 — EVENT DESCRIPTION

**Section title:** `EVENT DESCRIPTION` + 4px navy divider

**Read-only.** One short narrative line describing the event instance (from event record or derived from type + command + date). Not the long template description — that belongs in Section 4.

---

### Section 3 — OBJECTIVES

**Section title:** `OBJECTIVES` + 4px navy divider

**Read-only.** Multi-paragraph prose from **event-type template** (`aar-content.js`). Renders as flowing report paragraphs — no textarea chrome.

---

### Section 4 — DESCRIPTION

**Section title:** `DESCRIPTION` + 4px navy divider

**Read-only.** Multi-paragraph prose from **event-type template**. Distinct from Objectives — longer event narrative per official reference.

---

### Section 5 — COST / ATTIRE / TRAVEL TIME

**Section title:** `COST / ATTIRE / TRAVEL TIME` + 4px navy divider

**Mixed:** Three labeled sub-fields in a compact block (official layout — may be single row of three columns or stacked label/value pairs per reference).

| Sub-field | Editable? | Save column |
|-----------|-----------|-------------|
| **Cost** | **Yes** (admin/editor) | `aar_cost` |
| **Attire** | **Yes** | `aar_attire` |
| **Travel Time** | **Yes** | `aar_travel_time` |

**Editable presentation in builder:**
- Looks like report text until focused
- On focus: faint `#FAFBFC` background, 1px `#DDE3EA` border
- Single line inputs only
- **Save on blur** — no Save button

**Read-only presentation:** Plain text, no box.

---

### Section 6 — LESSONS LEARNED

**Section title:** `LESSONS LEARNED` + 4px navy divider

**Editable:** **Yes** (admin/editor) — multi-line narrative block (~1–4 sentences intended)

| | |
|-|-|
| Save column | `aar_lessons_learned` |
| Control | Textarea styled as report paragraph block |
| Min height | ~80–120px |
| Save | On blur |

**Read-only:** Flowing paragraph text, full width.

---

### Section 7 — REQUIREMENTS

**Section title:** `REQUIREMENTS` + 4px navy divider

**Read-only.** Two sub-blocks:

| Sub-block | Content source |
|-----------|----------------|
| **CREDO Requirements** | Fixed template text |
| **Command Requirements** | Fixed template text (e.g. "Roster") |

Multi-line prose, no editing in builder.

---

### Section 8 — Footer

**Read-only.**

```
                                    Sequence No. 010126
```

- Right-aligned or centered per official reference
- **Sequence No.** label + computed 6-digit sequence
- Format: `[series][sequence][FY year suffix]` e.g. `010126`
- Tabular nums, bold
- Top border: 1px `#DDE3EA` separating footer from Requirements

---

## 8. Editable vs read-only summary

| Section / field | Read-only | Editable (admin/editor) |
|-----------------|-----------|-------------------------|
| Header | ✓ | |
| RMT INFORMATION (all rows) | ✓ | |
| EVENT DESCRIPTION | ✓ | |
| OBJECTIVES | ✓ | |
| DESCRIPTION | ✓ | |
| Cost | | ✓ |
| Attire | | ✓ |
| Travel Time | | ✓ |
| Lessons Learned | | ✓ |
| REQUIREMENTS | ✓ | |
| Footer / Sequence # | ✓ | |

**Viewers:** entire document read-only; **View AAR** replaces **Create AAR**.

---

## 9. Visual styling rules

### Document canvas
- Background: `#E8EAED` (only behind letter page)
- Document: `#FFFFFF`, max-width **8.5in**, centered
- Padding: **0.65in** top, **0.75in** sides, **0.55in** bottom
- Font: Arial, Helvetica, Segoe UI fallback
- Body: **11pt**, line-height **1.45**, color `#111827`

### Section titles
- ALL CAPS, **700** weight, **#00205B**, letter-spacing **0.04–0.06em**
- 4px navy divider directly beneath
- 24–32px margin above section (except first after header)

### Label / value rows (RMT, Requirements)
- Label: **9–10pt**, bold, uppercase or small caps, `#00205B`
- Value: **11pt**, regular, `#111827`
- Grid: ~35% label / 65% value

### Editable regions (only four)
- Default: indistinguishable from report text (transparent, no border)
- Focus: `#FAFBFC` background, 1px `#DDE3EA` border, slight padding increase
- Never: green focus rings, large input boxes, floating labels, placeholder-heavy form UI

### Buttons (outside document)
- **Primary:** Navy `#00205B` fill, white text — **Search Events**
- **Secondary:** White fill, 1px navy border — **Clear Filters**, **Back to Events**
- **Row action:** Small navy outline — **Create AAR** / **Continue Draft** / **View Final**
- No large red buttons; no icon-only actions on results

### Sub-tabs
- Bottom border active indicator in navy
- ALL CAPS or small caps labels
- No pill backgrounds

### Alignment with CREDO UI Style Guide
- Document layout, not cards
- Navy structure, flat surfaces
- No KPI tiles, no shadow-heavy widgets on AAR screens
- Consistent with Team / MIR report section language

---

## 10. What must be avoided

| Avoid | Why |
|-------|-----|
| Side-by-side event table + builder | Current prototype; not official workflow |
| Web form layout (stacked labels above inputs for all fields) | Breaks report illusion |
| Editing Objectives, Description, Requirements, RMT fields | Not in scope; templates + event data only |
| Disabled-gray inputs for read-only content | Use plain report text instead |
| Dashboard table for AAR document body | Document sections only |
| **Actions** column with delete/icons on document | Not applicable |
| Per-row **Generate AAR** inside a permanent left panel | Replace with search → results → row action |
| Modal dialogs for AAR editing | Full-page document only |
| Checkboxes + bulk Generate AAR (v1) | Adds app complexity; row actions sufficient |
| Inline `<style>` in HTML | Consolidate to stylesheet when built |
| Em dash placeholders in editable sections while typing | Blank until saved |
| Mixing Event Reports filter DOM with AAR filters | Causes regression risk |
| Showing Preview / PDF / Finalize buttons before built | Avoid dead controls |

---

## 11. Data & status rules (for implementation planning)

**Draft detection:** Event has any non-empty value in `aar_cost`, `aar_attire`, `aar_travel_time`, or `aar_lessons_learned` → show **Continue Draft** instead of **Create AAR**.

**Final detection:** Requires future `aar_finalized` column — until then, **View Final** hidden or deferred.

**Auto-populate on document open:** Pull latest event record + event-type templates; compute sequence number; render all read-only sections before user edits.

**Save scope:** Only the four editable fields write to DB on blur; no full-document save button.

---

## 12. Future states (document only — not v1 UI)

When implemented later, add without restructuring document:

- **Preview AAR** — read-only duplicate of document (separate screen)
- **Export PDF** — from Preview or document
- **Mark Final** — locks editable regions → **View Final**
- **AAR History Log** — separate sub-tab or annex list

These must not appear as placeholder buttons in the v1 builder toolbar.

---

## Summary

The official AAR experience is a **two-screen flow**: (1) a clean **Event Search** page with Navy-styled filters and result rows bearing **Create AAR / Continue Draft / View Final**, and (2) a **full-width letter document** with nine defined sections where only **Cost, Attire, Travel Time, and Lessons Learned** are editable inline. Everything else is report text from event data or templates, matching the uploaded official After Action Report layout — not a web form.
