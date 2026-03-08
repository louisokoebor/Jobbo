import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import Stripe from "npm:stripe";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

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

function stripeClient() {
  return new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
}

function extractUserId(c: any): string | null {
  const token = c.req.header("X-User-Token") ?? c.req.header("Authorization")?.split(" ")[1];
  if (!token || token === Deno.env.get("SUPABASE_ANON_KEY")) return null;
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p.sub || null;
  } catch { return null; }
}

async function chatJSON(key: string, system: string, user: string, temp = 0, opts?: { model?: string; max_tokens?: number }) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts?.model ?? "gpt-4o-mini", temperature: temp,
      ...(opts?.max_tokens ? { max_tokens: opts.max_tokens } : {}),
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

// ── Create Stripe Checkout Session ──────────────────────────────────────────
app.post("/make-server-3bbff5cf/create-checkout-session", async (c) => {
  const userId = extractUserId(c);
  if (!userId) return c.json({ success: false, error: "unauthorized" }, 401);

  const { priceId, planId } = await c.req.json();
  if (!priceId) return c.json({ success: false, error: "priceId required" }, 400);

  const { data: userData } = await sb()
    .from("users")
    .select("email, stripe_customer_id")
    .eq("id", userId)
    .single();

  try {
    let customerId = userData?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripeClient().customers.create({
        email: userData?.email,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;
      // Save customer ID immediately
      await sb().from("users").update({ stripe_customer_id: customerId }).eq("id", userId);
    }

    const session = await stripeClient().checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${c.req.header("origin") || "https://applyly.figma.site"}/billing?success=true&plan=${planId}`,
      cancel_url: `${c.req.header("origin") || "https://applyly.figma.site"}/billing?cancelled=true`,
      metadata: {
        supabase_user_id: userId,
        plan_id: planId,
      },
      allow_promotion_codes: true,
    });

    return c.json({ success: true, url: session.url });
  } catch (err: any) {
    console.log("Checkout session error:", err?.message ?? err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ── Create Stripe Customer Portal Session ───────────────────────────────────
app.post("/make-server-3bbff5cf/create-portal-session", async (c) => {
  const userId = extractUserId(c);
  if (!userId) return c.json({ success: false, error: "unauthorized" }, 401);

  const { data: userData } = await sb()
    .from("users")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  if (!userData?.stripe_customer_id) {
    return c.json({ success: false, error: "No Stripe customer found" }, 404);
  }

  try {
    const session = await stripeClient().billingPortal.sessions.create({
      customer: userData.stripe_customer_id,
      return_url: `${c.req.header("origin") || "https://applyly.figma.site"}/billing`,
    });

    return c.json({ success: true, url: session.url });
  } catch (err: any) {
    console.log("Portal session error:", err?.message ?? err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ── Stripe Webhook ──────────────────────────────────────────────────────────
app.post("/make-server-3bbff5cf/stripe-webhook", async (c) => {
  const signature = c.req.header("stripe-signature");
  const body = await c.req.text();

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(
      body,
      signature!,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
    );
  } catch (err: any) {
    console.log("Webhook signature failed:", err?.message ?? err);
    return c.json({ error: "Invalid signature" }, 400);
  }

  console.log("[Stripe Webhook] event type:", event.type);
  const admin = sb();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.supabase_user_id;
    const customerId = session.customer as string;

    if (!userId) {
      console.log("No supabase_user_id in session metadata");
      return c.json({ error: "Missing metadata" }, 400);
    }

    const subscription = await stripeClient().subscriptions.retrieve(
      session.subscription as string,
    );

    console.log("[webhook] updating user to pro, userId:", userId, "customerId:", customerId);
    const updatePayload = {
      plan_tier: "pro",
      generations_limit: 999,
      stripe_customer_id: customerId,
      plan_expires_at: new Date(subscription.current_period_end * 1000).toISOString(),
    };
    console.log("[webhook] update payload:", JSON.stringify(updatePayload));

    const { data: updateData, error: updateError } = await admin.from("users").update(updatePayload)
      .eq("id", userId)
      .select("id, plan_tier, generations_limit");

    console.log("[webhook] update result:", JSON.stringify(updateData));
    console.log("[webhook] update error:", JSON.stringify(updateError));
    console.log("[webhook] rows updated:", updateData?.length ?? 0);

    if (updateError) {
      console.log("[webhook] ERROR upgrading user:", updateError.message);
    } else if (!updateData || updateData.length === 0) {
      // No rows matched by userId — try fallback by stripe_customer_id
      console.log("[webhook] WARNING: no rows matched for userId:", userId, "— attempting match by stripe_customer_id");
      const { data: fallbackData, error: fallbackError } = await admin.from("users").update({
        plan_tier: "pro",
        generations_limit: 999,
        plan_expires_at: new Date(subscription.current_period_end * 1000).toISOString(),
      })
        .eq("stripe_customer_id", customerId)
        .select("id, plan_tier, generations_limit");

      console.log("[webhook] fallback update result:", JSON.stringify(fallbackData));
      console.log("[webhook] fallback update error:", JSON.stringify(fallbackError));
    }

    console.log("[Stripe Webhook] upgraded user to pro:", userId);
  }

  if (
    event.type === "customer.subscription.deleted" ||
    event.type === "invoice.payment_failed"
  ) {
    const obj = event.data.object as any;
    const customerId = obj.customer as string;

    const { data: user } = await admin
      .from("users")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .single();

    if (user) {
      await admin.from("users").update({
        plan_tier: "free",
        generations_limit: 3,
        plan_expires_at: null,
      }).eq("id", user.id);

      console.log("[Stripe Webhook] downgraded user to free:", user.id);
    }
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    const { data: user } = await admin
      .from("users")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .single();

    if (user) {
      await admin.from("users").update({
        plan_expires_at: new Date(subscription.current_period_end * 1000).toISOString(),
      }).eq("id", user.id);
    }
  }

  return c.json({ received: true });
});

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

// ── Extract Job Terms (AI-powered) ───────────────────────────────────────────
app.post("/make-server-3bbff5cf/extract-job-terms", async (c) => {
  const userId = extractUserId(c);
  if (!userId) return c.json({ success: false, error: "unauthorized" }, 401);

  let application_id: string, job_description_raw: string;
  try {
    const b = await c.req.json();
    application_id = b.application_id;
    job_description_raw = b.job_description_raw;
  } catch {
    return c.json({ success: false, error: "Invalid request body" }, 400);
  }

  if (!application_id || !job_description_raw) {
    return c.json({ success: false, error: "application_id and job_description_raw required" }, 400);
  }

  // Check if already extracted and cached
  const admin = sb();
  const { data: existing } = await admin
    .from("applications")
    .select("extracted_job_terms")
    .eq("id", application_id)
    .single();

  if (existing?.extracted_job_terms) {
    console.log("[extract-job-terms] returning cached terms for:", application_id);
    return c.json({ success: true, terms: existing.extracted_job_terms, cached: true });
  }

  let key: string;
  try { key = openaiKey(); } catch {
    return c.json({ success: false, error: "OpenAI key not configured" }, 500);
  }

  const extractSystemPrompt = `You are a job description analyst. Extract structured information from job descriptions. Return ONLY valid JSON, no markdown, no explanation, no preamble. Be precise — extract actual skill terms and requirements, never full sentences.`;

  const extractUserPrompt = `Analyse this job description and extract the following.
Return ONLY a JSON object matching this exact schema:

{
  "mustHaves": [],
  "skills": [],
  "tools": [],
  "responsibilities": [],
  "niceToHaves": [],
  "certifications": [],
  "experienceYears": null
}

RULES for extraction:
- mustHaves: specific skills, qualifications, certifications or attributes described as required/essential/must-have. Max 4 words each.
- skills: professional skills mentioned anywhere in the job. Max 4 words each, no articles or prepositions at start.
- tools: specific software, systems, platforms or technologies mentioned.
- responsibilities: SHORT verb phrases (max 5 words) summarising what the person will do. Start with a verb.
- niceToHaves: skills/qualifications described as desirable/preferred/advantageous but not required.
- certifications: any specific certifications, licences or accreditations.
- experienceYears: integer of minimum years experience required, or null.

IMPORTANT:
- Never include full sentences
- Never include company boilerplate (benefits, "about us", perks)
- Never include application instructions
- Never include URLs, email addresses, or formatting artifacts
- Each term must be a genuine skill, tool, or requirement
- Maximum 20 items per array

JOB DESCRIPTION:
${job_description_raw.slice(0, 6000)}`;

  try {
    console.log("[extract-job-terms] calling OpenAI for:", application_id);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: extractSystemPrompt },
          { role: "user", content: extractUserPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[extract-job-terms] OpenAI error:", response.status, err);
      return c.json({ success: false, error: "AI extraction failed" }, 500);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const terms = JSON.parse(clean);

    // Validate shape
    const validated = {
      mustHaves: Array.isArray(terms.mustHaves) ? terms.mustHaves.slice(0, 20) : [],
      skills: Array.isArray(terms.skills) ? terms.skills.slice(0, 20) : [],
      tools: Array.isArray(terms.tools) ? terms.tools.slice(0, 20) : [],
      responsibilities: Array.isArray(terms.responsibilities) ? terms.responsibilities.slice(0, 20) : [],
      niceToHaves: Array.isArray(terms.niceToHaves) ? terms.niceToHaves.slice(0, 20) : [],
      certifications: Array.isArray(terms.certifications) ? terms.certifications.slice(0, 20) : [],
      experienceYears: typeof terms.experienceYears === "number" ? terms.experienceYears : null,
    };

    console.log("[extract-job-terms] extracted for:", application_id, {
      mustHaves: validated.mustHaves.length,
      skills: validated.skills.length,
      tools: validated.tools.length,
    });

    // Cache in Supabase
    await admin
      .from("applications")
      .update({ extracted_job_terms: validated })
      .eq("id", application_id);

    return c.json({ success: true, terms: validated, cached: false });
  } catch (err) {
    console.error("[extract-job-terms] exception:", err);
    return c.json({ success: false, error: "Failed to extract terms" }, 500);
  }
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

  // ── Enforce generation limit ──
  const { data: userData, error: userError } = await admin
    .from("users")
    .select("plan_tier, generations_used, generations_limit")
    .eq("id", userId)
    .single();

  if (userError || !userData) {
    console.log("[generate-cv] user lookup error:", userError);
    return c.json({ success: false, error: "Could not verify account status" }, 500);
  }

  const generationsUsed = userData.generations_used ?? 0;
  const generationsLimit = userData.generations_limit ?? 3;

  console.log(`[generate-cv] user ${userId}: ${generationsUsed}/${generationsLimit} generations used, plan: ${userData.plan_tier}`);

  if (generationsUsed >= generationsLimit) {
    return c.json({
      success: false,
      error: "Generation limit reached",
      code: "GENERATION_LIMIT_REACHED",
      used: generationsUsed,
      limit: generationsLimit,
      plan_tier: userData.plan_tier,
    }, 403);
  }

  const { data: appRow, error: appErr } = await admin.from("applications").select("*").eq("id", application_id).single();
  if (appErr || !appRow) { console.log("App fetch error:", appErr); return c.json({ success: false, error: "Application not found" }, 404); }

  const { data: cvProfile, error: cvErr } = await admin.from("cv_profiles").select("*").eq("id", cv_profile_id).single();
  if (cvErr || !cvProfile) { console.log("CV fetch error:", cvErr); return c.json({ success: false, error: "CV profile not found" }, 404); }

  const job = appRow.job_parsed_json ?? {};
  const cvData = cvProfile.parsed_json ?? {};
  const jobDescRaw = (appRow.job_description_raw || "").slice(0, 4000);
  const extractedTerms = appRow.extracted_job_terms;

  // ── Build optimisation targets (prefer AI-extracted terms, fall back to regex) ──
  let mustHaveTerms: string[] = [];
  let responsibilityPhrases: string[] = [];
  let missingKeywords: string[] = [];
  let optimisationBlock = "";

  if (extractedTerms && (extractedTerms.mustHaves?.length > 0 || extractedTerms.skills?.length > 0)) {
    // Use AI-extracted terms
    mustHaveTerms = [...(extractedTerms.mustHaves || []), ...(extractedTerms.certifications || [])];
    const skillTerms = [...(extractedTerms.skills || []), ...(extractedTerms.tools || [])];
    responsibilityPhrases = extractedTerms.responsibilities || [];
    const cvText = JSON.stringify(cvData).toLowerCase();
    missingKeywords = skillTerms.filter((s: string) => !cvText.includes(s.toLowerCase())).slice(0, 15);

    optimisationBlock = `
OPTIMISATION TARGETS — embed these naturally in experience bullets:
Must-have terms to evidence in experience (not just skills list):
${mustHaveTerms.join(", ")}

Key skills to include where candidate plausibly has them:
${skillTerms.join(", ")}

Responsibility patterns to mirror in experience bullets:
${responsibilityPhrases.join(" | ")}

Rules:
- Embed must-have terms in experience bullet points, not just skills list
- Mirror the verb patterns from responsibilities above
- Only include skills the candidate plausibly has from their background
- Never fabricate experience`;

    console.log("generate-cv: using AI-extracted terms for optimisation");
  } else {
    // Fallback: regex-based extraction
    const mustHavePatterns = /\b(must|required|essential|need to|minimum|you will have|years?\b.*\bexperience|certification|certified|eligible to work|right to work|mandatory)\b/i;
    const responsibilityPatterns = /\b(responsible for|you will|deliver|manage|lead|coordinate|own|develop|implement|design|build|create|ensure|support|collaborate|drive|oversee)\b/i;
    const jobLines = jobDescRaw.split(/[\n\r]+/).map((l: string) => l.trim()).filter((l: string) => l.length > 5);
    const allJobSkills = new Set<string>();
    for (const line of jobLines) {
      if (mustHavePatterns.test(line)) mustHaveTerms.push(line.slice(0, 120));
      if (responsibilityPatterns.test(line)) responsibilityPhrases.push(line.slice(0, 120));
    }
    const cvText = JSON.stringify(cvData).toLowerCase();
    for (const s of [...(job.key_skills || []), ...(job.requirements || [])]) {
      if (typeof s === "string" && !cvText.includes(s.toLowerCase())) allJobSkills.add(s);
    }
    missingKeywords = [...allJobSkills].slice(0, 15);

    optimisationBlock = `
OPTIMISATION TARGET: Maximise ATS match against this specific job.
Focus the rewrite on:
- Must-have terms to embed in experience bullets: ${mustHaveTerms.slice(0, 8).join("; ")}
- Missing keywords to work in naturally: ${missingKeywords.join(", ")}
- Job responsibility patterns to mirror: ${responsibilityPhrases.slice(0, 6).join("; ")}
The skills_gap field should list skills from the job the candidate genuinely lacks — be honest, do not pad this list.`;

    console.log("generate-cv: using regex fallback for optimisation");
  }

  // ── Calculate actual years of experience from work history ──
  function calculateTotalYears(workHistory: any[]): number {
    if (!workHistory || workHistory.length === 0) return 0;

    let totalMonths = 0;
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    for (const role of workHistory) {
      try {
        const startParts = role.start_date?.split(' ');
        const startYear = parseInt(startParts?.[startParts.length - 1]);
        const startMonthStr = startParts?.[0];
        const monthNames = ['january','february','march','april','may','june',
                        'july','august','september','october','november','december'];
        const startMonth = monthNames.indexOf(startMonthStr?.toLowerCase()) + 1 || 1;

        let endYear = currentYear;
        let endMonth = currentMonth;
        if (role.end_date && role.end_date.toLowerCase() !== 'present') {
          const endParts = role.end_date.split(' ');
          endYear = parseInt(endParts?.[endParts.length - 1]);
          const endMonthStr = endParts?.[0];
          endMonth = monthNames.indexOf(endMonthStr?.toLowerCase()) + 1 || 12;
        }

        if (!isNaN(startYear) && !isNaN(endYear)) {
          const monthsInRole = (endYear - startYear) * 12 + (endMonth - startMonth);
          totalMonths += Math.max(0, monthsInRole);
        }
      } catch {
        // Skip unparseable dates
      }
    }

    return Math.round(totalMonths / 12);
  }

  let actualYears = 0;
  let yearsLabel: string | null = null;
  try {
    actualYears = calculateTotalYears(cvData.work_history ?? []);
    yearsLabel = actualYears >= 10
      ? 'over 10 years'
      : actualYears > 0
        ? `${actualYears}+ years`
        : null;
    console.log('[generate-cv] calculated actual experience:', yearsLabel);
  } catch (e) {
    console.log('[generate-cv] years calculation failed (non-fatal):', e);
    yearsLabel = null;
  }

  const candidateExperienceFacts = yearsLabel ? `
CANDIDATE EXPERIENCE FACTS (use these, do not override):
Total years of professional experience: ${yearsLabel}
First role start date: ${cvData.work_history?.[cvData.work_history.length - 1]?.start_date ?? 'unknown'}
Most recent role: ${cvData.work_history?.[0]?.title ?? ''} at ${cvData.work_history?.[0]?.company ?? ''}

IMPORTANT: When writing the summary or any bullet that references
years of experience, always use the candidate's ACTUAL years above.
Never use the years requirement from the job description as the
candidate's experience level. The job says a minimum requirement —
if the candidate has more, state their actual experience.
` : '';

  const systemPrompt = `You are an expert CV writer with 15 years experience helping candidates land interviews. You write CVs that feel genuinely crafted for a specific role — not keyword-stuffed, not generic, but like a human who deeply understood both the candidate and the job wrote it.

Your output will be used directly as the candidate's CV for this application. It must be exceptional.

CORE PRINCIPLES:
1. Mirror the employer's language. Use the same terminology the job description uses. If the job says 'stakeholder engagement' use that phrase, not 'client communication'. If it says 'P&L responsibility' use that, not 'budget management'.

2. Evidence over assertion. Never write 'strong communication skills'. Instead write a bullet that demonstrates communication through a specific action and outcome. Show, don't tell.

3. Strong evidence placement. Requirements from the job description must appear in experience bullets — not just the skills section. A skill that appears only in the skills section scores lower with real ATS systems than one evidenced in a bullet.

4. Quantify everything possible. If the CV has any numbers, dates, team sizes, budget values, percentages — keep and amplify them. If none exist, use language that implies scale: 'multiple', 'cross-functional', 'enterprise-level'.

5. Verb precision. Start every bullet with a strong, specific verb that matches the seniority level of the role. Junior roles: 'Assisted', 'Supported', 'Contributed'. Mid roles: 'Managed', 'Delivered', 'Coordinated'. Senior roles: 'Led', 'Drove', 'Owned', 'Spearheaded'.

6. Honest tailoring only. Only include skills and experience the candidate actually has. Do not fabricate. If the job requires something the candidate clearly lacks, do not invent it — instead surface it honestly in skills_gap.

7. Summary is a pitch. The professional summary should read like the candidate wrote it specifically for this role. It should reference the job title or field, the candidate's most relevant strength, and a forward-looking statement. Maximum 4 sentences.

8. Never mirror the job description's experience requirement back as the candidate's experience level. The job description states a minimum threshold — the candidate may exceed it significantly. Always derive years of experience from the candidate's actual work history dates, not from what the job asks for. If the candidate has 7 years and the job asks for 3-5, write '7 years experience' or 'over 5 years experience' — never '3 years experience'.

Return only valid JSON.`;

  const prompt = `ROLE: ${job.job_title || appRow.job_title || "Unknown"} at ${job.company || appRow.company || "Unknown"}

WHAT THIS EMPLOYER CARES ABOUT MOST:
Requirements: ${JSON.stringify(job.requirements || [])}
Key skills: ${JSON.stringify(job.key_skills || [])}
Responsibilities: ${JSON.stringify(job.responsibilities || [])}
Nice to haves: ${JSON.stringify(job.nice_to_haves || [])}

${candidateExperienceFacts}CANDIDATE'S EXISTING CV:
${JSON.stringify(cvData, null, 2)}

YOUR TASK:
Rewrite this CV to be the strongest possible application for the role above. Follow all principles in the system prompt.

SPECIFIC INSTRUCTIONS FOR THIS REWRITE:

1. SUMMARY — rewrite completely for this specific role:
   - Open with the job title or closest equivalent from their background
   - Reference their most relevant achievement or strength
   - Use 2-3 keywords from the job requirements naturally
   - End with what they bring to this type of role
   - Maximum 4 sentences, no clichés

2. EXPERIENCE BULLETS — rules per role:
   - MINIMUM 4 bullets per role, NO EXCEPTIONS
   - Maximum 6 bullets per role
   - If the candidate's original CV has fewer than 4 bullets for a role, expand them by:
     * Breaking compound bullets into separate points
     * Adding context around responsibilities implied by the role title
     * Elaborating on tools, stakeholders, or outcomes mentioned elsewhere
     * Never fabricate — only expand on what is plausibly true given their role title, company, and other bullet content
   - Most recent role (current or last job): aim for 5-6 bullets
   - Roles older than 5 years: minimum 4 bullets still required
   - Each bullet must start with a strong past or present tense verb
   - Each bullet must be a complete, specific statement
   - Never produce a role with 1, 2, or 3 bullets under any circumstance
   - Use the same verbs and terminology as the job responsibilities
   - Evidence the key skills listed in the job description
   - Are specific and outcome-oriented
   - Keep any metrics/numbers from the original — never remove them
   - Rewrite vague bullets to be specific to this role's context
   - Strongest bullets first

LENGTH GUIDANCE:
   - Do not try to fit the CV onto one page
   - A CV should be as long as it needs to be to represent the candidate well — typically 2 pages for candidates with 3+ years experience
   - Never truncate or omit content to save space
   - Include all work history roles from the original CV
   - Do not merge separate roles into one entry
   - Quality and completeness over brevity

3. SKILLS — reorder to put most relevant skills first:
   - Skills that appear in the job requirements go first
   - Remove skills completely irrelevant to this role
   - Do not add skills the candidate doesn't have
   - Keep the list to 8-12 items maximum

4. SKILLS GAP — be specific and honest:
   - List only genuine gaps: requirements from the job the candidate clearly cannot evidence from their background
   - Do not list soft skills or generic traits
   - Do not list things that appear anywhere in their CV already
   - If no genuine gaps exist, return an empty array

${optimisationBlock}

Return ONLY valid JSON matching this schema exactly:
${CV_SCHEMA}

Do not include any explanation, preamble, or markdown. JSON only.`;

  try {
    console.log("generate-cv: calling OpenAI...");
    const generatedCv = await chatJSON(key, systemPrompt, prompt, 0.4, { model: "gpt-4o", max_tokens: 4000 });
    if (!generatedCv) return c.json({ success: false, error: "AI generation failed." }, 500);
    console.log("generate-cv: success for", generatedCv.name);

    // Post-generation validation: enforce minimum 4 bullets per role
    try {
      if (generatedCv.work_history && Array.isArray(generatedCv.work_history)) {
        generatedCv.work_history = generatedCv.work_history.map((role: any) => {
          const bullets = Array.isArray(role.bullets) ? role.bullets : [];

          if (bullets.length < 4) {
            console.log(`[generate-cv] role "${role.title} at ${role.company}" ` +
              `only has ${bullets.length} bullets — padding to 4`);

            // Find matching role from original CV to pull extra bullets from
            const originalRole = (cvData.work_history || []).find((r: any) =>
              r.company?.toLowerCase() === role.company?.toLowerCase()
            );
            const originalBullets = originalRole?.bullets || [];

            // Merge: keep generated bullets, pad with original ones not already included
            const mergedBullets = [...bullets];
            for (const originalBullet of originalBullets) {
              if (mergedBullets.length >= 4) break;
              // Only add if not already very similar to an existing bullet
              const alreadyIncluded = mergedBullets.some((b: string) =>
                b.toLowerCase().slice(0, 30) === originalBullet.toLowerCase().slice(0, 30)
              );
              if (!alreadyIncluded) {
                mergedBullets.push(originalBullet);
              }
            }

            // If still under 4 after merging originals, log a warning
            if (mergedBullets.length < 4) {
              console.warn(`[generate-cv] could not reach 4 bullets for ` +
                `"${role.title} at ${role.company}" — only ${mergedBullets.length} available`);
            }

            return { ...role, bullets: mergedBullets };
          }

          return role;
        });
      }
    } catch (validationErr) {
      console.log("[generate-cv] bullet validation error (non-fatal):", validationErr);
      // Continue with the GPT output as-is
    }

    // Post-generation validation: check if summary undersells years of experience
    if (yearsLabel && generatedCv.summary) {
      const summaryYearsMatch = generatedCv.summary.match(/(\d+)\+?\s*years?/i);
      if (summaryYearsMatch) {
        const summaryYears = parseInt(summaryYearsMatch[1]);
        if (summaryYears < actualYears - 1) {
          console.warn(
            `[generate-cv] summary says "${summaryYears} years" but ` +
            `actual is ${actualYears} years — candidate undersold`
          );
        }
      }
    }

    // Merge personal_details overrides from user profile
    try {
      const { data: pdRow } = await admin.from("users").select("personal_details").eq("id", userId).single();
      const pd = pdRow?.personal_details;
      if (pd) {
        if (pd.name) generatedCv.name = pd.name;
        if (pd.phone) generatedCv.phone = pd.phone;
        if (pd.location) generatedCv.location = pd.location;
        if (pd.linkedin) generatedCv.linkedin = pd.linkedin;
        if (pd.portfolio) generatedCv.portfolio = pd.portfolio;
        console.log("[generate-cv] merged personal_details overrides");
      }
    } catch (pdErr) {
      console.log("[generate-cv] personal_details merge error (non-fatal):", pdErr);
    }

    const { data: saved, error: saveErr } = await admin.from("generated_cvs")
      .insert({ application_id, cv_json: generatedCv, template_id: "clean" })
      .select("id").single();

    if (saveErr) { console.log("Save error:", saveErr); return c.json({ success: false, error: "Failed to save: " + saveErr.message }, 500); }

    // Increment generations_used counter
    const { error: incrementError } = await admin
      .from("users")
      .update({
        generations_used: generationsUsed + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (incrementError) {
      console.error("[generate-cv] failed to increment generations_used:", incrementError);
      // Do not fail the request — CV was generated successfully
    } else {
      console.log(`[generate-cv] incremented to ${generationsUsed + 1}/${generationsLimit}`);
    }

    return c.json({ success: true, generated_cv_id: saved.id, cv_json: generatedCv });
  } catch (e) { console.log("generate-cv exception:", e); return c.json({ success: false, error: "Failed to generate CV." }, 500); }
});

// ── Update Generated CV ──────────────────────────────────────────────────────
app.put("/make-server-3bbff5cf/generated-cv/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const { cv_json } = await c.req.json();
    if (!cv_json) return c.json({ success: false, error: "cv_json required" }, 400);
    const admin = sb();

    if (id.startsWith("gen_cv_")) {
      const kv = await import("./kv_store.tsx");
      const existing = await kv.get(`generated_cv:${id}`);
      if (!existing) return c.json({ success: false, error: "Not found" }, 404);
      await kv.set(`generated_cv:${id}`, { ...existing, cv_json });
      console.log("update-cv: saved to KV for", id);
      return c.json({ success: true, id });
    }

    const updatePayload: Record<string, unknown> = { cv_json, updated_at: new Date().toISOString() };
    const { data, error } = await admin.from("generated_cvs").update(updatePayload).eq("id", id).select("id, cv_json");
    if (error) { console.log("update-cv error:", error); return c.json({ success: false, error: error.message }, 500); }
    if (!data || data.length === 0) return c.json({ success: false, error: "Not found" }, 404);
    console.log("update-cv: saved to generated_cvs for", id);
    return c.json({ success: true, id: data[0].id });
  } catch (e) { console.log("update-cv exception:", e); return c.json({ success: false, error: "Failed to update" }, 500); }
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
      if (d.application_id) { const { data } = await admin.from("applications").select("job_title, company, job_description_raw").eq("id", d.application_id).single(); app = data; }
      return c.json({ success: true, cv_json: d.cv_json, template: d.template || "clean", application_id: d.application_id, job_title: app?.job_title || "", company: app?.company || "", job_description_raw: app?.job_description_raw || "" });
    }

    const { data: g, error } = await admin.from("generated_cvs").select("cv_json, template_id, application_id").eq("id", id).single();
    if (error || !g) return c.json({ success: false, error: "Not found" }, 404);

    let app = null;
    if (g.application_id) { const { data } = await admin.from("applications").select("job_title, company, job_description_raw").eq("id", g.application_id).single(); app = data; }
    return c.json({ success: true, cv_json: g.cv_json, template: g.template_id || "clean", application_id: g.application_id, job_title: app?.job_title || "", company: app?.company || "", job_description_raw: app?.job_description_raw || "" });
  } catch (e) { console.log("get-cv exception:", e); return c.json({ success: false, error: "Failed to fetch" }, 500); }
});

// ── Generate Cover Letter ────────────────────────────────────────────────────
app.post("/make-server-3bbff5cf/generate-cover-letter", async (c) => {
  const userId = extractUserId(c);
  if (!userId) return c.json({ success: false, error: "unauthorized" }, 401);

  // Plan gate: only Pro users can generate cover letters
  try {
    const { data: userData } = await sb()
      .from('users')
      .select('plan_tier')
      .eq('id', userId)
      .single();

    if (userData?.plan_tier !== 'pro') {
      return c.json({
        success: false,
        error: 'Cover letter generation requires a Pro plan',
        code: 'PLAN_UPGRADE_REQUIRED'
      }, 403);
    }
  } catch (e) {
    console.log("generate-cover-letter plan check error:", e);
    return c.json({ success: false, error: 'Cover letter generation requires a Pro plan', code: 'PLAN_UPGRADE_REQUIRED' }, 403);
  }

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
    // Increment generations_used for pro user tracking
    try {
      const { data: clUser } = await admin.from("users").select("generations_used").eq("id", userId).single();
      const clUsed = clUser?.generations_used ?? 0;
      await admin.from("users").update({
        generations_used: clUsed + 1,
        updated_at: new Date().toISOString(),
      }).eq("id", userId);
      console.log(`[generate-cover-letter] incremented generations_used to ${clUsed + 1}`);
    } catch (incErr) {
      console.error("[generate-cover-letter] failed to increment generations_used:", incErr);
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
    const skillsGap = (cvJson.skills_gap as string[] ?? []);

    const sysPrompt = `You are an expert ATS consultant. Analyse CVs against job descriptions honestly and specifically.
Return ONLY valid JSON:
{"overall_score":<0-100>,"verdict_summary":"<2-3 sentences>","cv_quality":{"summary_quality":{"score":<0-10>,"feedback":"<specific>"},"bullet_strength":{"score":<0-10>,"feedback":"<specific>"},"keyword_match":{"score":<0-10>,"feedback":"<specific>"}},"strengths":[{"title":"<short>","detail":"<specific>"}],"weaknesses":[{"title":"<short>","detail":"<specific>","fix":"<actionable>"}],"top_actions":[{"action":"<what>","reason":"<why>"}],"missing_keywords":["<keyword>"]}
Rules: 85+=strong, 70-84=good with gaps, 50-69=needs work, <50=poor. 2-4 strengths/weaknesses. 3 top_actions. 3-8 missing_keywords.`;

    const userPrompt = `Analyse this CV vs job.
JOB: ${job.job_title || application.job_title || "?"} at ${job.company || application.company || "?"}
Requirements: ${JSON.stringify(job.requirements || [])}
Responsibilities: ${JSON.stringify(job.responsibilities || [])}
Key Skills: ${JSON.stringify(job.key_skills || [])}
Nice to haves: ${JSON.stringify(job.nice_to_haves || [])}
Raw: ${(application.job_description_raw || "").slice(0, 3000)}

KNOWN CV GAPS (from CV generation):
${skillsGap.join(', ')}

Use these as the basis for the weaknesses/areas to improve section.
Do not invent new gaps that contradict this list. You may add context or suggest how to address them, but the gap list itself comes from above.

CV:
${JSON.stringify(cvJson, null, 2)}`;

    console.log("analyse-application: calling OpenAI...");
    const feedback = await chatJSON(key, sysPrompt, userPrompt, 0.3);
    if (!feedback) return c.json({ success: false, error: "AI analysis failed." }, 500);
    console.log("Analysis complete, overall_score:", feedback.overall_score);

    const { error: ue } = await admin.from("generated_cvs").update({
      feedback_json: feedback, feedback_generated_at: new Date().toISOString(),
      match_score: feedback.overall_score, updated_at: new Date().toISOString(),
    }).eq("id", generated_cv_id);
    if (ue) console.log("Save feedback error (non-fatal):", ue);

    return c.json({ success: true, feedback });
  } catch (e) { console.log("analyse exception:", e); return c.json({ success: false, error: "Failed to analyse." }, 500); }
});

// ── Improve Bullet ──────────────────────────────────────────────────────────
app.post("/make-server-3bbff5cf/improve-bullet", async (c) => {
  const userId = extractUserId(c);
  if (!userId) return c.json({ success: false, error: "unauthorized" }, 401);

  let bulletText: string, jobTitle: string, jobDescription: string, roleTitle: string;
  try {
    const b = await c.req.json();
    bulletText = b.bulletText;
    jobTitle = b.jobTitle || "";
    jobDescription = b.jobDescription || "";
    roleTitle = b.roleTitle || "";
  } catch {
    return c.json({ success: false, error: "Invalid request body" }, 400);
  }

  if (!bulletText) {
    return c.json({ success: false, error: "bulletText required" }, 400);
  }

  let key: string;
  try { key = openaiKey(); } catch {
    return c.json({ success: false, error: "OpenAI key not configured" }, 500);
  }

  const systemPrompt = `You are an expert CV writer. You rewrite single CV bullet points to be more impactful and better targeted to a specific job.

Rules:
- Keep the same core facts — never invent achievements or metrics
- If the original has numbers/metrics, keep them
- Start with a strong action verb appropriate to the role seniority
- Mirror the language and terminology used in the job description
- Make it specific and outcome-oriented, not task-oriented
- Maximum 2 lines when printed
- Return ONLY the improved bullet text, nothing else
- No quotation marks, no explanation, no preamble`;

  const userPrompt = `Improve this CV bullet point for a ${roleTitle} applying for: ${jobTitle}

ORIGINAL BULLET:
${bulletText}

JOB CONTEXT (use this language and prioritise these themes):
${jobDescription.slice(0, 2000)}

Return only the improved bullet text.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 150,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log("[improve-bullet] OpenAI error:", response.status, errText);
      return c.json({ success: false, error: "AI request failed" }, 500);
    }

    const data = await response.json();
    const improved = data.choices?.[0]?.message?.content?.trim() ?? "";

    if (!improved || improved.length < 10) {
      return c.json({ success: false, error: "No improvement generated" }, 500);
    }

    return c.json({ success: true, improved });
  } catch (err) {
    console.log("[improve-bullet] error:", err);
    return c.json({ success: false, error: "Failed to improve bullet" }, 500);
  }
});

