# Jobbo — Figma Make Guidelines
**Version 1.0 · Confidential**

---

## 1. Project Overview

**Jobbo** is a dark-first, glassmorphic SaaS product for AI-powered CV tailoring and job application management. Every screen must feel polished, spacious, and modern — comparable to Linear, Vercel, or Raycast in visual quality.

All UI is built in **Figma Make**. Do not produce raw code files or manual editing instructions. Every response that touches UI must be a ready-to-paste Figma Make prompt.

---

## 2. Theming

### 2.1 Modes
- **Two modes:** Dark (default) and Light
- **Default on load:** Dark mode
- **Persistence:** Save user preference to `localStorage` key `jobbo-theme`
- **Switching:** Sun/moon icon button in the nav bar, top-right
- **Transition:** All colour changes animate with `transition: background 0.2s, color 0.2s, border-color 0.2s`
- **Implementation:** Use CSS custom properties (`var(--token-name)`) for every colour so the theme switches globally by toggling a class on `<html>` or `<body>`

### 2.2 Dark Mode Tokens

| Token | Value |
|---|---|
| `--bg` | `#0F172A` |
| `--surface` | `#1E293B` |
| `--surface-elevated` | `#263348` |
| `--glass-bg` | `rgba(30, 41, 59, 0.6)` |
| `--glass-border` | `1px solid rgba(148, 163, 184, 0.15)` |
| `--glass-blur` | `backdrop-filter: blur(12px)` |
| `--glass-shadow` | `0 4px 24px rgba(0, 0, 0, 0.4)` |
| `--text-primary` | `#F8FAFC` |
| `--text-secondary` | `#94A3B8` |
| `--border` | `rgba(148, 163, 184, 0.15)` |
| `--input-fill` | `#1E293B` |
| `--input-border` | `rgba(148, 163, 184, 0.2)` |

### 2.3 Light Mode Tokens

| Token | Value |
|---|---|
| `--bg` | `#F1F5F9` |
| `--surface` | `#FFFFFF` |
| `--surface-elevated` | `#F8FAFC` |
| `--glass-bg` | `rgba(255, 255, 255, 0.6)` |
| `--glass-border` | `1px solid rgba(148, 163, 184, 0.25)` |
| `--glass-blur` | `backdrop-filter: blur(12px)` |
| `--glass-shadow` | `0 4px 24px rgba(15, 23, 42, 0.08)` |
| `--text-primary` | `#0F172A` |
| `--text-secondary` | `#64748B` |
| `--border` | `rgba(148, 163, 184, 0.3)` |
| `--input-fill` | `#FFFFFF` |
| `--input-border` | `rgba(148, 163, 184, 0.35)` |

### 2.4 Shared Tokens (Same in Both Modes)

| Token | Value |
|---|---|
| `--brand` | `#1A56DB` |
| `--brand-dark` | `#1E40AF` |
| `--brand-light` | `#3B82F6` |
| `--success` | `#10B981` |
| `--warning` | `#F59E0B` |
| `--danger` | `#EF4444` |
| `--radius-card` | `12px` |
| `--radius-btn` | `8px` |
| `--radius-input` | `8px` |

---

## 3. Typography

All type uses **Inter** (import from Google Fonts).

| Role | Weight | Size | Notes |
|---|---|---|---|
| Display / Hero | 700 | 48–64px | Landing page headline |
| Page Title | 600 | 28–32px | Top of each screen |
| Section Header | 600 | 20–24px | Card titles, panel headers |
| Body | 400 | 14–16px | All paragraph and form text |
| Label / Caption | 500 | 12px | Uppercase, `letter-spacing: 0.05em` |
| Code | 400 | 13px | JetBrains Mono |

---

## 4. Colour Usage Rules

### Status / Semantic Colours
- **Green (`#10B981`)** — ATS match, offers, success states, matched skill chips
- **Amber (`#F59E0B`)** — Skills gap warnings, pending status, interview scheduled
- **Red (`#EF4444`)** — Rejections, errors, destructive actions
- **Blue (`#1A56DB`)** — Primary actions, active states, links, focus rings

### Application Status Colours (Kanban)
| Status | Colour |
|---|---|
| Saved | `#94A3B8` (slate) |
| Applied | `#3B82F6` (blue) |
| Interview Scheduled | `#F59E0B` (amber) |
| Interview Done | `#8B5CF6` (purple) |
| Offer | `#10B981` (green) |
| Rejected | `#EF4444` (red) |

---

## 5. Glass Effect Rules

Glass is a **core visual motif** in Jobbo. Apply it correctly:

### When to Use Glass
- Nav bar (always, both modes, sticky)
- Modals and side drawers
- Kanban cards on the dashboard
- Hero section cards / floating mockups on landing page
- Auth screen card
- Stat summary bar on dashboard

### When NOT to Use Glass
- CV editor form panels — use solid `--surface` for readability
- Data tables
- Inline text inputs
- Step cards inside the onboarding wizard body

