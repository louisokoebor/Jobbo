Two changes to implement across the app. Do NOT change any other 
screens, billing, or auth flow.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 1 — Plan-aware Cover Letter button on Feedback screen
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The "Generate Cover Letter" button in the Cover Letter Gap Coverage 
card needs to be aware of the user's plan tier.

Read plan tier from UserPlanContext (already available in the app).
  const { planTier } = useUserPlan();
  const isPro = planTier === 'pro';

IF USER IS FREE:
  Replace the button with a locked state:

  <div> containing two elements stacked:
  
  1. A disabled-looking button:
     Label: "🔒 Generate Cover Letter"
     Background: surface elevated (not brand blue)
     Color: secondary text
     Cursor: not-allowed
     Border: 1px solid border-color
     Border-radius: 8px
     Padding: 10px 16px
     Font: Inter 500 13px
  
  2. Below the button, a small upgrade nudge:
     "Cover letters are a Pro feature"
     fontSize 12, color secondary, marginTop 6px
     Followed by: "Upgrade to Pro →" 
     fontSize 12, color #1A56DB, fontWeight 600
     cursor pointer — navigates to /billing on click

  Clicking the locked button itself also navigates to /billing.

IF USER IS PRO:
  Show the existing "→ Generate Cover Letter" button exactly as is.
  It navigates to the cover letter tab/page for this application.
  No changes to pro behaviour.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE 2 — Previous page tracking for back buttons
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PROBLEM: Back buttons throughout the app hardcode their destination 
(e.g. always go to /cv-editor or /application). When a user navigates 
from Feedback → Cover Letter → Back, they land on CV editor instead 
of Feedback. The back button should go to wherever the user came from.

SOLUTION: Use a navigation history context to track the previous route.

STEP A — Create src/app/lib/NavigationContext.tsx:

  import { createContext, useContext, useEffect, useRef, useState } 
    from 'react';
  import { useLocation } from 'react-router';

  interface NavigationContextValue {
    previousPath: string | null;
    goBack: (navigate: Function, fallback: string) => void;
  }

  const NavigationContext = createContext<NavigationContextValue>({
    previousPath: null,
    goBack: (navigate, fallback) => navigate(fallback),
  });

  export function NavigationProvider({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    const previousPathRef = useRef<string | null>(null);
    const currentPathRef = useRef<string>(location.pathname);
    const [previousPath, setPreviousPath] = useState<string | null>(null);

    useEffect(() => {
      if (location.pathname !== currentPathRef.current) {
        previousPathRef.current = currentPathRef.current;
        currentPathRef.current = location.pathname;
        setPreviousPath(previousPathRef.current);
      }
    }, [location.pathname]);

    const goBack = (navigate: Function, fallback: string) => {
      if (previousPathRef.current && previousPathRef.current !== location.pathname) {
        navigate(previousPathRef.current);
      } else {
        navigate(fallback);
      }
    };

    return (
      <NavigationContext.Provider value={{ previousPath, goBack }}>
        {children}
      </NavigationContext.Provider>
    );
  }

  export function useNavigation() {
    return useContext(NavigationContext);
  }

STEP B — Wrap the app with NavigationProvider in App.tsx 
or the root router component. Add it inside the Router 
but outside the Routes:

  <Router>
    <NavigationProvider>
      <Routes>
        ...
      </Routes>
    </NavigationProvider>
  </Router>

STEP C — Update back buttons to use goBack().

Find every component that has a "Back to X" button using 
navigate('/hardcoded-path') and replace with:

  const { goBack } = useNavigation();
  
  // In the button onClick:
  onClick={() => goBack(navigate, '/fallback-path')}

Apply this to these specific back buttons:

1. CV Editor — "← Back to Application" button:
   goBack(navigate, `/application/${applicationId}`)

2. Cover Letter page — back button (if it exists):
   goBack(navigate, `/application/${applicationId}`)

3. Any other "Back to Application" or "← Back" buttons 
   found in application-related screens.

The fallback path is what it navigates to if there is no 
previous path tracked (e.g. user opened the page directly 
via URL). Always set fallback to the most logical parent.

STEP D — Ensure the Cover Letter tab/page back button 
specifically goes back to Feedback when navigated from there.

The NavigationProvider handles this automatically — if the 
user was on the Feedback tab and clicked Generate Cover Letter,
previousPath will be the feedback URL, so goBack() will 
return them there correctly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Do not change any screen layouts or styling
- Do not change the billing page or auth flow
- Do not change navigation for non-application screens
  (Dashboard, Billing, Profile back buttons stay as they are)
- The NavigationProvider must be inside the Router component
  so useLocation() works correctly
- Do not break any existing navigation — goBack() always has 
  a fallback so worst case behaviour is unchanged