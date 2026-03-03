import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const app = new Hono();

app.use("*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization", "apikey", "X-User-Token"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
}));

app.use("*", logger());

app.onError((err, c) => {
  console.log("Unhandled server error:", err?.message ?? err);
  return c.json({ success: false, error: "Internal server error" }, 500);
});

// ── Shared helpers ──────────────────────────────────────────────────────────
let _sb: ReturnType<typeof createClient> | null = null;
function sb() {
  if (!_sb) _sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  return _sb;
}

function openaiKey() {
  const k = Deno.env.get("OPENAI_API_KEY");
  if (!k) throw new Error("OPENAI_KEY_MISSING");
  return k;
}

function extractUserId(c: any): string | null {
  const token = c.req.header("X-User-Token") ?? c.req.header("Authorization")?.split(" ")[1];
  if (!token || token === Deno.env.get("SUPABASE_ANON_KEY")) return null;
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p.sub || null;
  } catch { return null; }
}

async function chatJSON(key: string, system: string, user: string, temp = 0) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini", temperature: temp,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!r.ok) { const t = await r.text(); console.log("OpenAI error:", r.status, t); return null; }
  const d = await r.json();
  const raw: string = d.choices?.[0]?.message?.content ?? "";
  return JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim());
}

const CV_SCHEMA = `{"name":"string","email":"string","phone":"string","location":"string","linkedin":"string or null","portfolio":"string or null","summary":"string","skills":["string"],"work_history":[{"title":"string","company":"string","start_date":"Month YYYY","end_date":"Month YYYY or Present","bullets":["string"]}],"education":[{"institution":"string","qualification":"string","dates":"string","grade":"string or null"}],"certifications":[],"links":[],"skills_gap":[]}`;

// ── Health ───────────────────────────────────────────────────────────────────
app.get("/make-server-3bbff5cf/health", (c) => c.json({ status: "ok" }));

// ── Parse CV ─────────────────────────────────────────────────────────────────
app.post("/make-server-3bbff5cf/parse-cv", async (c) => {
  const userId = extractUserId(c);
  if (!userId) return c.json({ success: false, message: "Unauthorized" }, 401);

  let file_url: string, label: string;
  try { const b = await c.req.json(); file_url = b.file_url; label = b.label || "My CV"; }
  catch { return c.json({ success: false, message: "Invalid request body" }, 400); }
  if (!file_url) return c.json({ success: false, message: "file_url is required" }, 400);

  let key: string;
  try { key = openaiKey(); } catch { return c.json({ success: false, message: "OpenAI API key not configured" }); }

  // Download file
  let fileBuffer: ArrayBuffer, fileContentType: string;
  try {
    const r = await fetch(file_url);
    if (!r.ok) return c.json({ success: false, message: `Failed to download file: ${r.status}` });
    fileBuffer = await r.arrayBuffer();
    fileContentType = r.headers.get("content-type") || "";
    console.log("File downloaded — size:", fileBuffer.byteLength, "type:", fileContentType);
  } catch (e) {
    console.log("Download error:", e);
    return c.json({ success: false, message: "Failed to download file from storage" });
  }

  const isPdf = fileContentType.includes("pdf") || file_url.toLowerCase().includes(".pdf");
  const isDocx = fileContentType.includes("wordprocessingml") || file_url.toLowerCase().includes(".docx");
  let parsed_json: Record<string, unknown>;

  if (isPdf) {
    // Upload to OpenAI Files API
    let fileId: string;
    try {
      const fd = new FormData();
      fd.append("file", new Blob([fileBuffer], { type: "application/pdf" }), "cv.pdf");
      fd.append("purpose", "user_data");
      const r = await fetch("https://api.openai.com/v1/files", {
        method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd,
      });
      if (!r.ok) { console.log("File upload failed:", r.status, await r.text()); return c.json({ success: false, message: "Could not send PDF to OpenAI." }); }
      fileId = (await r.json()).id;
      console.log("PDF uploaded, fileId:", fileId);
    } catch (e) { console.log("Upload exception:", e); return c.json({ success: false, message: "Failed to upload PDF." }); }

    // Parse with file reference
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini", temperature: 0,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: [
            { type: "text", text: `You are a CV parser. Read this CV and extract ALL structured data. Return ONLY valid JSON matching this schema:\n${CV_SCHEMA}` },
            { type: "file", file: { file_id: fileId } },
          ]}],
        }),
      });
      fetch(`https://api.openai.com/v1/files/${fileId}`, { method: "DELETE", headers: { Authorization: `Bearer ${key}` } }).catch(() => {});
      if (!r.ok) { console.log("Parse error:", r.status, await r.text()); return c.json({ success: false, message: "AI parsing failed." }); }
      const d = await r.json();
      const raw = (d.choices?.[0]?.message?.content ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      parsed_json = JSON.parse(raw);
      console.log("PDF parsed — name:", parsed_json.name);
    } catch (e) {
      console.log("Parse exception:", e);
      fetch(`https://api.openai.com/v1/files/${fileId}`, { method: "DELETE", headers: { Authorization: `Bearer ${key}` } }).catch(() => {});
      return c.json({ success: false, message: "Failed to parse CV." });
    }

  } else if (isDocx) {
    let text = "";
    try {
      const JSZip = (await import("npm:jszip")).default;
      const zip = await JSZip.loadAsync(fileBuffer);
      const xml = await zip.file("word/document.xml")?.async("string");
      if (xml) text = xml.replace(/<w:p[ >]/g, "\n<w:p>").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      console.log("DOCX text length:", text.length);
    } catch (e) { console.log("DOCX extraction failed:", e); }

    if (text.length < 30) return c.json({ success: false, message: "Could not extract text from DOCX." });

    const result = await chatJSON(key, `You are a CV parser. Extract structured data. Return ONLY valid JSON matching this schema:\n${CV_SCHEMA}`, `Parse this CV:\n\n${text.slice(0, 8000)}`);
    if (!result) return c.json({ success: false, message: "AI parsing failed." });
    parsed_json = result;
    console.log("DOCX parsed — name:", parsed_json.name);

  } else {
    return c.json({ success: false, message: "Unsupported file type. Upload PDF or DOCX." });
  }

  return c.json({ success: true, parsed_json, user_id: userId, label: label || (parsed_json.name as string) || "My CV" });
});