// ── PDF Generation ──────────────────────────────────────────────────────────

const PDF_PAGE_W = 595.28;
const PDF_PAGE_H = 841.89;
const PDF_MARGIN_TOP    = 48;
const PDF_MARGIN_BOTTOM = 56;
const PDF_MARGIN_LEFT   = 52;
const PDF_MARGIN_RIGHT  = 52;
const PDF_CONTENT_W = PDF_PAGE_W - PDF_MARGIN_LEFT - PDF_MARGIN_RIGHT;

const PDF_BLACK     = rgb(0.10, 0.10, 0.10);
const PDF_DARK_GREY = rgb(0.30, 0.30, 0.30);
const PDF_MID_GREY  = rgb(0.50, 0.50, 0.50);
const PDF_ACCENT    = rgb(0.10, 0.33, 0.85);

interface PDFCtx { doc: any; page: any; y: number; regularFont: any; boldFont: any; italicFont: any; marginLeft: number; marginRight: number; contentW: number; }

function pdfCheckPageBreak(ctx: PDFCtx, need: number) { if (ctx.y - need < PDF_MARGIN_BOTTOM) { ctx.page = ctx.doc.addPage([PDF_PAGE_W, PDF_PAGE_H]); ctx.y = PDF_PAGE_H - PDF_MARGIN_TOP; } }

