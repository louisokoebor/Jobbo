Build the Dashboard / Application Tracker screen for Jobbo — an AI-powered CV tailoring SaaS.

THEME
Same dark/light system. Dark default. jobbo-theme localStorage. Same tokens throughout.

DESIGN SYSTEM
Same Inter font, same colour palette. Kanban cards use glass treatment. Stats bar uses glass treatment. Main background uses deep gradient with subtle grid pattern overlay at 3% opacity.

FULL APP SHELL LAYOUT
- Sticky glass nav: 60px height, Jobbo wordmark left (Inter 700 20px brand blue), centre links: "Dashboard" "Applications" "Profile" (Inter 500 14px secondary text, active = primary text + brand blue underline), right: "New Application" primary button (compact, 36px height) + avatar circle dropdown menu (logout option).
- Below nav: full-width stats bar (glass), then kanban board fills remaining viewport height with scroll.

STATS BAR (glass treatment)
Full width, below nav, padding 16px 24px. 4 equal stat blocks in a row separated by subtle vertical dividers.
Each stat block: large number Inter 700 28px primary text, label below Inter 500 12px uppercase secondary text letter-spacing 0.05em.
Stats: "Total Applications" | "This Week" | "Interview Rate %" | "Offer Rate %"
On hover each block gets a very subtle brand blue left border.

KANBAN BOARD
Below stats bar. Horizontal layout. Padding 24px. Gap 16px between columns.
6 columns — each 280px wide, full height of remaining viewport.
Horizontal scroll on overflow (show scrollbar on hover only, custom thin scrollbar brand blue thumb).

COLUMN HEADER
Each column has a header row: status name Inter 600 14px primary text, card count badge (pill, secondary bg, secondary text, 12px).
Status colour accent: a 3px top border on each column header card matching the status colour.

Status colours:
- Saved: #94A3B8 (slate)
- Applied: #3B82F6 (blue)
- Interview Scheduled: #F59E0B (amber)
- Interview Done: #8B5CF6 (purple)
- Offer: #10B981 (green)
- Rejected: #EF4444 (red)

EMPTY STATE (per column)
Centred in column: small relevant icon (muted, 24px), then short copy in secondary text 13px italic.
Examples:
- Saved: "Nothing saved yet"
- Applied: "No applications yet — go for it!"
- Interview Scheduled: "No interviews yet — keep applying!"
- Offer: "Your offer is coming 🎯"
- Rejected: "Rejections are just redirections"

KANBAN CARD (glass treatment)
Width: 100% of column. Margin-bottom 12px. Padding 16px. Border-radius 12px.
Glass: bg rgba(30,41,59,0.6) dark / rgba(255,255,255,0.6) light, blur(12px), border rgba(148,163,184,0.15), shadow 0 4px 24px rgba(0,0,0,0.4).

Card contents top to bottom:
1. Top row: company favicon circle (16px, grey placeholder if none) + company name Inter 600 14px primary text. Status badge pill far right (colour-coded, 11px).
2. Job title — Inter 400 13px secondary text, margin-top 4px. Truncate at 2 lines with ellipsis.
3. Date applied — Inter 400 12px secondary text, margin-top 8px. Format: "12 Jan 2025"
4. Bottom row (shows on card hover): "View →" ghost link left (13px brand blue), delete icon button right (trash icon, danger red on hover).

Card hover: translateY(-2px), shadow increases to 0 8px 32px rgba(0,0,0,0.5).
Card drag state: scale(1.02), opacity 0.9, shadow large, cursor: grabbing.
Drag placeholder: dashed border box same height as card, border rgba(26,86,219,0.4), bg rgba(26,86,219,0.04).

DRAG AND DROP
Drag cards between columns to update status. Column highlights with brand blue left border glow when a card is dragged over it.

DELETE CONFIRMATION
On delete icon click: small inline confirmation replaces card bottom row — "Delete this application?" with "Yes, delete" (red text) and "Cancel" (secondary text). No modal needed.

NEW APPLICATION BUTTON
Sticky in top-right of nav. Also: large "+" floating action button bottom-right corner on mobile (56px circle, brand blue, white plus icon, shadow).

MOBILE RESPONSIVE
Columns: horizontal scroll-snap. Each column: 85vw wide. Snap scrolling so one column at a time centres. Stats bar: 2x2 grid instead of row.
