Add a tap-to-preview feature to the base CV profile cards on the 
Profile page. Do NOT change any other screens, routing, or auth flow.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANGE — Tap card to preview uploaded CV
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

On the profile card (the dark card showing "Louis Okoebor 
resume_ Default · Uploaded 3 Mar 2026"):

1. Make the card look clickable:
   - Add cursor: pointer to the card
   - Add hover state: background slightly lighter, 
     border: 1px solid rgba(255,255,255,0.08)
   - Add a small Eye icon (lucide-react, size 13) 
     to the right of the filename, before the trash icon:
       color: #6B7280
       opacity: 0 by default
       opacity: 1 on card hover
       transition: opacity 0.15s
       marginRight: 12px

2. On card click (but NOT on trash icon click — 
   stop propagation on the trash button):
   Open a fullscreen preview modal showing the uploaded CV.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PREVIEW MODAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The uploaded CV is a PDF stored in Supabase Storage.
Fetch the file URL from Supabase storage using the 
cv_profiles record — it should have a file_path or 
storage_path field. Generate a signed URL:

  const { data } = await supabase.storage
    .from('cv-uploads')  // adjust bucket name to match actual
    .createSignedUrl(cvProfile.file_path, 3600);
  
  const previewUrl = data?.signedUrl;

If the bucket name or field name differs from above, 
read the cv_profiles table structure and storage 
configuration first to get the correct values.

Modal structure:

  Overlay:
    position: fixed, inset: 0
    background: rgba(0,0,0,0.75)
    zIndex: 1000
    display: flex, flexDirection: column

  Modal container:
    position: fixed
    inset: 0
    display: flex
    flexDirection: column
    zIndex: 1001

  Header bar:
    height: 56px
    background: surface elevated
    display: flex, alignItems: center
    padding: 0 20px
    justifyContent: space-between
    borderBottom: 1px solid border-color
    flexShrink: 0

    Left: filename text — Inter 500 14px primary
    Right: X button (lucide-react X icon, size 20) 
           to close modal

  PDF viewer:
    flex: 1
    overflow: hidden
    background: #1a1a2e

    Render the PDF using an iframe:
      <iframe
        src={previewUrl}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
        }}
        title="CV Preview"
      />

    If the browser blocks iframe PDF rendering (some 
    mobile browsers do), fall back to an object tag:
      <object
        data={previewUrl}
        type="application/pdf"
        style={{ width: '100%', height: '100%' }}
      >
        <div style={{ 
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          height: '100%', gap: 16
        }}>
          <p style={{ color: '#9CA3AF', fontSize: 14 }}>
            Preview not available in this browser
          </p>
          
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#1A56DB',
              color: 'white',
              padding: '10px 20px',
              borderRadius: 8,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            Open PDF ↗
          </a>
        </div>
      </object>

  Loading state:
    While fetching the signed URL, show a centred 
    spinner in the modal body:
      <Loader2 
        size={32} 
        className="animate-spin" 
        color="#6B7280" 
      />

  Close behaviour:
    - X button closes modal
    - Clicking the overlay (outside modal) closes modal
    - Escape key closes modal:
        useEffect(() => {
          const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeModal();
          };
          window.addEventListener('keydown', handler);
          return () => window.removeEventListener('keydown', handler);
        }, []);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Do not add any editing functionality — preview only
- Do not change the Upload new CV button or flow
- Do not change the delete (trash) functionality
- Do not change any other screens
- The trash icon click must NOT trigger the card click — 
  add e.stopPropagation() to the trash button onClick
- If cv_profiles does not store a file path for storage 
  retrieval, check if there is a file_url or parsed_text 
  field — read the table structure before implementing
- If the CV was stored as parsed text only (no file), 
  show a message: "Original file not available for preview"
  with an explanation that the CV was processed on upload