function pdfDrawText(ctx: PDFCtx, text: string, opts: { font?: any; size?: number; color?: any; x?: number; indent?: number; maxWidth?: number; lineHeight?: number } = {}) {
  const f = opts.font ?? ctx.regularFont; const size = opts.size ?? 10; const color = opts.color ?? PDF_BLACK;
  const x = opts.x ?? ctx.marginLeft + (opts.indent ?? 0); const maxWidth = opts.maxWidth ?? (ctx.contentW - (opts.indent ?? 0));
  const lineHeight = opts.lineHeight ?? size * 1.4;
  const words = text.split(" "); let line = ""; const lines: string[] = [];
  for (const word of words) { const test = line ? `${line} ${word}` : word; if (f.widthOfTextAtSize(test, size) > maxWidth && line) { lines.push(line); line = word; } else { line = test; } }
  if (line) lines.push(line);
  for (const l of lines) { pdfCheckPageBreak(ctx, lineHeight); ctx.page.drawText(l, { x, y: ctx.y - size, font: f, size, color }); ctx.y -= lineHeight; }
}

function pdfDrawRule(ctx: PDFCtx, gapBefore = 6, gapAfter = 6, startX?: number, endX?: number) {
  ctx.y -= gapBefore; pdfCheckPageBreak(ctx, 2);
  ctx.page.drawLine({ start: { x: startX ?? ctx.marginLeft, y: ctx.y }, end: { x: endX ?? (PDF_PAGE_W - ctx.marginRight), y: ctx.y }, thickness: 0.5, color: rgb(0.80, 0.80, 0.80) });
  ctx.y -= gapAfter;
}

