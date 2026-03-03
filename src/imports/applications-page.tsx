Create an Applications page at the route /applications.

Same nav bar as all other screens with the Applications tab 
active. Same dark/light theme. Same design system throughout.

---

PAGE HEADER

Full-width header row with:

Left side:
  Page title: "Applications" (28px, semibold, primary text)
  Below title: "X applications" in secondary text, 13px
  X is calculated from the fetched data length

Right side:
  Primary button: "+ New Application" 
  On click: navigate to /new-application

---

SEARCH AND FILTERS BAR

Full-width bar below the header with 16px gap.

Search input (left, max 300px):
  Height 40px
  Placeholder: "Search job title or company…"
  Magnifying glass icon inside left padding
  Filters the visible list in real time on every keystroke
  Matches against job_title and company fields
  Same input styling as rest of app (surface bg, focus ring)

Filter pills (centre, scrollable row on mobile):
  [ All ] [ Saved ] [ Applied ] [ Interview ] [ Offer ] [ Rejected ]
  Only one active at a time
  Default active: All
  Active pill: solid #1A56DB background, white text
  Inactive pill: surface card bg, secondary text, border
  Border radius 999px, height 32px, padding 0 14px
  Clicking a pill filters the list to that status
  "Interview" pill matches both interview_scheduled 
  and interview_done

Sort dropdown (far right):
  Height 40px, same input styling
  Options:
    "Newest first" (default)
    "Oldest first"
    "Company A–Z"
  Sorts the visible list client-side

---

FETCH APPLICATIONS ON MOUNT

  const { data: applications, error } = await supabase
    .from('applications')
    .select('id, job_title, company, status, created_at, next_action_date, job_parsed_json')
    .order('created_at', { ascending: false })

While loading: show 4 skeleton shimmer rows
  Each skeleton row same height as a real row
  Animated shimmer pulse (opacity 0.5 → 1 alternating)

If fetch error: red toast "Failed to load applications"

Store full array in state. Apply search, filter, and sort 
client-side from that array — do not re-fetch on filter change.

---

APPLICATION LIST

Full-width list below the filters bar.
8px gap between rows.

