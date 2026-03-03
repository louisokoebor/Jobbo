// Edge Function: parse-cv
// Supabase → Edge Functions → New Function → name it "parse-cv"
// Paste this entire file as the function body
// Required secret: OPENAI_API_KEY (set in Supabase → Edge Functions → Secrets)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an expert CV parser. Extract structured data from raw CV/resume text.

Return ONLY a valid JSON object matching this exact schema. No explanation, no markdown, no text outside the JSON:

{
  "name": "string — full name",
  "email": "string — email address or null",
  "phone": "string — phone number or null",
  "location": "string — city/country or null",
  "linkedin": "string — LinkedIn URL or null",
  "portfolio": "string — portfolio/website URL or null",
  "summary": "string — professional summary or personal statement. If not present, write a brief 2-sentence summary based on the CV content.",
  "skills": ["array of strings — all technical and soft skills found. Mix of hard skills (React, Python, Excel) and soft skills (Leadership, Communication)"],
  "work_history": [
    {
      "title": "string — job title",
      "company": "string — company name",
      "start_date": "string — normalised to Month YYYY or YYYY",
      "end_date": "string — normalised to Month YYYY or Present",
      "bullets": ["array of strings — responsibilities and achievements as bullet points. If the CV has paragraphs instead of bullets, convert them to concise bullet points."]
    }
  ],
  "education": [
    {
      "institution": "string",
      "qualification": "string — degree, diploma, certification name",
      "dates": "string — year or date range",
      "grade": "string — grade, classification, GPA or null"
    }
  ],
  "certifications": [
    {
      "name": "string",
      "issuer": "string or null",
      "year": "string or null"
    }
  ],
  "links": [
    {
      "label": "string — e.g. GitHub, Portfolio, Website",
      "url": "string"
    }
  ],
  "skills_gap": []
}