function pdfDrawSectionHeading(ctx: PDFCtx, label: string) { ctx.y -= 10; pdfCheckPageBreak(ctx, 24); pdfDrawText(ctx, label.toUpperCase(), { font: ctx.boldFont, size: 8.5, color: PDF_DARK_GREY }); pdfDrawRule(ctx, 3, 6); }

function pdfDrawSkillsGrid(ctx: PDFCtx, skills: string[], cols = 3) {
  const COL_W = ctx.contentW / cols; const FS = 9.5; const LH = 14; const BI = 8; const TI = 16;
  const rowCount = Math.ceil(skills.length / cols); pdfCheckPageBreak(ctx, rowCount * LH + 8);
  for (let row = 0; row < rowCount; row++) { pdfCheckPageBreak(ctx, LH);
    for (let col = 0; col < cols; col++) { const idx = row + col * rowCount; if (idx >= skills.length) continue;
      const colX = ctx.marginLeft + col * COL_W;
      ctx.page.drawText("\u2022", { x: colX + BI, y: ctx.y - FS, font: ctx.regularFont, size: FS, color: PDF_DARK_GREY });
      const mw = COL_W - TI - BI - 4; let st = skills[idx];
      while (st.length > 0 && ctx.regularFont.widthOfTextAtSize(st, FS) > mw) st = st.slice(0, -1);
      if (st.length < skills[idx].length) st += "\u2026";
      ctx.page.drawText(st, { x: colX + TI, y: ctx.y - FS, font: ctx.regularFont, size: FS, color: PDF_DARK_GREY });
    } ctx.y -= LH; } ctx.y -= 6;
}

