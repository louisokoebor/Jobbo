// pdf-generator.js
// Browser-side PDF generation for Applyly
// Drop this into your Figma Make project as a utility/helper
// No API keys, no Edge Function needed — runs entirely in the browser
//
// Dependencies (add these script tags to your app's HTML head):
// <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
//
// Usage:
//   import { downloadCvPdf, downloadCoverLetterPdf } from './pdf-generator.js'
//   await downloadCvPdf(cvJson, 'clean')
//   await downloadCoverLetterPdf(content, 'Jane Smith')

// ── HTML ESCAPE HELPER ────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── TEMPLATE BUILDERS ─────────────────────────────────────────────────────────

function buildCleanTemplate(cv) {
  const wh = cv.work_history ?? [];
  const edu = cv.education ?? [];
  const certs = cv.certifications ?? [];
  const skills = cv.skills ?? [];

  return `
    <div style="font-family: Georgia, serif; font-size: 11px; color: #1a1a1a; background: #fff; padding: 40px 48px; line-height: 1.5; max-width: 794px; margin: 0 auto;">

      <h1 style="font-family: Georgia, serif; font-size: 24px; font-weight: bold; color: #0f172a; margin: 0 0 4px 0; letter-spacing: -0.3px;">
        ${esc(cv.name ?? "")}
      </h1>

      <div style="font-size: 10px; color: #4b5563; margin-bottom: 20px;">
        ${cv.email ? `<span style="margin-right:12px;">${esc(cv.email)}</span>` : ""}
        ${cv.phone ? `<span style="margin-right:12px;">${esc(cv.phone)}</span>` : ""}
        ${cv.location ? `<span style="margin-right:12px;">${esc(cv.location)}</span>` : ""}
        ${cv.linkedin ? `<span style="margin-right:12px;">${esc(cv.linkedin)}</span>` : ""}
        ${cv.portfolio ? `<span>${esc(cv.portfolio)}</span>` : ""}
      </div>

      <hr style="border: none; border-top: 1px solid #d1d5db; margin: 0 0 16px 0;">

      ${cv.summary ? `
        <div style="margin-bottom: 16px;">
          <div style="font-family: Arial, sans-serif; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; margin-bottom: 8px;">
            Professional Summary
          </div>
          <div style="font-size: 11px; color: #374151; line-height: 1.6;">${esc(cv.summary)}</div>
        </div>
      ` : ""}

      ${skills.length > 0 ? `
        <div style="margin-bottom: 16px;">
          <div style="font-family: Arial, sans-serif; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; margin-bottom: 8px;">
            Skills
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            ${skills.map(s => `
              <span style="background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 3px; padding: 2px 8px; font-size: 10px; font-family: Arial, sans-serif; color: #374151;">
                ${esc(s)}
              </span>
            `).join("")}
          </div>
        </div>
      ` : ""}

      ${wh.length > 0 ? `
        <div style="margin-bottom: 16px;">
          <div style="font-family: Arial, sans-serif; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; margin-bottom: 8px;">
            Experience
          </div>
          ${wh.map(role => `
            <div style="margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2px;">
                <div>
                  <div style="font-weight: bold; font-size: 11px; color: #0f172a;">${esc(role.title)}</div>
                  <div style="font-size: 10px; color: #6b7280;">${esc(role.company)}</div>
                </div>
                <div style="font-size: 10px; color: #6b7280; white-space: nowrap;">
                  ${esc(role.start_date)} – ${esc(role.end_date)}
                </div>
              </div>
              ${(role.bullets ?? []).length > 0 ? `
                <ul style="margin: 4px 0 0 14px; padding: 0;">
                  ${role.bullets.map(b => `
                    <li style="margin-bottom: 2px; font-size: 10.5px; color: #374151;">${esc(b)}</li>
                  `).join("")}
                </ul>
              ` : ""}
            </div>
          `).join("")}
        </div>
      ` : ""}

      ${edu.length > 0 ? `
        <div style="margin-bottom: 16px;">
          <div style="font-family: Arial, sans-serif; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; margin-bottom: 8px;">
            Education
          </div>
          ${edu.map(e => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              <div>
                <div style="font-weight: bold; font-size: 11px;">${esc(e.qualification)}</div>
                <div style="font-size: 10px; color: #6b7280;">
                  ${esc(e.institution)}${e.grade ? ` · ${esc(e.grade)}` : ""}
                </div>
              </div>
              <div style="font-size: 10px; color: #6b7280;">${esc(e.dates)}</div>
            </div>
          `).join("")}
        </div>
      ` : ""}

      ${certs.length > 0 ? `
        <div style="margin-bottom: 16px;">
          <div style="font-family: Arial, sans-serif; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; margin-bottom: 8px;">
            Certifications
          </div>
          ${certs.map(c => `
            <div style="margin-bottom: 4px; font-size: 10.5px;">
              <span style="font-weight: bold;">${esc(c.name)}</span>
              ${c.issuer ? `<span style="color: #6b7280;"> · ${esc(c.issuer)}</span>` : ""}
              ${c.year ? `<span style="color: #6b7280;"> · ${esc(c.year)}</span>` : ""}
            </div>
          `).join("")}
        </div>
      ` : ""}

    </div>
  `;
}

function buildSidebarTemplate(cv) {
  const wh = cv.work_history ?? [];
  const edu = cv.education ?? [];
  const skills = cv.skills ?? [];

  return `
    <div style="font-family: Arial, sans-serif; font-size: 10.5px; color: #1a1a1a; background: #fff; display: flex; max-width: 794px; margin: 0 auto; min-height: 1123px;">

      <div style="width: 30%; background: #1e293b; color: #f1f5f9; padding: 32px 20px; min-height: 1123px;">
        <div style="font-size: 17px; font-weight: bold; color: #fff; margin-bottom: 4px; line-height: 1.2;">
          ${esc(cv.name ?? "")}
        </div>
        ${wh[0]?.title ? `
          <div style="font-size: 11px; color: #94a3b8; margin-bottom: 20px;">${esc(wh[0].title)}</div>
        ` : ""}

        <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin-bottom: 6px; margin-top: 16px;">Contact</div>
        ${cv.email ? `<div style="font-size: 9.5px; color: #cbd5e1; margin-bottom: 3px; word-break: break-all;">${esc(cv.email)}</div>` : ""}
        ${cv.phone ? `<div style="font-size: 9.5px; color: #cbd5e1; margin-bottom: 3px;">${esc(cv.phone)}</div>` : ""}
        ${cv.location ? `<div style="font-size: 9.5px; color: #cbd5e1; margin-bottom: 3px;">${esc(cv.location)}</div>` : ""}
        ${cv.linkedin ? `<div style="font-size: 9.5px; color: #cbd5e1; margin-bottom: 3px; word-break: break-all;">${esc(cv.linkedin)}</div>` : ""}

        ${skills.length > 0 ? `
          <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin-bottom: 6px; margin-top: 16px;">Skills</div>
          ${skills.map(s => `
            <span style="background: rgba(255,255,255,0.08); border-radius: 3px; padding: 2px 7px; font-size: 9.5px; color: #e2e8f0; display: inline-block; margin: 2px 2px 2px 0;">
              ${esc(s)}
            </span>
          `).join("")}
        ` : ""}
      </div>

      <div style="width: 70%; padding: 32px 28px;">
        ${cv.summary ? `
          <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #1a56db; border-bottom: 1.5px solid #1a56db; padding-bottom: 3px; margin-bottom: 10px;">
            Profile
          </div>
          <div style="font-size: 10.5px; color: #374151; line-height: 1.6; margin-bottom: 18px;">${esc(cv.summary)}</div>
        ` : ""}

        ${wh.length > 0 ? `
          <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #1a56db; border-bottom: 1.5px solid #1a56db; padding-bottom: 3px; margin-bottom: 10px;">
            Experience
          </div>
          ${wh.map(role => `
            <div style="margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                <div>
                  <div style="font-weight: bold; font-size: 11px;">${esc(role.title)}</div>
                  <div style="font-size: 10px; color: #6b7280;">${esc(role.company)}</div>
                </div>
                <div style="font-size: 10px; color: #6b7280; white-space: nowrap;">
                  ${esc(role.start_date)} – ${esc(role.end_date)}
                </div>
              </div>
              ${(role.bullets ?? []).length > 0 ? `
                <ul style="margin: 4px 0 0 14px; padding: 0;">
                  ${role.bullets.map(b => `<li style="margin-bottom: 2px; font-size: 10px; color: #374151;">${esc(b)}</li>`).join("")}
                </ul>
              ` : ""}
            </div>
          `).join("")}
        ` : ""}

        ${edu.length > 0 ? `
          <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #1a56db; border-bottom: 1.5px solid #1a56db; padding-bottom: 3px; margin-bottom: 10px; margin-top: 18px;">
            Education
          </div>
          ${edu.map(e => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              <div>
                <div style="font-weight: bold; font-size: 10.5px;">${esc(e.qualification)}</div>
                <div style="font-size: 10px; color: #6b7280;">${esc(e.institution)}${e.grade ? ` · ${esc(e.grade)}` : ""}</div>
              </div>
              <div style="font-size: 10px; color: #6b7280;">${esc(e.dates)}</div>
            </div>
          `).join("")}
        ` : ""}
      </div>

    </div>
  `;
}

