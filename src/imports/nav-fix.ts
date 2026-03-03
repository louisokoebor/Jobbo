Fix the Dashboard, Applications, and Profile navigation tabs 
in the nav bar. Currently Applications and Profile do nothing 
when clicked. Wire them up correctly.

Do not change any styling or layout. Fix navigation only.

---

DASHBOARD TAB
Already active on the dashboard page.
Clicking it should navigate to /dashboard.
It should show as active (underlined/highlighted) when the 
current route is /dashboard.

---

APPLICATIONS TAB
Clicking it should navigate to /applications.

The /applications page does not exist yet so create a simple 
placeholder page at that route with:
  - Same nav bar as the dashboard
  - Page title: "Applications"
  - Breadcrumb: "Dashboard / Applications"
  - A centred empty state card with:
      Icon: a file or list icon
      Heading: "Applications coming soon"
      Body: "Full application list view is on the way."
  - Same background, same theme support (dark/light)
  - Same glassmorphic design as the rest of the app

---

PROFILE TAB
Clicking it should navigate to /profile.

The /profile page does not exist yet so create a simple 
placeholder page at that route with:
  - Same nav bar as the dashboard
  - Page title: "Profile"
  - Breadcrumb: "Dashboard / Profile"
  - Two sections:

  SECTION 1 — Account
    Label: "ACCOUNT"
    Show the logged-in user's email address (fetch from 
    supabase.auth.getUser())
    A "Change Password" button (ghost style) that calls:
      supabase.auth.resetPasswordForEmail(email)
    Show success toast: "Password reset email sent"

  SECTION 2 — CV Profiles
    Label: "BASE CV PROFILES"
    Fetch and list all CV profiles:
      const { data } = await supabase
        .from('cv_profiles')
        .select('id, label, created_at, is_default')
        .order('is_default', { ascending: false })
    
    Each profile shows:
      - Label (bold)
      - "Uploaded DD MMM YYYY" (secondary text)
      - "Default" green badge if is_default = true
      - "Set as Default" ghost button if not default:
          await supabase
            .from('cv_profiles')
            .update({ is_default: false })
            .eq('user_id', userId)
          then:
          await supabase
            .from('cv_profiles')
            .update({ is_default: true })
            .eq('id', profileId)
      - Delete icon button:
          await supabase
            .from('cv_profiles')
            .delete()
            .eq('id', profileId)
          Show confirmation before deleting.
          If deleted profile was default and others exist, 
          set the next one as default automatically.
    
    "Upload new CV" button at the bottom of the list.
    Clicking it triggers inline CV upload (same hidden file 
    input + make-server-3bbff5cf/parse-cv flow as the 
    New Application page — same validation, same progress 
    indicator, same success/error toasts).
    After upload, refresh the profiles list.

---

ACTIVE TAB STATE
The correct tab should appear active based on current route:
  /dashboard → Dashboard tab active
  /applications → Applications tab active  
  /profile → Profile tab active

Use the current route from useLocation() or equivalent 
router hook to determine which tab is active.