function pdfDrawWorkExperience(ctx: PDFCtx, workHistory: any[], bulletPrefix = "\u2014", bodyColor = PDF_DARK_GREY, lhMul = 1.4, roleGap = 8) {
  for (const role of workHistory) { pdfCheckPageBreak(ctx, 40);
    const dateStr = `${role.start_date ?? ""} \u2013 ${role.end_date ?? "Present"}`;
    const dateW = ctx.regularFont.widthOfTextAtSize(dateStr, 9.5);
    pdfDrawText(ctx, role.title ?? "", { font: ctx.boldFont, size: 10.5, color: PDF_BLACK, maxWidth: ctx.contentW - dateW - 8 });
    ctx.page.drawText(dateStr, { x: ctx.marginLeft + ctx.contentW - dateW, y: ctx.y + 10.5 * 1.4 - 10.5, font: ctx.regularFont, size: 9.5, color: PDF_MID_GREY });
    pdfDrawText(ctx, role.company ?? "", { font: ctx.regularFont, size: 9.5, color: PDF_ACCENT, lineHeight: 13 }); ctx.y -= 2;
    const bullets = Array.isArray(role.bullets) ? role.bullets : [];
    for (const b of bullets) { pdfCheckPageBreak(ctx, 16); const bt = typeof b === "string" ? b : (b.text ?? ""); if (bt) pdfDrawText(ctx, `${bulletPrefix} ${bt}`, { font: ctx.regularFont, size: 9.5, color: bodyColor, indent: 8, lineHeight: 9.5 * lhMul }); }
    ctx.y -= roleGap;
  }
}