function buildMinimalTemplate(cv) {
  const wh = cv.work_history ?? [];
  const edu = cv.education ?? [];
  const skills = cv.skills ?? [];

  return `
    <div style="font-family: Arial, sans-serif; font-size: 11px; color: #111; background: #fff; padding: 44px 52px; line-height: 1.55; max-width: 794px; margin: 0 auto;">

      <h1 style="font-size: 26px; font-weight: 700; letter-spacing: -0.5px; margin: 0 0 2px 0;">
        ${esc(cv.name ?? "")}
      </h1>

      <div style="font-size: 10px; color: #555; margin-bottom: 28px;">
        ${cv.email ? `<span style="margin-right:16px;">${esc(cv.email)}</span>` : ""}
        ${cv.phone ? `<span style="margin-right:16px;">${esc(cv.phone)}</span>` : ""}
        ${cv.location ? `<span style="margin-right:16px;">${esc(cv.location)}</span>` : ""}
        ${cv.linkedin ? `<span>${esc(cv.linkedin)}</span>` : ""}
      </div>

      ${cv.summary ? `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #888; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 10px;">
            Summary
          </div>
          <div style="color: #333; line-height: 1.65;">${esc(cv.summary)}</div>
        </div>
      ` : ""}

      ${skills.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #888; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 10px;">
            Skills
          </div>
          <div style="color: #333;">${skills.join(" · ")}</div>
        </div>
      ` : ""}

      ${wh.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #888; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 10px;">
            Experience
          </div>
          ${wh.map(role => `
            <div style="margin-bottom: 14px;">
              <div style="display: flex; justify-content: space-between;">
                <span style="font-weight: 700; font-size: 11.5px;">${esc(role.title)}</span>
                <span style="font-size: 10px; color: #666;">${esc(role.start_date)} – ${esc(role.end_date)}</span>
              </div>
              <div style="font-size: 10px; color: #666; margin-top: 1px;">${esc(role.company)}</div>
              ${(role.bullets ?? []).length > 0 ? `
                <ul style="margin: 5px 0 0 16px; padding: 0;">
                  ${role.bullets.map(b => `<li style="margin-bottom: 2px; font-size: 10.5px; color: #333;">${esc(b)}</li>`).join("")}
                </ul>
              ` : ""}
            </div>
          `).join("")}
        </div>
      ` : ""}

      ${edu.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #888; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 10px;">
            Education
          </div>
          ${edu.map(e => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              <div>
                <div style="font-weight: 700;">${esc(e.qualification)}</div>
                <div style="font-size: 10px; color: #666;">${esc(e.institution)}${e.grade ? ` · ${esc(e.grade)}` : ""}</div>
              </div>
              <div style="font-size: 10px; color: #666;">${esc(e.dates)}</div>
            </div>
          `).join("")}
        </div>
      ` : ""}

    </div>
  `;
}

