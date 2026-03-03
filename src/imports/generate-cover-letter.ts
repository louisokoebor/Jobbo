// Edge Function: generate-cover-letter
// Supabase → Edge Functions → New Function → name: "generate-cover-letter"
// Required secret: OPENAI_API_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { application_id, generated_cv_id, tone = "professional" } = await req.json();

    if (!application_id || !generated_cv_id) {
      return new Response(
        JSON.stringify({ success: false, error: "application_id and generated_cv_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch application (job data) ──────────────────────────────
    const { data: application, error: appError } = await supabaseClient
      .from("applications")
      .select("job_title, company, job_parsed_json, job_description_raw")
      .eq("id", application_id)
      .single();

    if (appError || !application) {
      return new Response(
        JSON.stringify({ success: false, error: "application_not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch generated CV ────────────────────────────────────────
    const { data: generatedCv, error: cvError } = await supabaseClient
      .from("generated_cvs")
      .select("cv_json")
      .eq("id", generated_cv_id)
      .single();

    if (cvError || !generatedCv) {
      return new Response(
        JSON.stringify({ success: false, error: "generated_cv_not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cv = generatedCv.cv_json as Record<string, unknown>;
    const job = application.job_parsed_json as Record<string, unknown>;

    // ── Build tone instruction ────────────────────────────────────
    const toneInstructions: Record<string, string> = {
      professional: "Write in a professional, formal but warm tone. Polished and confident without being stiff.",
      conversational: "Write in a natural, first-person friendly tone. Engaging and personable while remaining appropriate for a job application.",
      confident: "Write in an assertive, achievement-focused tone. Lead with impact and results. Confident and direct.",
    };

    const toneInstruction = toneInstructions[tone] ?? toneInstructions.professional;

    // ── Build work history summary for the prompt ─────────────────
    const workHistory = (cv.work_history as Array<Record<string, unknown>>) ?? [];
    const workSummary = workHistory
      .slice(0, 3)
      .map(role => {
        const bullets = (role.bullets as string[] ?? []).slice(0, 3).join(" ");
        return `${role.title} at ${role.company} (${role.start_date} – ${role.end_date}): ${bullets}`;
      })
      .join("\n");

    const skills = (cv.skills as string[] ?? []).slice(0, 15).join(", ");
    const requirements = (job.requirements as string[] ?? []).slice(0, 6).join("\n- ");
    const responsibilities = (job.responsibilities as string[] ?? []).slice(0, 4).join("\n- ");
    const keySkills = (job.key_skills as string[] ?? []).slice(0, 10).join(", ");

    // ── OpenAI prompt ─────────────────────────────────────────────
    const systemPrompt = `You are an expert cover letter writer who creates compelling, personalised cover letters that get interviews.

Your cover letters are:
- Tailored specifically to the job and company — never generic
- Grounded in the candidate's real experience and achievements
- ATS-friendly with natural keyword integration
- Structured in 4 clear paragraphs
- 300–400 words in total

Structure:
1. Opening hook (2–3 sentences): Show genuine interest in the specific role and company. Reference something specific about the company or role. State the role you are applying for.
2. Why this role / why this company (2–3 sentences): Show you understand what they need. Connect your background to their mission or goals.
3. What you bring (3–4 sentences): Highlight 2–3 specific achievements or skills from the CV that directly match the job requirements. Use concrete examples where possible. Naturally weave in job keywords.
4. Closing CTA (2 sentences): Express enthusiasm for discussing further. Professional sign-off.

Rules:
- Never use phrases like "I am writing to apply" or "Please find attached"
- Never use hollow buzzwords like "passionate", "hardworking", "team player" without evidence
- Never start consecutive sentences with "I"
- Always reference the specific job title and company name
- Draw only from the provided CV — never fabricate experience`;

    const userPrompt = `Write a cover letter for this application.

CANDIDATE CV SUMMARY:
Name: ${cv.name ?? ""}
Location: ${cv.location ?? ""}
Summary: ${cv.summary ?? ""}
Skills: ${skills}

Work History:
${workSummary}

Education: ${(cv.education as Array<Record<string, unknown>> ?? []).map(e => `${e.qualification} from ${e.institution}`).join(", ")}

JOB DETAILS:
Role: ${application.job_title}
Company: ${application.company}
Key Skills Required: ${keySkills}

Requirements:
- ${requirements}

Responsibilities:
- ${responsibilities}

TONE: ${toneInstruction}

Write the full cover letter now. Return only the letter text — no subject line, no date, no address headers, no signature line. Just the 4 paragraphs of body text.`;

    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) throw new Error("OPENAI_API_KEY secret is not set");

    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.7,
        max_tokens: 800,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!openAiResponse.ok) {
      const errorBody = await openAiResponse.text();
      console.error("OpenAI error:", errorBody);
      throw new Error(`OpenAI API error: ${openAiResponse.status}`);
    }

    const openAiData = await openAiResponse.json();
    const coverLetterContent = openAiData.choices?.[0]?.message?.content ?? "";

    if (!coverLetterContent || coverLetterContent.length < 100) {
      throw new Error("OpenAI returned empty or too-short cover letter");
    }

    // ── Save to cover_letters table ───────────────────────────────
    // Check if a cover letter already exists for this application
    const { data: existing } = await supabaseAdmin
      .from("cover_letters")
      .select("id")
      .eq("application_id", application_id)
      .single();

    let coverLetterId: string;

    if (existing?.id) {
      // Update existing
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("cover_letters")
        .update({
          content: coverLetterContent,
          tone: tone,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("id")
        .single();

      if (updateError) throw new Error(`Failed to update cover letter: ${updateError.message}`);
      coverLetterId = updated.id;
    } else {
      // Insert new
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("cover_letters")
        .insert({
          application_id,
          content: coverLetterContent,
          tone: tone,
        })
        .select("id")
        .single();

      if (insertError) throw new Error(`Failed to save cover letter: ${insertError.message}`);
      coverLetterId = inserted.id;
    }

    return new Response(
      JSON.stringify({
        success: true,
        cover_letter_id: coverLetterId,
        content: coverLetterContent,
        tone: tone,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("generate-cover-letter error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "unexpected_error", detail: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});