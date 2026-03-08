Fix two issues on the CV Preview / PDF modal screen.
Do NOT change any other screens, routing, or auth flow.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ISSUE 1 — CV Preview is not responsive on mobile
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The CV preview modal renders a fixed-width document that 
overflows the screen on mobile — content is clipped on both 
left and right sides and the user cannot see the full CV.

Read the CV preview/PDF modal component and fix it so it 
works correctly on all screen sizes.

FIX A — Scale the document to fit the viewport:

The CV document itself is likely rendered at a fixed width 
(e.g. 794px for A4). On mobile it needs to scale down to fit.

Replace any fixed width on the document container with a 
scale transform approach:

  const DOCUMENT_WIDTH = 794; // A4 at 96dpi
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function updateScale() {
      if (!containerRef.current) return;
      const availableWidth = containerRef.current.clientWidth - 32; // 16px padding each side
      const newScale = Math.min(1, availableWidth / DOCUMENT_WIDTH);
      setScale(newScale);
    }
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

Apply to the document wrapper:
  <div ref={containerRef} style={{ width: '100%', overflow: 'hidden' }}>
    <div style={{
      width: DOCUMENT_WIDTH,
      transformOrigin: 'top left',
      transform: `scale(${scale})`,
      marginBottom: `${-(DOCUMENT_WIDTH * (1 - scale))}px`, // collapse extra space
    }}>
      {/* CV document content */}
    </div>
  </div>

FIX B — Make the modal itself full screen on mobile:

The modal/drawer that contains the preview should be:
- Desktop (≥768px): centred modal, max-width 900px, 
  max-height 90vh, overflow-y auto
- Mobile (<768px): full screen, position fixed, inset 0, 
  no border-radius, overflow-y auto

Use this approach:
  const isMobile = window.innerWidth < 768;
  
  Modal container style:
  {
    position: 'fixed',
    inset: isMobile ? 0 : undefined,
    top: isMobile ? 0 : '5vh',
    left: isMobile ? 0 : '50%',
    transform: isMobile ? 'none' : 'translateX(-50%)',
    width: isMobile ? '100%' : '90%',
    maxWidth: isMobile ? '100%' : 900,
    height: isMobile ? '100%' : '90vh',
    borderRadius: isMobile ? 0 : 12,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 1000,
  }

FIX C — Template tab bar scrollable on mobile:

The three template tabs (Clean | Sidebar | Minimal) should 
not wrap or overflow on small screens.
Wrap them in a horizontally scrollable container:
  <div style={{ 
    display: 'flex', 
    gap: 8, 
    overflowX: 'auto',
    padding: '0 16px',
    scrollbarWidth: 'none', // hide scrollbar
    WebkitOverflowScrolling: 'touch',
  }}>

FIX D — Toolbar responsive layout:

The top toolbar contains: [template tabs] [zoom] [Download PDF] [×]
On mobile this overflows. Fix:
- Stack into two rows on mobile:
  Row 1: [CV Preview title] [×] — space-between
  Row 2: [template tabs scrollable] [Download PDF button]
- Hide zoom controls on mobile (pinch to zoom is native)
- Download PDF button: full width on mobile if needed, 
  or compact icon+text on small screens

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ISSUE 2 — Template tabs need plan gating
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The three templates are: Clean (free), Sidebar (pro), Minimal (pro).

Read plan tier from UserPlanContext:
  const { planTier } = useUserPlan();
  const isPro = planTier === 'pro';

TEMPLATE TAB RENDERING:

Free users:
  Clean tab — normal, selectable, no lock
  Sidebar tab — show lock icon, not selectable
  Minimal tab — show lock icon, not selectable

Pro users:
  All three tabs — normal, selectable, no lock

Tab styling for locked templates:
  - Same tab component as active tabs
  - Add Lock icon (lucide-react, size 12) inline after the label
  - Opacity: 0.6
  - Cursor: pointer (still clickable — clicking shows upgrade prompt)
  - Do NOT disable the tab entirely — let users click it

When a locked template tab is clicked by a free user:
  Do NOT switch the template.
  Instead show a small inline tooltip or popover below the tab:
  
    "Unlock all templates with Pro"
    [Upgrade to Pro →] — links to /billing
  
  Popover style:
    position absolute below the tab
    background: surface elevated
    border: 1px solid border-color
    border-radius: 8px
    padding: 12px 16px
    width: 220px
    fontSize 13px
    z-index: 10
    
  Clicking anywhere outside dismisses the popover.
  
  Do NOT show a full modal or navigate away — keep it 
  lightweight so the user stays in the preview.

ALSO gate template selection in the download/save logic:
  When generating or downloading PDF, if the selected 
  template is 'sidebar' or 'minimal' and user is free,
  fall back to 'clean' template silently.
  This prevents a free user bypassing the UI lock via 
  direct API calls.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Do not change the CV content rendering or PDF generation
- Do not change any other screens
- Do not change billing, auth, or routing
- If UserPlanContext is not available in this component, 
  import it — do not create a new plan-fetching call
- The scale transform approach must not affect the PDF 
  download — PDF should always generate at full 794px 
  width regardless of screen scale
- Use CSS media queries OR JS resize listener — 
  pick whichever is already used in the codebase for 
  consistency, check before implementing