Each row is a surface card:
  Background: card surface colour (isDark ? #1E293B : #FFFFFF)
  Border: 1px solid border colour
  Border radius: 12px
  Padding: 16px 20px
  Cursor: pointer
  On hover: slightly elevated background 
    isDark ? #263348 : #F8FAFC
  Transition: background 0.15s

Row layout (flex row, align-items center, gap 16px):

1. COMPANY AVATAR (flex-shrink 0):
   Width 44px, height 44px, border-radius 50%
   Background: linear-gradient(135deg, #1A56DB, #8B5CF6)
   Display first letter of company name
   Font: 18px bold, white, centred

2. MAIN CONTENT (flex: 1, min-width 0):
   Line 1: job_title
     Font: 15px, semibold, primary text
     White-space: nowrap, overflow hidden, text-overflow ellipsis
   
   Line 2: company · location (if job_parsed_json.location exists)
     Font: 13px, secondary text
     Separator: · (middot) between company and location
   
   Line 3 (flex row, gap 6px, margin-top 6px, flex-wrap wrap):
     Status badge pill:
       Border-radius 999px, padding 2px 10px, font 12px semibold
       saved:               bg rgba(148,163,184,0.12)  text #94A3B8
       applied:             bg rgba(26,86,219,0.12)    text #1A56DB
       interview_scheduled: bg rgba(245,158,11,0.12)   text #F59E0B
       interview_done:      bg rgba(139,92,246,0.12)   text #8B5CF6
       offer:               bg rgba(16,185,129,0.12)   text #10B981
       rejected:            bg rgba(239,68,68,0.12)    text #EF4444
       
       Display text (human readable):
         saved → "Saved"
         applied → "Applied"
         interview_scheduled → "Interview Scheduled"
         interview_done → "Interview Done"
         offer → "Offer"
         rejected → "Rejected"
     
     Date applied:
       Font: 12px, secondary text
       Format: "DD MMM YYYY" e.g. "01 Mar 2026"
     
     Next action date pill (only if next_action_date is not null):
       bg rgba(245,158,11,0.10) 
       border 1px solid rgba(245,158,11,0.25)
       text #F59E0B, 12px
       Content: "Action: DD MMM"

3. RIGHT SIDE (flex-shrink 0, flex row, gap 8px, 
   align-items center):

   Three icon buttons (each 32x32px, border-radius 8px):
   
   Analyse button:
     Icon: Sparkles from lucide-react
     Default: secondary text colour
     On hover: brand blue colour, bg rgba(26,86,219,0.1)
     Tooltip on hover: "AI Feedback"
     On click: open Application Detail Panel to Feedback tab
     Stop click event propagating to row
   
   View button:
     Icon: Eye from lucide-react  
     Default: secondary text colour
     On hover: brand blue colour, bg rgba(26,86,219,0.1)
     Tooltip: "View Details"
     On click: open Application Detail Panel to Overview tab
     Stop click event propagating to row
   
   Delete button:
     Icon: Trash2 from lucide-react
     Default: secondary text colour
     On hover: #EF4444 colour, bg rgba(239,68,68,0.1)
     Tooltip: "Delete"
     On click: show confirmation then delete (see below)
     Stop click event propagating to row

Clicking anywhere else on the row:
  Opens Application Detail Panel to Overview tab
  (detail panel to be built in a separate step — 
  for now just log the application id to console)

---

STATUS COUNTS IN FILTER PILLS

Show count badge on each filter pill:
  All (23)  Saved (4)  Applied (8)  Interview (6)  Offer (2)  Rejected (3)
  Count calculated from full applications array before filtering
  Badge: small number in secondary text after the label
  Updates when applications array changes

---

DELETE APPLICATION

On delete icon click:
  Show browser confirm dialog:
  "Delete [job_title] at [company]? This cannot be undone."
  
  On confirm:
    await supabase
      .from('applications')
      .delete()
      .eq('id', applicationId)
    
    Remove from local applications state immediately
    Show green toast: "[job_title] deleted"
  
  On error:
    Show red toast: "Failed to delete. Please try again."
    Re-add to local state

---

EMPTY STATES

If applications array is empty after loading (no applications 
at all):
  Centred in the page, padding 80px 0:
    Icon: Inbox from lucide-react, 56px, muted colour
    Heading: "No applications yet" (18px semibold)
    Body: "Add your first job application to get started"
           (14px secondary text)
    Primary button: "+ New Application" → /new-application

If search or filter produces no matches:
  Centred:
    Icon: SearchX from lucide-react, 48px, muted
    Heading: "No results"
    Body: "No applications match your search"
    Ghost button: "Clear filters"
    On click: reset search to empty and filter to All

---

STATS SUMMARY BAR

Between the header and the search/filter bar:
A row of 4 stat cards (same as dashboard stats bar):

  Total:       applications.length
  This Week:   count where created_at >= start of current week
  Interviews:  count where status IN (interview_scheduled, 
               interview_done)
  Offers:      count where status = offer

Each stat card:
  Surface card style (not glass)
  Label in small caps secondary text
  Number in 24px bold primary text
  Flex row, equal width, gap 12px

---

RESPONSIVE

On mobile (< 768px):
  Header stacks vertically (title on top, button below)
  Search takes full width
  Filter pills scroll horizontally with no wrapping
  Sort dropdown full width below pills
  Row: hide location from line 2 on small screens
  Right side: show only the view and delete icons, 
  hide analyse icon (accessible from detail panel)

---

NAVIGATION

The Applications tab in the nav should appear active 
(underlined with brand blue) when on /applications route.
Use useLocation() to detect current route and set active tab.

SUPABASE_URL is https://hrexgjahkdjqxvulodqu.supabase.co