// ── Generate CV ──────────────────────────────────────────────────────────────
app.post("/make-server-3bbff5cf/generate-cv", async (c) => {
  const userId = extractUserId(c);
  if (!userId) return c.json({ success: false, error: "unauthorized" }, 401);

  let application_id: string, cv_profile_id: string;
  try { const b = await c.req.json(); application_id = b.application_id; cv_profile_id = b.cv_profile_id; }
  catch { return c.json({ success: false, error: "Invalid request body" }, 400); }
  if (!application_id || !cv_profile_id) return c.json({ success: false, error: "application_id and cv_profile_id required" }, 400);

  let key: string;
  try { key = openaiKey(); } catch { return c.json({ success: false, error: "OpenAI key not configured" }, 500); }

  const admin = sb();
  const { data: appRow, error: appErr } = await admin.from("applications").select("*").eq("id", application_id).single();
  if (appErr || !appRow) { console.log("App fetch error:", appErr); return c.json({ success: false, error: "Application not found" }, 404); }

  const { data: cvProfile, error: cvErr } = await admin.from("cv_profiles").select("*").eq("id", cv_profile_id).single();
  if (cvErr || !cvProfile) { console.log("CV fetch error:", cvErr); return c.json({ success: false, error: "CV profile not found" }, 404); }

  const job = appRow.job_parsed_json ?? {};
  const cvData = cvProfile.parsed_json ?? {};

  const prompt = `You are a professional CV writer specialising in ATS-optimised resumes.

Given the JOB DESCRIPTION and EXISTING CV, generate a tailored CV that:
1. Highlights relevant skills and experience
2. Uses keywords from the job description naturally
3. Quantifies achievements where possible
4. Maintains truthfulness
5. Identifies skills gaps

JOB: ${job.job_title || appRow.job_title || "Unknown"} at ${job.company || appRow.company || "Unknown"}
Requirements: ${JSON.stringify(job.requirements || [])}
Responsibilities: ${JSON.stringify(job.responsibilities || [])}
Key Skills: ${JSON.stringify(job.key_skills || [])}
Nice to haves: ${JSON.stringify(job.nice_to_haves || [])}

EXISTING CV:
${JSON.stringify(cvData, null, 2)}

Return ONLY valid JSON matching this schema:
${CV_SCHEMA}

skills_gap = skills from job requirements NOT in the CV.
Reword each bullet to emphasise relevance to this role.`;

  try {
    console.log("generate-cv: calling OpenAI...");
    const generatedCv = await chatJSON(key, "You are a professional CV writer. Return only valid JSON.", prompt, 0.3);
    if (!generatedCv) return c.json({ success: false, error: "AI generation failed." }, 500);
    console.log("generate-cv: success for", generatedCv.name);

    const { data: saved, error: saveErr } = await admin.from("generated_cvs")
      .insert({ application_id, cv_json: generatedCv, template_id: "clean" })
      .select("id").single();

    if (saveErr) { console.log("Save error:", saveErr); return c.json({ success: false, error: "Failed to save: " + saveErr.message }, 500); }
    return c.json({ success: true, generated_cv_id: saved.id, cv_json: generatedCv });
  } catch (e) { console.log("generate-cv exception:", e); return c.json({ success: false, error: "Failed to generate CV." }, 500); }
});