### Glass Must Have Depth Behind It
Glass on a flat colour looks like nothing. Always ensure a layered background:
- **Dark mode:** deep navy radial/linear gradient (`#0F172A` → `#1E293B`) behind glass elements
- **Light mode:** soft gradient (`#F1F5F9` → `#EFF6FF` blue tint) behind glass elements

### Glass Component Spec
```
background: var(--glass-bg)
backdrop-filter: blur(12px)
-webkit-backdrop-filter: blur(12px)
border: var(--glass-border)
border-radius: 12px
box-shadow: var(--glass-shadow)
```

### Modal Glass Spec
```
background: dark → rgba(15, 23, 42, 0.85) | light → rgba(248, 250, 252, 0.85)
backdrop-filter: blur(20px)
```

---

## 6. Component Specs

### 6.1 Buttons

| Variant | Style |
|---|---|
| **Primary** | Background `#1A56DB`, white text, hover → `#1E40AF`, border-radius 8px, padding 10px 20px |
| **Secondary** | Transparent bg, `#1A56DB` border + text, hover → light blue fill `rgba(26,86,219,0.08)` |
| **Ghost** | No border, `--text-secondary` colour, hover → subtle `--surface-elevated` fill |
| **Destructive** | Background `#EF4444`, white text, hover darken 10% |

All buttons: `font-weight: 500`, `font-size: 14px`, `border-radius: 8px`

### 6.2 Inputs

- Style: **filled** (not outlined)
- Background: `--input-fill`
- Border: `1px solid var(--input-border)`
- Border-radius: `8px`
- Focus ring: `box-shadow: 0 0 0 3px rgba(26, 86, 219, 0.25)`, border-color → `#1A56DB`
- Labels: above the input, `font-size: 12px`, `font-weight: 500`, uppercase, `letter-spacing: 0.05em`, colour `--text-secondary`
- Placeholder: `--text-secondary` at 60% opacity

### 6.3 Cards

- Background: `--surface`
- Border: `1px solid var(--border)`
- Border-radius: `12px`
- Padding: `20–24px`
- Subtle hover lift: `transform: translateY(-1px)`, shadow increase

### 6.4 Badges / Pills

- Small pill shape, `border-radius: 999px`, `padding: 2px 10px`, `font-size: 12px`, `font-weight: 500`
- Colour matches the semantic system (status colours above)
- Background is a tinted version of the colour at 15% opacity with the solid colour as text

### 6.5 Chips (Skills)

- Matched skill: green tinted pill — `background: rgba(16,185,129,0.15)`, `color: #10B981`, border `rgba(16,185,129,0.3)`
- General skill: `--surface-elevated` background, `--text-secondary` colour
- Skills gap: amber tinted — `background: rgba(245,158,11,0.15)`, `color: #F59E0B`

### 6.6 Nav Bar

```
position: sticky
top: 0
z-index: 100
background: var(--glass-bg)
backdrop-filter: blur(16px)
border-bottom: var(--glass-border)
height: 60px
padding: 0 24px
```

Contents: Logo left · Nav links centre (desktop) · Theme toggle + Avatar/CTA right

### 6.7 Drag-and-Drop Upload Zone

- Dashed border, `border-radius: 12px`, `border: 2px dashed var(--border)`
- Icon (upload arrow) centred with label text below
- Hover state: border turns brand blue, light blue background tint
- Active drag-over: filled blue tint `rgba(26,86,219,0.08)`, brand border

### 6.8 Kanban Cards

Glass treatment. Contents:
- Company name bold (top)
- Job title secondary text
- Status badge (colour-coded pill)
- Date applied (bottom-left caption)
- Quick-action icons: view + delete (bottom-right, appear on hover)

### 6.9 Progress Steps (Onboarding Wizard)

- Horizontal row of 3 numbered circles connected by a line
- Active step: filled brand blue circle, white number
- Completed step: filled brand blue with checkmark
- Upcoming step: `--surface-elevated` circle, `--text-secondary` number
- Connecting line: completed segment → brand blue, upcoming → `--border`

---

## 7. Layout & Spacing

### Spacing Scale (use multiples of 4)
`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80 · 96px`

### Page Layout
- Max content width: **1280px**, centred
- Page horizontal padding: `24px` (desktop), `16px` (mobile)
- Section vertical spacing: `48–80px`

### Split Panel Layout (CV Editor, New Application)
- Desktop: Left 60% / Right 40% with `24px` gap
- A `position: sticky; top: 72px` right panel so it doesn't scroll away
- Divider: `1px solid var(--border)`

### Dashboard Layout
- Top stats strip: full width, `4` equal-width stat cards in a row
- Kanban: horizontal scroll container, `6` columns, each `280px` wide, `16px` gap
- Mobile: columns stack, horizontal scroll with snap

---

## 8. Screen Inventory

The following screens exist in Jobbo. Each must be built as a separate Figma Make prompt:

| # | Screen | Phase |
|---|---|---|
| 1 | Landing Page | 5 |
| 2 | Sign Up | 1 |
| 3 | Log In | 1 |
| 4 | Onboarding Wizard (3 steps) | 1 |
| 5 | Dashboard (Kanban Tracker) | 1 |
| 6 | New Application Screen | 1 |
| 7 | CV Editor + Live Preview | 1 |
| 8 | PDF Preview Modal | 1 |
| 9 | Cover Letter Screen | 2 |
| 10 | Application Detail Panel | 2 |
| 11 | Profile & CV Settings | 5 |
| 12 | Billing Page | 4 |