function pdfDrawEducationItems(ctx: PDFCtx, education: any[]) {
  for (const edu of education) { pdfCheckPageBreak(ctx, 28);
    const yearStr = edu.year ?? edu.dates ?? edu.end_date ?? "";
    const yearW = ctx.regularFont.widthOfTextAtSize(yearStr, 10);
    pdfDrawText(ctx, edu.degree ?? edu.qualification ?? "", { font: ctx.boldFont, size: 10, color: PDF_BLACK, maxWidth: ctx.contentW - yearW - 8 });
    if (yearStr) ctx.page.drawText(yearStr, { x: ctx.marginLeft + ctx.contentW - yearW, y: ctx.y + (10 * 1.4) - 10, font: ctx.regularFont, size: 10, color: PDF_MID_GREY });
    const inst = [edu.institution, edu.grade].filter(Boolean).join(" \u00b7 ");
    if (inst) pdfDrawText(ctx, inst, { font: ctx.italicFont, size: 9.5, color: PDF_MID_GREY, lineHeight: 13 });
    ctx.y -= 6;
  }
}

function pdfDrawCertifications(ctx: PDFCtx, certs: any[]) {
  for (const cert of certs) { pdfCheckPageBreak(ctx, 16);
    const cl = typeof cert === "string" ? cert : (cert.label ?? cert.name ?? cert.title ?? "");
    pdfDrawText(ctx, cl, { font: ctx.regularFont, size: 10, color: PDF_DARK_GREY, lineHeight: 14 });
  }
}

