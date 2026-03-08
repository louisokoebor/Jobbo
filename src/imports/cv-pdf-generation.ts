Rebuild the CV PDF generation to produce a proper text-based PDF 
instead of an image screenshot. The current html2canvas approach 
produces image-only PDFs where text cannot be copied, quality is 
poor, and file sizes are large.

Do NOT change any other screens, routing, or auth flow.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHY THIS MATTERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

html2canvas screenshots the DOM and embeds it as a JPEG image 
inside a PDF. This means:
- Text cannot be selected, copied, or searched
- ATS systems cannot parse the CV content
- Quality degrades at any zoom level
- File sizes are large even with compression

A proper CV PDF must have selectable, searchable text.
ATS parsers need to read the text — an image PDF will fail 
real ATS parsing entirely, which defeats the purpose of Applyly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SOLUTION — Server-side PDF generation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Replace client-side html2canvas with a server-side endpoint 
that generates a proper PDF from the CV JSON data.

Use the 'pdf-lib' npm package in the Edge Function — it 
creates real text-based PDFs programmatically.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — New Edge Function endpoint: generate-pdf
Add to supabase/functions/server/index.tsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Install pdf-lib in the edge functions:
  Import from CDN in the edge function:
  import { PDFDocument, rgb, StandardFonts, PageSizes } 
    from 'https://esm.sh/pdf-lib@1.17.1';