---

## 9. Interaction & Animation Rules

- **Page transitions:** Fade in `opacity 0 → 1` over `200ms`
- **Modal open:** Scale `0.96 → 1` + fade, `200ms ease-out`
- **Drawer open:** Slide in from right, `240ms ease-out`
- **Kanban drag:** Card lifts with `transform: scale(1.02)`, shadow increases, ghost placeholder shows
- **Button press:** `transform: scale(0.97)`, `100ms`
- **Spinner:** Full-screen overlay with blurred background + centred spinner + status text (e.g. "Tailoring your CV…") during Edge Function calls
- **Skeleton loaders:** Use for any async content — grey animated shimmer blocks matching content shape
- **Debounce:** CV editor live preview updates at `300ms` debounce

---

## 10. Responsive Breakpoints

| Breakpoint | Width | Notes |
|---|---|---|
| Mobile | < 768px | Single column, stacked nav, Kanban horizontal scroll |
| Tablet | 768–1024px | Split panels collapse to tabs |
| Desktop | > 1024px | Full split-panel layouts, side drawers |

---

## 11. Empty States

Every list or board column must have a designed empty state:

- Kanban columns: illustration/icon + short copy (e.g. "No interviews yet — keep applying!")
- Applications list: "No applications yet. Click 'New Application' to get started."
- Documents tab: "No documents uploaded for this application."

Empty states use `--text-secondary` colour, centred in the container, with a relevant icon above the copy.

---

## 12. Error & Validation States

- Inline form errors appear **below** the input in `#EF4444`
- Error text: `font-size: 12px`, preceded by a warning icon
- Input border turns red on error
- Toast notifications for async errors: appear top-right, slide in, auto-dismiss after 4s
  - Error toast: red left border, error icon
  - Success toast: green left border, check icon

---

## 13. Upgrade / Paywall Patterns

- **Generation gate modal:** Triggered when free tier limit hit. Glass modal, centred. Shows current usage (`3/3 used`), Pro plan benefits list, two CTAs: "Upgrade to Pro" (primary) + "Maybe later" (ghost)
- **Locked feature indicators:** Lock icon on restricted UI elements (e.g. template thumbnails for Pro-only, cover letter button on free tier). Tooltip on hover: "Available on Pro plan"
- **Usage meter on Billing page:** Progress bar showing `X of 3 generations used`, brand blue fill

---

## 14. PDF Templates (Visual Reference for Previews)

Three ATS-safe templates:

| ID | Name | Description |
|---|---|---|
| `clean` | Clean Single Column | Serif headings (Georgia), generous whitespace, full-width layout |
| `sidebar` | Two-Column Sidebar | Left sidebar for skills/contact (30%), main content right (70%) |
| `minimal` | Minimal Modern | Sans-serif throughout, thin line dividers only, very clean |

All templates: white background, black text, text-selectable PDF output, no images, no complex tables, standard Unicode fonts.

---

## 15. Data Display Conventions

- **Dates:** Display as `Jan 2024` or `Jan 2024 – Present`
- **Match score:** Always shown as `87% ATS Match` with a coloured badge (green ≥80%, amber 60–79%, red <60%)
- **File size:** Show alongside uploaded file names, e.g. `resume.pdf · 142 KB`
- **Loading copy during generation:** Rotate through: "Analysing job description…" → "Matching your experience…" → "Optimising for ATS…" → "Almost done…"

---

## 16. Accessibility Notes

- Minimum contrast ratio: 4.5:1 for body text, 3:1 for large text
- All interactive elements have `:focus-visible` ring using brand blue
- Icon-only buttons always have `aria-label` or tooltip
- Drag-and-drop upload zones have keyboard-accessible fallback file input
- Status badges are never colour-only — always include text label

---

## 17. Figma Make Prompt Template

When building a screen, structure the prompt as:

```
Build [Screen Name] for Jobbo, an AI-powered CV tailoring SaaS.

THEME: Dark mode by default. Use CSS custom properties. Include a theme toggle in the nav.

DESIGN SYSTEM:
- Font: Inter
- Dark bg: #0F172A, Surface: #1E293B, Primary text: #F8FAFC, Secondary: #94A3B8
- Brand blue: #1A56DB, Success: #10B981, Warning: #F59E0B, Danger: #EF4444
- Glass cards: bg rgba(30,41,59,0.6), blur(12px), border rgba(148,163,184,0.15), shadow 0 4px 24px rgba(0,0,0,0.4)
- Border radius: cards 12px, buttons/inputs 8px

LAYOUT: [describe the layout]

COMPONENTS NEEDED:
[list each component with its content, state, and behaviour]

INTERACTIONS:
[describe hover states, clicks, transitions, async states]

EMPTY STATES: [describe]
ERROR STATES: [describe]
```

---

*— End of Guidelines —*