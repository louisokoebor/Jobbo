Fix two issues with the CV PDF output.
Do NOT change any other screens, routing, or auth flow.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ISSUE 1 — CV has no bottom margin/padding
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Find the CV document container — the white element 
that wraps all CV content in both the editor preview 
and PDF preview modal.

Add bottom padding so content never sits flush against 
the bottom edge:

  padding-bottom: 48px  (matching the top padding)

Also ensure the last section on the CV (likely 
Certifications or Education) has margin-bottom: 0 
so the padding alone controls the spacing — no 
double gap at the bottom.

If the CV is rendered as multiple page divs, apply 
padding-bottom: 48px to each page div, not just 
the outer container.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ISSUE 2 — Downloaded PDF is 11MB (should be ~500KB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DIAGNOSE FIRST — read the PDF generation code and 
identify:
1. What scale is being passed to html2canvas?
2. Is it exporting as PNG (toDataURL()) or JPEG 
   (toDataURL('image/jpeg', quality))?
3. Is html2canvas capturing the entire page/window 
   or just the document element?
4. Are there any images in the CV (profile photo, 
   logos) that are being captured at full resolution?

The 11MB size points to one or more of these causes:

CAUSE A — scale too high on html2canvas:
  scale: 2 at A4 size = ~6000x8500px canvas
  scale: 3 = ~9000x12700px — enormous
  
  Fix: Use scale: 1.5 for a good quality/size balance
  At A4 this produces ~300-400KB output
  scale: 2 is only needed for retina display quality 
  which is unnecessary for a CV PDF

CAUSE B — PNG encoding instead of JPEG:
  canvas.toDataURL() defaults to PNG — lossless, huge
  canvas.toDataURL('image/png') — same, huge
  
  Fix: Always use JPEG with quality 0.92:
    canvas.toDataURL('image/jpeg', 0.92)
  JPEG compresses text-heavy documents extremely well
  A CV at JPEG 0.92 quality is visually identical to 
  PNG but 10-15x smaller

CAUSE C — Capturing too large an area:
  If html2canvas is targeting document.body or a 
  container larger than the CV element itself, it 
  captures everything including hidden overflow
  
  Fix: Target ONLY the CV document element:
    const element = document.getElementById('cv-document');
    // NOT document.body or a full-page wrapper

CAUSE D — No compression on the jsPDF image add:
  pdf.addImage(dataUrl, 'PNG', ...) — uncompressed
  
  Fix: Use JPEG format in addImage:
    pdf.addImage(dataUrl, 'JPEG', 0, 0, width, height, 
                 '', 'FAST')
  The 'FAST' compression flag reduces size further

APPLY ALL FOUR FIXES together:

  // 1. Target only the CV document element
  const cvElement = document.getElementById('cv-document');
  if (!cvElement) return;
  
  // 2. Capture at scale 1.5 not 2
  const canvas = await html2canvas(cvElement, {
    scale: 1.5,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    logging: false,
    // Only capture the element dimensions
    width: cvElement.offsetWidth,
    height: cvElement.scrollHeight,
    windowWidth: cvElement.offsetWidth,
    windowHeight: cvElement.scrollHeight,
  });
  
  // 3. Export as JPEG not PNG
  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  
  const PDF_PAGE_WIDTH = 794;
  const PDF_PAGE_HEIGHT = 1123;
  
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: [PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT],
    compress: true,  // enable built-in jsPDF compression
  });
  
  const imgWidth = PDF_PAGE_WIDTH;
  const imgHeight = (canvas.height / canvas.width) * imgWidth;
  const totalPages = Math.ceil(imgHeight / PDF_PAGE_HEIGHT);
  
  for (let page = 0; page < totalPages; page++) {
    if (page > 0) pdf.addPage();
    
    // 4. Use JPEG format and FAST compression in addImage
    pdf.addImage(
      imgData,
      'JPEG',
      0,
      -(page * PDF_PAGE_HEIGHT),
      imgWidth,
      imgHeight,
      '',      // alias
      'FAST',  // compression
    );
  }
  
  // Name the file with candidate name and role
  const fileName = `${candidateName?.replace(/\s+/g, '_') ?? 'CV'}.pdf`;
  pdf.save(fileName);

EXPECTED RESULT after fixes:
  Current: ~11MB
  Target:  300KB - 700KB
  
  If still over 1MB after these fixes, reduce scale 
  to 1.2 and JPEG quality to 0.88 — still visually 
  excellent for a text document.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Do not change CV content, data model, or templates
- Do not change any other screens
- Make sure the cv-document element has 
  id="cv-document" if it does not already — 
  this is needed for the targeted capture in Issue 2
- Page break dashed indicators added in the previous 
  fix must be hidden before capture and restored after:
    pageBreakEls.forEach(el => el.style.display = 'none');
    await html2canvas(...);
    pageBreakEls.forEach(el => el.style.display = '');
- Do not change the PDF generation method — 
  only optimise the existing approach