app.post('/make-server-3bbff5cf/generate-pdf', async (c) => {
  const userId = extractUserId(c);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);

  let cvJson: any, templateId: string;
  try {
    const b = await c.req.json();
    cvJson = b.cv_json;
    templateId = b.template_id || 'clean';
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  // Plan check for pro templates
  if (['sidebar', 'minimal'].includes(templateId)) {
    const { data: userData } = await sb()
      .from('users')
      .select('plan_tier')
      .eq('id', userId)
      .single();
    if (userData?.plan_tier !== 'pro') {
      templateId = 'clean';
    }
  }

  try {
    const pdfBytes = await buildPDF(cvJson, templateId);
    
    return new Response(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${
          cvJson.name?.replace(/\s+/g, '_') ?? 'CV'
        }.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[generate-pdf] error:', err);
    return c.json({ error: 'PDF generation failed' }, 500);
  }
});

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — buildPDF function
Add in the same file, above the route handler
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function buildPDF(cv: any, template: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  
  const regularFont  = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont     = await doc.embedFont(StandardFonts.HelveticaBold);
  const italicFont   = await doc.embedFont(StandardFonts.HelveticaOblique);

  // A4 dimensions in points (1pt = 1/72 inch)
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN_TOP    = 48;
  const MARGIN_BOTTOM = 56;
  const MARGIN_LEFT   = 52;
  const MARGIN_RIGHT  = 52;
  const CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;

  // Colours
  const BLACK      = rgb(0.10, 0.10, 0.10);
  const DARK_GREY  = rgb(0.30, 0.30, 0.30);
  const MID_GREY   = rgb(0.50, 0.50, 0.50);
  const ACCENT     = rgb(0.10, 0.33, 0.85); // brand blue for company names

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_TOP;

  // Helper: add new page when needed
  function checkPageBreak(neededHeight: number) {
    if (y - neededHeight < MARGIN_BOTTOM) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN_TOP;
    }
  }

  // Helper: draw text and advance y
  function drawText(
    text: string,
    opts: {
      font?: typeof regularFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      x?: number;
      indent?: number;
      maxWidth?: number;
      lineHeight?: number;
    } = {}
  ) {
    const font       = opts.font       ?? regularFont;
    const size       = opts.size       ?? 10;
    const color      = opts.color      ?? BLACK;
    const x          = opts.x          ?? MARGIN_LEFT + (opts.indent ?? 0);
    const maxWidth   = opts.maxWidth   ?? (CONTENT_W - (opts.indent ?? 0));
    const lineHeight = opts.lineHeight ?? size * 1.4;

    // Word-wrap
    const words = text.split(' ');
    let line = '';
    const lines: string[] = [];

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      const w = font.widthOfTextAtSize(test, size);
      if (w > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);

    for (const l of lines) {
      checkPageBreak(lineHeight);
      page.drawText(l, { x, y: y - size, font, size, color });
      y -= lineHeight;
    }
  }

  // Helper: draw horizontal rule
  function drawRule(gapBefore = 6, gapAfter = 6) {
    y -= gapBefore;
    checkPageBreak(2);
    page.drawLine({
      start: { x: MARGIN_LEFT, y },
      end:   { x: PAGE_W - MARGIN_RIGHT, y },
      thickness: 0.5,
      color: rgb(0.80, 0.80, 0.80),
    });
    y -= gapAfter;
  }

  // Helper: section heading
  function drawSectionHeading(label: string) {
    y -= 10;
    checkPageBreak(24);
    drawText(label.toUpperCase(), {
      font: boldFont, size: 8.5,
      color: DARK_GREY,
    });
    drawRule(3, 6);
  }

  // ── HEADER ─────────────────────────────
  // Name
  drawText(cv.name ?? '', { font: boldFont, size: 20, color: BLACK });
  y -= 2;

  // Contact line
  const contactParts = [
    cv.email, cv.phone, cv.location, cv.linkedin
  ].filter(Boolean);
  drawText(contactParts.join('  ·  '), {
    font: regularFont, size: 9, color: MID_GREY
  });
  y -= 8;

  // ── PROFESSIONAL SUMMARY ───────────────
  if (cv.summary) {
    drawSectionHeading('Professional Summary');
    drawText(cv.summary, {
      font: regularFont, size: 10, color: DARK_GREY,
      lineHeight: 14.5
    });
    y -= 4;
  }

  // ── SKILLS ─────────────────────────────
  if (cv.skills?.length) {
    drawSectionHeading('Skills');
    drawText(cv.skills.join(', '), {
      font: regularFont, size: 10, color: DARK_GREY,
      lineHeight: 14.5
    });
    y -= 4;
  }

  // ── WORK EXPERIENCE ────────────────────
  if (cv.work_history?.length) {
    drawSectionHeading('Work Experience');

    for (const role of cv.work_history) {
      checkPageBreak(40);
      
      // Role title (bold) + dates (right-aligned)
      const dateStr = `${role.start_date ?? ''} – ${role.end_date ?? 'Present'}`;
      const dateW = boldFont.widthOfTextAtSize(dateStr, 9.5);
      
      drawText(role.title ?? '', {
        font: boldFont, size: 10.5, color: BLACK,
        maxWidth: CONTENT_W - dateW - 8,
      });
      // Date — draw on same line as title
      // Re-draw on same y (drawText already advanced y, 
      // so step back up for the date)
      const titleLineH = 10.5 * 1.4;
      page.drawText(dateStr, {
        x: PAGE_W - MARGIN_RIGHT - dateW,
        y: y + titleLineH - 10.5,
        font: regularFont,
        size: 9.5,
        color: MID_GREY,
      });

      // Company name
      drawText(role.company ?? '', {
        font: regularFont, size: 9.5, color: ACCENT,
        lineHeight: 13,
      });
      y -= 2;

      // Bullets
      const bullets = Array.isArray(role.bullets) ? role.bullets : [];
      for (const bullet of bullets) {
        checkPageBreak(16);
        // Em dash prefix
        drawText(`— ${bullet}`, {
          font: regularFont, size: 9.5, color: DARK_GREY,
          indent: 8, lineHeight: 14,
        });
      }
      y -= 8;
    }
  }

  // ── EDUCATION ──────────────────────────
  if (cv.education?.length) {
    drawSectionHeading('Education');

    for (const edu of cv.education) {
      checkPageBreak(28);

      const yearStr = edu.year ?? edu.end_date ?? '';
      const yearW = boldFont.widthOfTextAtSize(yearStr, 10);
      
      drawText(edu.degree ?? edu.qualification ?? '', {
        font: boldFont, size: 10, color: BLACK,
        maxWidth: CONTENT_W - yearW - 8,
      });
      if (yearStr) {
        page.drawText(yearStr, {
          x: PAGE_W - MARGIN_RIGHT - yearW,
          y: y + (10 * 1.4) - 10,
          font: regularFont, size: 10, color: MID_GREY,
        });
      }

      const institutionParts = [edu.institution, edu.grade]
        .filter(Boolean).join(' · ');
      if (institutionParts) {
        drawText(institutionParts, {
          font: italicFont, size: 9.5, color: MID_GREY,
          lineHeight: 13,
        });
      }
      y -= 6;
    }
  }

  // ── CERTIFICATIONS ─────────────────────
  const certs = cv.certifications ?? cv.certificates ?? [];
  if (certs.length) {
    drawSectionHeading('Certifications');
    for (const cert of certs) {
      checkPageBreak(16);
      const certLabel = typeof cert === 'string' 
        ? cert 
        : (cert.name ?? cert.title ?? '');
      drawText(certLabel, {
        font: regularFont, size: 10, color: DARK_GREY,
        lineHeight: 14,
      });
    }
  }

  return doc.save();
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — Update the Download PDF button in the client
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Replace the html2canvas download logic entirely.
Find the Download PDF / Save PDF button handler and 
replace with:

  async function handleDownloadPDF() {
    setIsGeneratingPDF(true);
    try {
      const token = await getAuthToken();
      const response = await fetch(
        '/make-server-3bbff5cf/generate-pdf',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            cv_json: cvData,
            template_id: selectedTemplate,
          }),
        }
      );

      if (!response.ok) throw new Error('PDF generation failed');

      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${cvData.name?.replace(/\s+/g, '_') ?? 'CV'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[download-pdf] error:', err);
      // Show error toast
    } finally {
      setIsGeneratingPDF(false);
    }
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — Remove html2canvas entirely
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━