function buildCoverLetterTemplate(content, name) {
  const paragraphs = content.split("\n").filter(p => p.trim().length > 0);
  return `
    <div style="font-family: Georgia, serif; font-size: 11.5px; color: #1a1a1a; background: #fff; padding: 52px 60px; line-height: 1.7; max-width: 794px; margin: 0 auto;">
      ${name ? `<div style="font-size: 18px; font-weight: bold; margin-bottom: 24px;">${esc(name)}</div>` : ""}
      ${paragraphs.map(p => `<p style="margin-bottom: 14px;">${esc(p)}</p>`).join("")}
    </div>
  `;
}

// ── PDF OPTIONS ───────────────────────────────────────────────────────────────

const PDF_OPTIONS = {
  margin: 0,
  filename: "applyly-cv.pdf",
  image: { type: "jpeg", quality: 0.98 },
  html2canvas: {
    scale: 2,           // High DPI for crisp text
    useCORS: true,
    letterRendering: true,
    logging: false,
  },
  jsPDF: {
    unit: "mm",
    format: "a4",
    orientation: "portrait",
  },
  pagebreak: { mode: ["avoid-all", "css", "legacy"] },
};

// ── PUBLIC API ────────────────────────────────────────────────────────────────

/**
 * Generate and download a CV as PDF in the browser.
 *
 * @param {object} cvJson     - The cv_json object from generated_cvs table
 * @param {string} templateId - 'clean' | 'sidebar' | 'minimal'
 * @param {string} fileName   - optional custom filename
 */