Rules:
- Work history must be ordered most recent first
- Normalise all dates to Month YYYY format (e.g. "January 2022") or just YYYY if month unknown
- Current role end_date should be "Present"
- Extract ALL skills mentioned anywhere in the CV — in skills sections, job bullets, everywhere
- If a section is genuinely absent from the CV, return an empty array [] for array fields or null for string fields
- Never fabricate information not present in the CV
- skills_gap should always be an empty array [] — it gets populated during CV generation, not parsing
- Handle varied CV formats: functional, chronological, combined, academic`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with user's JWT so RLS applies
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Admin client for storage access
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { file_url, label } = await req.json();

    if (!file_url || typeof file_url !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "file_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── DOWNLOAD THE FILE FROM SUPABASE STORAGE ─────────────────────────────
    // Extract the storage path from the URL
    // URL format: https://[ref].supabase.co/storage/v1/object/public/cv-uploads/[path]
    // or signed URL format — we download it directly either way

    let fileBuffer: ArrayBuffer;
    let fileName: string;
    let fileExtension: string;

    try {
      // Download directly using the file URL
      const fileResponse = await fetch(file_url, {
        headers: {
          // Include auth in case it's a private bucket signed URL
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
      });

      if (!fileResponse.ok) {
        throw new Error(`Failed to download file: ${fileResponse.status}`);
      }

      fileBuffer = await fileResponse.arrayBuffer();
      const contentType = fileResponse.headers.get("content-type") ?? "";

      // Determine file type from URL or content-type
      const urlPath = new URL(file_url).pathname.toLowerCase();
      if (urlPath.endsWith(".pdf") || contentType.includes("pdf")) {
        fileExtension = "pdf";
      } else if (
        urlPath.endsWith(".docx") ||
        contentType.includes("wordprocessingml") ||
        contentType.includes("docx")
      ) {
        fileExtension = "docx";
      } else if (urlPath.endsWith(".doc") || contentType.includes("msword")) {
        fileExtension = "doc";
      } else {
        // Default to trying PDF parsing
        fileExtension = "pdf";
      }

      // Extract filename from URL
      const pathParts = urlPath.split("/");
      fileName = pathParts[pathParts.length - 1] || "cv";

    } catch (downloadError) {
      console.error("File download error:", downloadError);
      return new Response(
        JSON.stringify({ success: false, error: "file_download_failed", detail: downloadError.message }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── EXTRACT TEXT FROM FILE ───────────────────────────────────────────────
    let extractedText = "";

    if (fileExtension === "pdf") {
      // Use PDF.co or a simple text extraction approach
      // Since we can't use npm packages directly in Deno edge functions,
      // we'll use the Jina AI reader as a fallback text extractor for PDFs
      // by sending the file content as base64 to OpenAI's vision API

      // Convert ArrayBuffer to base64
      const uint8Array = new Uint8Array(fileBuffer);
      let binary = "";
      for (let i = 0; i < uint8Array.byteLength; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64 = btoa(binary);

      // Use OpenAI to extract text from PDF via base64
      const openAiKey = Deno.env.get("OPENAI_API_KEY");
      if (!openAiKey) throw new Error("OPENAI_API_KEY secret is not set");

      // First, try to extract text using GPT-4o with file content
      // We send it as a file attachment in the message
      const extractResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openAiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          temperature: 0,
          max_tokens: 4000,
          messages: [
            {
              role: "system",
              content: "Extract ALL text content from this CV/resume document. Return the raw text exactly as it appears, preserving the structure. Include every word, date, company name, job title, skill, and section heading. Do not summarise or interpret — just extract the raw text."
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract all text from this CV document:"
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:application/pdf;base64,${base64}`,
                    detail: "high"
                  }
                }
              ]
            }
          ]
        }),
      });

      if (!extractResponse.ok) {
        // If vision extraction fails, try treating it as text
        const decoder = new TextDecoder("utf-8", { fatal: false });
        extractedText = decoder.decode(fileBuffer);
        // Strip PDF binary artifacts — keep only printable ASCII and common unicode
        extractedText = extractedText.replace(/[^\x20-\x7E\n\r\t\u00A0-\u024F]/g, " ").replace(/\s+/g, " ").trim();
      } else {
        const extractData = await extractResponse.json();
        extractedText = extractData.choices?.[0]?.message?.content ?? "";
      }

    } else if (fileExtension === "docx" || fileExtension === "doc") {
      // For DOCX files, decode as text — DOCX is a ZIP containing XML
      // Use a simple XML text extraction approach
      try {
        const decoder = new TextDecoder("utf-8", { fatal: false });
        const rawText = decoder.decode(fileBuffer);

        // Extract text content from the XML inside the DOCX
        // DOCX word/document.xml contains <w:t> tags with the text
        const textMatches = rawText.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) ?? [];
        extractedText = textMatches
          .map(match => match.replace(/<[^>]+>/g, ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        // If XML extraction yielded too little, try raw text decode
        if (extractedText.length < 100) {
          extractedText = rawText
            .replace(/<[^>]+>/g, " ")
            .replace(/[^\x20-\x7E\n\r\t]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }
      } catch {
        const decoder = new TextDecoder("utf-8", { fatal: false });
        extractedText = decoder.decode(fileBuffer).replace(/\s+/g, " ").trim();
      }
    }

    if (!extractedText || extractedText.trim().length < 50) {
      return new Response(
        JSON.stringify({ success: false, error: "text_extraction_failed", detail: "Could not extract readable text from the file" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Trim to 8000 chars for GPT parsing
    const trimmedText = extractedText.trim().slice(0, 8000);

    // ── PARSE WITH GPT-4o ────────────────────────────────────────────────────
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
        temperature: 0.1,
        max_tokens: 3000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Parse this CV:\n\n${trimmedText}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!openAiResponse.ok) {
      const errorBody = await openAiResponse.text();
      console.error("OpenAI parse error:", errorBody);
      throw new Error(`OpenAI API error: ${openAiResponse.status}`);
    }

    const openAiData = await openAiResponse.json();
    const content = openAiData.choices?.[0]?.message?.content;

    if (!content) throw new Error("No content returned from OpenAI");

    let parsedCv: Record<string, unknown>;
    try {
      parsedCv = JSON.parse(content);
    } catch {
      throw new Error("OpenAI returned invalid JSON");
    }

    // ── SAVE TO DATABASE ─────────────────────────────────────────────────────
    // Check if user already has a cv_profile — if so, we might be adding a new one
    const { data: existingProfiles } = await supabaseClient
      .from("cv_profiles")
      .select("id")
      .eq("user_id", user.id);

    const isFirstProfile = !existingProfiles || existingProfiles.length === 0;

    const { data: cvProfileRow, error: insertError } = await supabaseClient
      .from("cv_profiles")
      .insert({
        user_id: user.id,
        label: label ?? "My CV",
        raw_file_url: file_url,
        parsed_json: parsedCv,
        is_default: isFirstProfile, // First CV is automatically the default
      })
      .select("id")
      .single();

    if (insertError || !cvProfileRow) {
      throw new Error(`Failed to save CV profile: ${insertError?.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        cv_profile_id: cvProfileRow.id,
        parsed_json: parsedCv,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("parse-cv error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "unexpected_error", detail: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});