// ── Get Generated CV ─────────────────────────────────────────────────────────
app.get("/make-server-3bbff5cf/generated-cv/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const admin = sb();

    if (id.startsWith("gen_cv_")) {
      const kv = await import("./kv_store.tsx");
      const d = await kv.get(`generated_cv:${id}`);
      if (!d) return c.json({ success: false, error: "Not found" }, 404);
      let app = null;
      if (d.application_id) { const { data } = await admin.from("applications").select("job_title, company").eq("id", d.application_id).single(); app = data; }
      return c.json({ success: true, cv_json: d.cv_json, template: d.template || "clean", application_id: d.application_id, job_title: app?.job_title || "", company: app?.company || "" });
    }

    const { data: g, error } = await admin.from("generated_cvs").select("cv_json, template_id, application_id").eq("id", id).single();
    if (error || !g) return c.json({ success: false, error: "Not found" }, 404);

    let app = null;
    if (g.application_id) { const { data } = await admin.from("applications").select("job_title, company").eq("id", g.application_id).single(); app = data; }
    return c.json({ success: true, cv_json: g.cv_json, template: g.template_id || "clean", application_id: g.application_id, job_title: app?.job_title || "", company: app?.company || "" });
  } catch (e) { console.log("get-cv exception:", e); return c.json({ success: false, error: "Failed to fetch" }, 500); }
});

// ── Generate Cover Letter ────────────────────────────────────────────────────
app.post("/make-server-3bbff5cf/generate-cover-letter", async (c) => {
  const userId = extractUserId(c);
  if (!userId) return c.json({ success: false, error: "unauthorized" }, 401);

  let application_id: string, generated_cv_id: string, tone: string;
  try { const b = await c.req.json(); application_id = b.application_id; generated_cv_id = b.generated_cv_id; tone = b.tone || "professional"; }
  catch { return c.json({ success: false, error: "Invalid request body" }, 400); }
  if (!application_id || !generated_cv_id) return c.json({ success: false, error: "application_id and generated_cv_id required" }, 400);

  let key: string;
  try { key = openaiKey(); } catch { return c.json({ success: false, error: "OpenAI key not configured" }, 500); }

  const admin = sb();

  try {
    const { data: application, error: appErr } = await admin.from("applications").select("job_title, company, job_parsed_json, job_description_raw").eq("id", application_id).single();
    if (appErr || !application) return c.json({ success: false, error: "application_not_found" }, 404);

    const { data: genCv, error: cvErr } = await admin.from("generated_cvs").select("cv_json").eq("id", generated_cv_id).single();
    if (cvErr || !genCv) return c.json({ success: false, error: "generated_cv_not_found" }, 404);
    const cvJson = genCv.cv_json as Record<string, unknown>;

    const tones: Record<string, string> = {
      professional: "Professional, formal but warm tone.",
      conversational: "Natural, friendly first-person tone.",
      confident: "Assertive, achievement-focused tone.",
    };

    const wh = (cvJson.work_history as Array<Record<string, unknown>> ?? []).slice(0, 3)
      .map(r => `${r.title} at ${r.company} (${r.start_date} – ${r.end_date}): ${(r.bullets as string[] ?? []).slice(0, 3).join(" ")}`).join("\n");
    const skills = (cvJson.skills as string[] ?? []).slice(0, 15).join(", ");
    const job = (application.job_parsed_json ?? {}) as Record<string, unknown>;
    const edu = (cvJson.education as Array<Record<string, unknown>> ?? []).map(e => `${e.qualification} from ${e.institution}`).join(", ");

    const sysPrompt = `You are an expert cover letter writer. Write compelling, personalised cover letters.
Structure: 4 paragraphs, 300-400 words.
1. Opening hook showing interest in role/company
2. Why this role/company connects to your background
3. 2-3 specific achievements matching the job
4. Closing CTA
Rules: No "I am writing to apply", no consecutive "I" starts, reference specific job title and company, use only provided CV data.`;

    const userPrompt = `Write a cover letter.
CANDIDATE: ${cvJson.name ?? ""}, ${cvJson.location ?? ""}
Summary: ${cvJson.summary ?? ""}
Skills: ${skills}
Work: ${wh}
Education: ${edu}
JOB: ${application.job_title} at ${application.company}
Skills Required: ${(job.key_skills as string[] ?? []).slice(0, 10).join(", ")}
Requirements: ${(job.requirements as string[] ?? []).slice(0, 6).join("; ")}
Responsibilities: ${(job.responsibilities as string[] ?? []).slice(0, 4).join("; ")}
TONE: ${tones[tone] ?? tones.professional}
Return only letter body text (4 paragraphs, no headers/signature).`;

    console.log("generate-cover-letter: calling OpenAI...");
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.7, max_tokens: 800, messages: [{ role: "system", content: sysPrompt }, { role: "user", content: userPrompt }] }),
    });
    if (!r.ok) { console.log("OpenAI error:", r.status, await r.text()); return c.json({ success: false, error: "AI generation failed." }, 500); }
    const content = (await r.json()).choices?.[0]?.message?.content ?? "";
    if (content.length < 100) return c.json({ success: false, error: "Generated content too short." }, 500);
    console.log("Cover letter generated, length:", content.length);

    // Upsert
    const { data: existing } = await admin.from("cover_letters").select("id").eq("application_id", application_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    let clId: string;
    if (existing?.id) {
      const { data: u, error: ue } = await admin.from("cover_letters").update({ content, tone, updated_at: new Date().toISOString() }).eq("id", existing.id).select("id").single();
      if (ue) return c.json({ success: true, cover_letter_id: existing.id, content, tone });
      clId = u.id;
    } else {
      const { data: ins, error: ie } = await admin.from("cover_letters").insert({ application_id, content, tone }).select("id").single();
      if (ie) { console.log("Insert error:", ie); return c.json({ success: false, error: "Failed to save: " + ie.message }, 500); }
      clId = ins.id;
    }
    return c.json({ success: true, cover_letter_id: clId, content, tone });
  } catch (e) { console.log("cover-letter exception:", e); return c.json({ success: false, error: "Failed to generate cover letter." }, 500); }
});