export async function downloadCvPdf(cvJson, templateId = "clean", fileName = null) {
  // Build the HTML for the selected template
  let html;
  if (templateId === "sidebar") {
    html = buildSidebarTemplate(cvJson);
  } else if (templateId === "minimal") {
    html = buildMinimalTemplate(cvJson);
  } else {
    html = buildCleanTemplate(cvJson);
  }

  // Create a hidden container to render into
  const container = document.createElement("div");
  container.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:794px;";
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const cvName = (cvJson.name ?? "cv").toLowerCase().replace(/\s+/g, "-");
    const outputFileName = fileName ?? `${cvName}-cv.pdf`;

    await window.html2pdf()
      .set({ ...PDF_OPTIONS, filename: outputFileName })
      .from(container)
      .save();
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Generate and download a cover letter as PDF in the browser.
 *
 * @param {string} content  - Cover letter text (plain text with \n line breaks)
 * @param {string} name     - Candidate name for the header
 * @param {string} fileName - optional custom filename
 */
export async function downloadCoverLetterPdf(content, name = "", fileName = "cover-letter.pdf") {
  const html = buildCoverLetterTemplate(content, name);

  const container = document.createElement("div");
  container.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:794px;";
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    await window.html2pdf()
      .set({ ...PDF_OPTIONS, filename: fileName })
      .from(container)
      .save();
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Generate a PDF preview blob URL (for showing in the preview modal).
 * Returns a blob URL string — remember to revoke it when done: URL.revokeObjectURL(url)
 *
 * @param {object} cvJson     - The cv_json object
 * @param {string} templateId - 'clean' | 'sidebar' | 'minimal'
 */
export async function getCvPdfBlobUrl(cvJson, templateId = "clean") {
  let html;
  if (templateId === "sidebar") {
    html = buildSidebarTemplate(cvJson);
  } else if (templateId === "minimal") {
    html = buildMinimalTemplate(cvJson);
  } else {
    html = buildCleanTemplate(cvJson);
  }

  const container = document.createElement("div");
  container.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:794px;";
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const pdfBlob = await window.html2pdf()
      .set(PDF_OPTIONS)
      .from(container)
      .outputPdf("blob");

    return URL.createObjectURL(pdfBlob);
  } finally {
    document.body.removeChild(container);
  }
}