// ── Clean Template ──
function buildCleanPDF(cv: any, ctx: PDFCtx) {
  pdfDrawText(ctx, cv.name ?? "", { font: ctx.boldFont, size: 20, color: PDF_BLACK }); ctx.y -= 2;
  pdfDrawText(ctx, [cv.email, cv.phone, cv.location, cv.linkedin].filter(Boolean).join("  \u00b7  "), { font: ctx.regularFont, size: 9, color: PDF_MID_GREY }); ctx.y -= 8;
  if (cv.summary) { pdfDrawSectionHeading(ctx, "Professional Summary"); pdfDrawText(ctx, cv.summary, { font: ctx.regularFont, size: 10, color: PDF_DARK_GREY, lineHeight: 14.5 }); ctx.y -= 4; }
  if (cv.skills?.length) { pdfDrawSectionHeading(ctx, "Skills"); pdfDrawSkillsGrid(ctx, cv.skills, 3); }
  if (cv.work_history?.length) { pdfDrawSectionHeading(ctx, "Work Experience"); pdfDrawWorkExperience(ctx, cv.work_history); }
  if (cv.education?.length) { pdfDrawSectionHeading(ctx, "Education"); pdfDrawEducationItems(ctx, cv.education); }
  const certs = cv.certifications ?? cv.certificates ?? [];
  if (certs.length) { pdfDrawSectionHeading(ctx, "Certifications"); pdfDrawCertifications(ctx, certs); }
}

// ── Main buildPDF (Clean template only) ──
async function buildPDF(cv: any): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont    = await doc.embedFont(StandardFonts.HelveticaBold);
  const italicFont  = await doc.embedFont(StandardFonts.HelveticaOblique);
  const page = doc.addPage([PDF_PAGE_W, PDF_PAGE_H]);
  const ctx: PDFCtx = { doc, page, y: PDF_PAGE_H - PDF_MARGIN_TOP, regularFont, boldFont, italicFont, marginLeft: PDF_MARGIN_LEFT, marginRight: PDF_MARGIN_RIGHT, contentW: PDF_CONTENT_W };

  buildCleanPDF(cv, ctx);

  return ctx.doc.save();
}

app.post("/make-server-3bbff5cf/generate-pdf", async (c) => {
  const userId = extractUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  let cvJson: any;
  try {
    const b = await c.req.json();
    cvJson = b.cv_json;
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  if (!cvJson) return c.json({ error: "Missing cv_json" }, 400);

  try {
    const pdfBytes = await buildPDF(cvJson);

    return new Response(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${(cvJson.name ?? "CV").replace(/\s+/g, "_")}.pdf"`,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, X-User-Token",
      },
    });
  } catch (err) {
    console.log("[generate-pdf] error:", err);
    return c.json({ error: "PDF generation failed" }, 500);
  }
});