// ── Application Data ─────────────────────────────────────────────────────────
app.get("/make-server-3bbff5cf/application-data/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const admin = sb();

    const { data: application, error: appErr } = await admin.from("applications").select("*").eq("id", id).single();
    if (appErr || !application) return c.json({ success: false, error: "Application not found" }, 404);

    const { data: cvData, error: cvErr } = await admin.from("generated_cvs")
      .select("id, cv_json, match_score, feedback_json, feedback_generated_at, template_id, pdf_url, created_at, updated_at")
      .eq("application_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (cvErr) console.log("CV query error:", cvErr);

    const { data: clData, error: clErr } = await admin.from("cover_letters")
      .select("id, content, tone, pdf_url, updated_at, created_at")
      .eq("application_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (clErr) console.log("CL query error:", clErr);

    const { data: notesData, error: notesErr } = await admin.from("interview_notes")
      .select("*").eq("application_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (notesErr) console.log("Notes query error:", notesErr);

    return c.json({ success: true, application, generated_cv: cvData ?? null, cover_letter: clData ?? null, notes: notesData ?? null });
  } catch (e) { console.log("application-data exception:", e); return c.json({ success: false, error: "Failed to fetch" }, 500); }
});

// ── Save Notes ───────────────────────────────────────────────────────────────
app.post("/make-server-3bbff5cf/save-notes", async (c) => {
  try {
    const { application_id, notes_text, interview_date, interview_type, outcome } = await c.req.json();
    if (!application_id) return c.json({ success: false, error: "application_id required" }, 400);

    const admin = sb();
    const { data: existing } = await admin.from("interview_notes").select("id").eq("application_id", application_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const payload = {
      notes_text: notes_text || null,
      interview_date: interview_date ? new Date(interview_date).toISOString() : null,
      interview_type: interview_type || null,
      outcome: outcome || null,
    };

    if (existing?.id) {
      const { error } = await admin.from("interview_notes").update(payload).eq("id", existing.id);
      if (error) return c.json({ success: false, error: "Failed: " + error.message }, 500);
    } else {
      const { error } = await admin.from("interview_notes").insert({ application_id, ...payload });
      if (error) return c.json({ success: false, error: "Failed: " + error.message }, 500);
    }
    return c.json({ success: true });
  } catch (e) { console.log("save-notes exception:", e); return c.json({ success: false, error: "Failed to save notes" }, 500); }
});

// ── Save Cover Letter ────────────────────────────────────────────────────────
app.post("/make-server-3bbff5cf/save-cover-letter", async (c) => {
  try {
    const { cover_letter_id, application_id, content } = await c.req.json();
    if (!application_id || !content) return c.json({ success: false, error: "application_id and content required" }, 400);
    if (!cover_letter_id) return c.json({ success: false, error: "cover_letter_id required" }, 400);

    const { error } = await sb().from("cover_letters").update({ content, updated_at: new Date().toISOString() }).eq("id", cover_letter_id);
    if (error) return c.json({ success: false, error: "Failed: " + error.message }, 500);
    return c.json({ success: true });
  } catch (e) { console.log("save-cl exception:", e); return c.json({ success: false, error: "Failed to save" }, 500); }
});

// ── Analyse Application ──────────────────────────────────────────────────────
app.post("/make-server-3bbff5cf/analyse-application", async (c) => {
  const userId = extractUserId(c);
  if (!userId) return c.json({ success: false, error: "unauthorized" }, 401);

  let application_id: string, generated_cv_id: string;
  try { const b = await c.req.json(); application_id = b.application_id; generated_cv_id = b.generated_cv_id; }
  catch { return c.json({ success: false, error: "Invalid request body" }, 400); }
  if (!application_id || !generated_cv_id) return c.json({ success: false, error: "application_id and generated_cv_id required" }, 400);

  let key: string;
  try { key = openaiKey(); } catch { return c.json({ success: false, error: "OpenAI key not configured" }, 500); }

  const admin = sb();
  try {
    const { data: application, error: appErr } = await admin.from("applications").select("job_title, company, job_parsed_json, job_description_raw").eq("id", application_id).single();
    if (appErr || !application) return c.json({ success: false, error: "Application not found" }, 404);

    const { data: genCv, error: cvErr } = await admin.from("generated_cvs").select("cv_json").eq("id", generated_cv_id).single();
    if (cvErr || !genCv) return c.json({ success: false, error: "Generated CV not found" }, 404);

    const cvJson = genCv.cv_json as Record<string, unknown>;
    const job = (application.job_parsed_json ?? {}) as Record<string, unknown>;

    const sysPrompt = `You are an expert ATS consultant. Analyse CVs against job descriptions honestly and specifically.
Return ONLY valid JSON:
{"overall_score":<0-100>,"verdict_summary":"<2-3 sentences>","interview_likelihood":"<high|medium|low>","interview_likelihood_reasoning":"<1 sentence>","cv_quality":{"summary_quality":{"score":<0-10>,"feedback":"<specific>"},"bullet_strength":{"score":<0-10>,"feedback":"<specific>"},"keyword_match":{"score":<0-10>,"feedback":"<specific>"}},"strengths":[{"title":"<short>","detail":"<specific>"}],"weaknesses":[{"title":"<short>","detail":"<specific>","fix":"<actionable>"}],"top_actions":[{"action":"<what>","reason":"<why>"}],"missing_keywords":["<keyword>"]}
Rules: 85+=strong, 70-84=good with gaps, 50-69=needs work, <50=poor. 2-4 strengths/weaknesses. 3 top_actions. 3-8 missing_keywords.`;

    const userPrompt = `Analyse this CV vs job.
JOB: ${job.job_title || application.job_title || "?"} at ${job.company || application.company || "?"}
Requirements: ${JSON.stringify(job.requirements || [])}
Responsibilities: ${JSON.stringify(job.responsibilities || [])}
Key Skills: ${JSON.stringify(job.key_skills || [])}
Nice to haves: ${JSON.stringify(job.nice_to_haves || [])}
Raw: ${(application.job_description_raw || "").slice(0, 3000)}

CV:
${JSON.stringify(cvJson, null, 2)}`;

    console.log("analyse-application: calling OpenAI...");
    const feedback = await chatJSON(key, sysPrompt, userPrompt, 0.3);
    if (!feedback) return c.json({ success: false, error: "AI analysis failed." }, 500);
    console.log("Analysis complete, score:", feedback.overall_score);

    const { error: ue } = await admin.from("generated_cvs").update({
      feedback_json: feedback, feedback_generated_at: new Date().toISOString(),
      match_score: feedback.overall_score, updated_at: new Date().toISOString(),
    }).eq("id", generated_cv_id);
    if (ue) console.log("Save feedback error (non-fatal):", ue);

    return c.json({ success: true, feedback });
  } catch (e) { console.log("analyse exception:", e); return c.json({ success: false, error: "Failed to analyse." }, 500); }
});

Deno.serve(app.fetch);
