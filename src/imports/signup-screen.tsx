Build the Sign Up screen for Applyly — an AI-powered CV tailoring SaaS for job seekers.

THEME
Dark mode default. Light mode support via CSS custom properties toggled by a class on <html>. Theme toggle (sun/moon icon) in top-right of nav. Save preference to localStorage key: applyly-theme. All colour changes transition: background 0.2s, color 0.2s, border-color 0.2s.

DESIGN SYSTEM
Font: Inter (all weights via Google Fonts)
Dark bg: #0F172A | Surface: #1E293B | Primary text: #F8FAFC | Secondary text: #94A3B8
Brand blue: #1A56DB | Brand dark: #1E40AF | Success: #10B981 | Danger: #EF4444
Border radius — cards: 12px | buttons: 8px | inputs: 8px
Glass spec: background rgba(30,41,59,0.6), backdrop-filter blur(12px), border 1px solid rgba(148,163,184,0.15), box-shadow 0 4px 24px rgba(0,0,0,0.4)
Light mode glass: background rgba(255,255,255,0.6), border 1px solid rgba(148,163,184,0.25), box-shadow 0 4px 24px rgba(15,23,42,0.08)

LAYOUT
Full viewport. Background is a deep radial gradient: dark mode centre #1E293B radiating out to #0F172A. Light mode: #EFF6FF to #F1F5F9. A subtle animated mesh/noise texture overlays the background at 4% opacity to add depth. The glass card floats centred vertically and horizontally, max-width 440px.

NAV BAR
Sticky top, glass treatment, height 60px, padding 0 24px.
Left: Applyly wordmark in Inter 700, brand blue #1A56DB, font-size 20px.
Right: Theme toggle icon button (sun in light mode, moon in dark mode), no border, ghost style.

SIGN UP CARD (glass)
Padding 40px. Border-radius 12px. Glass treatment as above.

Contents top to bottom:
1. Heading: "Create your account" — Inter 600, 24px, primary text colour
2. Subheading: "Start tailoring CVs in seconds" — Inter 400, 14px, secondary text colour, margin-bottom 28px
3. Google OAuth button — full width, surface colour background, 1px border (--border), border-radius 8px, height 44px. Google "G" logo SVG on left, text "Continue with Google" Inter 500 14px primary text. Hover: border turns brand blue, light blue bg tint rgba(26,86,219,0.06).
4. Divider — horizontal rule with "or" text centred, secondary text colour, 12px font
5. Email input — label above "EMAIL ADDRESS", filled style, surface bg, full width, height 44px
6. Password input — label above "PASSWORD", same style, with show/hide toggle icon inside right of field
7. Confirm Password input — label above "CONFIRM PASSWORD", same style
8. Password strength indicator — thin bar below password field, fills left to right: red (weak) → amber (medium) → green (strong) based on password length and complexity
9. Primary CTA button — full width, "Create Account", solid #1A56DB, white text Inter 600 15px, height 44px, border-radius 8px. Hover: #1E40AF. Loading state: spinner replaces text.
10. Footer text — "Already have an account? Log in" — secondary text, "Log in" is brand blue link

VALIDATION STATES
- Empty field on submit: red border on input, small error text below in #EF4444, 12px, with warning icon
- Email already exists: error toast top-right, slide in from right, red left border, "An account with this email already exists", auto-dismiss 4s
- Password mismatch: inline error below confirm field
- Password < 8 chars: inline error "Password must be at least 8 characters"

SUCCESS STATE
On successful sign up: brief success toast, then fade transition to onboarding wizard.

INTERACTIONS
- All inputs show brand blue focus ring: box-shadow 0 0 0 3px rgba(26,86,219,0.25), border-color #1A56DB
- Button press: transform scale(0.97) 100ms
- Card entrance: fade in + translateY(8px → 0) over 300ms on load
- Tab between Sign Up and Log In via link at bottom (no page reload, swap content)