// ── Interview Prep — generate questions ───────────────────────────────────────
app.post("/make-server-3bbff5cf/generate-interview-prep", async (c) => {
  const userId = extractUserId(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);

  let applicationId: string;
  let loadOnly = false;
  let forceRegenerate = false;
  try {
    const b = await c.req.json();
    applicationId = b.application_id;
    loadOnly = !!b.load_only;
    forceRegenerate = !!b.force_regenerate;
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  if (!applicationId) return c.json({ error: "application_id required" }, 400);

  // Check plan tier
  const { data: userData } = await sb()
    .from("users")
    .select("plan_tier")
    .eq("id", userId)
    .single();
  const isPro = userData?.plan_tier === "pro";
  const questionCount = isPro ? 12 : 5;

  // Check interview_prep table for cached questions
  const { data: existing } = await sb()
    .from("interview_prep")
    .select("*")
    .eq("application_id", applicationId)
    .eq("user_id", userId)
    .single();

  if (existing?.questions?.length > 0 && !forceRegenerate) {
    const questions = isPro
      ? existing.questions
      : existing.questions.slice(0, 5);
    return c.json({ success: true, questions, cached: true, isPro });
  }

  // If load_only, just return empty (no generation)
  if (loadOnly) {
    return c.json({ success: true, questions: [], cached: false, isPro });
  }

  // Fetch application with generated CV and job description
  const { data: appRow } = await sb()
    .from("applications")
    .select(`job_title, company, job_description_raw, generated_cvs (cv_json)`)
    .eq("id", applicationId)
    .eq("user_id", userId)
    .single();

  if (!appRow) return c.json({ error: "Application not found" }, 404);

  const generatedCv = (appRow as any).generated_cvs?.[0]?.cv_json;
  if (!generatedCv) {
    return c.json({ error: "Please generate a CV for this application first", code: "NO_GENERATED_CV" }, 400);
  }

  let key: string;
  try { key = openaiKey(); } catch {
    return c.json({ error: "OpenAI key not configured" }, 500);
  }

  const sysPrompt = "You are an expert interview coach who specialises in helping candidates prepare for job interviews. You create targeted, role-specific interview questions and craft suggested answers that draw directly from the candidate's actual experience.\n\nReturn ONLY valid JSON, no markdown, no explanation.";

  const userPrompt = `Generate exactly ${questionCount} interview questions for this candidate applying for this role.

ROLE: ${appRow.job_title} at ${appRow.company}

JOB DESCRIPTION:
${(appRow.job_description_raw ?? "").slice(0, 3000)}

CANDIDATE'S GENERATED CV (use this as the basis for answers):
${JSON.stringify(generatedCv, null, 2).slice(0, 3000)}

REQUIREMENTS:
- Questions must be specific to THIS role and THIS company
- Mix question types across these categories:
  * "technical" - role-specific technical knowledge
  * "behavioural" - STAR-format situational questions
  * "experience" - questions about their specific past roles
  * "motivation" - why this role, why this company
  * "competency" - key competencies from the job description

- Distribution for ${questionCount} questions:
  * ${Math.round(questionCount * 0.3)} technical questions
  * ${Math.round(questionCount * 0.35)} behavioural questions
  * ${Math.round(questionCount * 0.2)} experience questions
  * 1 motivation question
  * Rest as competency questions

- Suggested answers MUST:
  * Draw from the candidate's ACTUAL experience in their CV
  * Reference specific companies, roles, and achievements from their background
  * Be 3-5 sentences
  * For behavioural questions use STAR format (Situation, Task, Action, Result)
  * Never fabricate experience not evidenced in the CV

- Difficulty rating:
  * "easy" - opener/motivation questions
  * "medium" - most behavioural and experience questions
  * "hard" - technical deep-dives and complex competencies

Return this exact JSON schema:
{
  "questions": [
    {
      "id": "q1",
      "question": "...",
      "category": "behavioural",
      "difficulty": "medium",
      "suggested_answer": "..."
    }
  ]
}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.5,
        max_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.log("[interview-prep] OpenAI error:", err);
      return c.json({ error: "AI generation failed" }, 500);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const questions = parsed.questions ?? [];

    // Upsert all questions to interview_prep table (gating happens on read)
    const now = new Date().toISOString();
    if (existing) {
      await sb()
        .from("interview_prep")
        .update({ questions, generated_at: now, updated_at: now })
        .eq("application_id", applicationId)
        .eq("user_id", userId);
    } else {
      await sb()
        .from("interview_prep")
        .insert({
          application_id: applicationId,
          user_id: userId,
          questions,
          generated_at: now,
          updated_at: now,
        });
    }

    return c.json({
      success: true,
      questions: isPro ? questions : questions.slice(0, 5),
      isPro,
      cached: false,
    });
  } catch (err) {
    console.log("[interview-prep] error:", err);
    return c.json({ error: "Failed to generate questions" }, 500);
  }
});

// ── Interview Prep — save user practice answer ────────────────────────────────
app.post("/make-server-3bbff5cf/save-interview-answer", async (c) => {
  const userId = extractUserId(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);

  let applicationId: string, questionId: string, userAnswer: string;
  try {
    const b = await c.req.json();
    applicationId = b.application_id;
    questionId = b.question_id;
    userAnswer = b.user_answer;
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  // Fetch current questions from interview_prep table
  const { data: prep } = await sb()
    .from("interview_prep")
    .select("questions")
    .eq("application_id", applicationId)
    .eq("user_id", userId)
    .single();

  if (!prep) {
    return c.json({ error: "Interview prep not found" }, 404);
  }

  const updatedQuestions = (prep.questions as any[]).map((q: any) =>
    q.id === questionId ? { ...q, user_answer: userAnswer } : q
  );

  await sb()
    .from("interview_prep")
    .update({
      questions: updatedQuestions,
      updated_at: new Date().toISOString(),
    })
    .eq("application_id", applicationId)
    .eq("user_id", userId);

  return c.json({ success: true });
});

// ── Delete Account ───────────────────────────────────────────────────────────
app.delete("/make-server-3bbff5cf/delete-account", async (c) => {
  const userId = extractUserId(c);
  if (!userId) return c.json({ success: false, error: "unauthorized" }, 401);

  const admin = sb();
  console.log(`[delete-account] starting account deletion for user ${userId}`);

  // Delete in order respecting FK constraints, continue on error
  try { await admin.from("interview_prep").delete().eq("user_id", userId); } catch (e) { console.log("[delete-account] interview_prep delete error (continuing):", e); }
  try { await admin.from("cover_letters").delete().in("application_id", admin.from("applications").select("id").eq("user_id", userId)); } catch (e) { console.log("[delete-account] cover_letters delete error (continuing):", e); }
  try { await admin.from("generated_cvs").delete().in("application_id", admin.from("applications").select("id").eq("user_id", userId)); } catch (e) { console.log("[delete-account] generated_cvs delete error (continuing):", e); }
  try { await admin.from("applications").delete().eq("user_id", userId); } catch (e) { console.log("[delete-account] applications delete error (continuing):", e); }
  try { await admin.from("cv_profiles").delete().eq("user_id", userId); } catch (e) { console.log("[delete-account] cv_profiles delete error (continuing):", e); }
  try { await admin.from("users").delete().eq("id", userId); } catch (e) { console.log("[delete-account] users delete error (continuing):", e); }

  // Delete uploaded files from storage
  try {
    const { data: files } = await admin.storage.from("cv-uploads").list(userId);
    if (files && files.length > 0) {
      const paths = files.map((f: any) => `${userId}/${f.name}`);
      await admin.storage.from("cv-uploads").remove(paths);
    }
  } catch (e) { console.log("[delete-account] storage delete error (continuing):", e); }

  // Delete auth user last
  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    await adminClient.auth.admin.deleteUser(userId);
  } catch (e) { console.log("[delete-account] auth user delete error (continuing):", e); }

  console.log(`[delete-account] completed for user ${userId}`);
  return c.json({ success: true });
});

// ── patch-cv-gap — targeted AI patch to address a single gap ────────────────
app.post('/make-server-3bbff5cf/patch-cv-gap', async (c) => {
  const userId = extractUserId(c);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);

  let applicationId: string, generatedCvId: string,
      gapTerm: string, gapType: string,
      userContext: string;
  try {
    const b = await c.req.json();
    applicationId = b.application_id;
    generatedCvId = b.generated_cv_id;
    gapTerm       = b.gap_term;
    gapType       = b.gap_type || 'experience';
    userContext   = b.user_context || '';
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const { data: genCv } = await sb()
    .from('generated_cvs')
    .select('cv_json')
    .eq('id', generatedCvId)
    .eq('user_id', userId)
    .single();

  if (!genCv) {
    return c.json({ error: 'Generated CV not found' }, 404);
  }

  const { data: appRow } = await sb()
    .from('applications')
    .select('job_title, company')
    .eq('id', applicationId)
    .single();

  let key: string;
  try { key = openaiKey(); } catch {
    return c.json({ error: 'OpenAI key not configured' }, 500);
  }

  const cvJson = genCv.cv_json as any;

  const systemPrompt = `You are a precise CV editor. You make minimal, targeted changes to a CV to address a specific gap. You never rewrite sections wholesale — you make the smallest change that naturally and honestly addresses the gap. Return ONLY valid JSON, no markdown, no explanation.`;

  const userPrompt = `A CV has a gap that needs addressing.
The candidate DOES have this experience/skill — it just wasn't captured in their CV.

ROLE APPLYING FOR: ${appRow?.job_title || 'Unknown'} at ${appRow?.company || 'Unknown'}

GAP TO ADDRESS: "${gapTerm}"
GAP TYPE: ${gapType}
CANDIDATE CONTEXT: "${userContext || 'No additional context provided'}"

CURRENT CV:
${JSON.stringify(cvJson, null, 2).slice(0, 3000)}

TASK: Determine the best minimal patch to address this gap.

If gap_type is "skill": add "${gapTerm}" to skills, return patch_type "add_skill".
If gap_type is "experience": find the most relevant role, either UPDATE an existing bullet (preferred) or ADD a new one. Be honest — only add if plausible given the role.
If gap_type is "certification": add to certifications, return patch_type "add_certification".

RULES: minimum change, no invented metrics, natural reading, max 1-2 sentence bullet.

Return JSON: { "patch_type": "add_skill"|"update_bullet"|"add_bullet"|"add_certification", "target_role_index": 0, "bullet_index": 2, "new_skill": "...", "new_bullet": "...", "new_certification": "...", "explanation": "..." }. Only include fields relevant to the patch_type.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      console.log('[patch-cv-gap] OpenAI error:', response.status, await response.text());
      return c.json({ error: 'AI patch failed' }, 500);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? '{}';
    const patch = JSON.parse(raw);

    console.log('[patch-cv-gap] patch for gap:', gapTerm, JSON.stringify(patch));
    return c.json({ success: true, patch });

  } catch (err: any) {
    console.error('[patch-cv-gap] error:', err?.message ?? err);
    return c.json({ error: 'Failed to generate patch' }, 500);
  }
});

Deno.serve(app.fetch);