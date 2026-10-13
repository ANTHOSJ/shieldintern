"use server";

import { AnalysisResult } from "@/lib/types";

const ANALYSIS_PROMPT = `You are an expert cybersecurity analyst specializing in detecting fake internship and job offer scams targeting students in India.

Analyze the following offer text and return a JSON response with this EXACT structure:

{
  "riskScore": <number 0-100, where 0 is completely safe and 100 is definitely a scam>,
  "riskLevel": "<one of: safe, suspicious, high-risk>",
  "summary": "<one clear sentence verdict for a student>",
  "highlights": [
    {"text": "<exact phrase from the offer that is a red flag or trust signal>", "severity": "<one of: danger, suspicious, safe>"}
  ],
  "indicators": [
    {"icon": "<single emoji>", "title": "<short title like 'Payment Request'>", "severity": "<one of: low, medium, high>", "description": "<1-2 sentence explanation in simple language>"}
  ],
  "verificationSteps": [
    "<actionable step the student should take, e.g., 'Search the company name on LinkedIn and verify employee count'>"
  ]
}

IMPORTANT RULES:
- The "highlights" array must contain EXACT phrases copied from the original text. Do not paraphrase.
- In "highlights", assign severity: "danger" to any phrase demanding money, security deposits, registration fees, UPI IDs, urgent payment deadlines, or direct selection without any interview.
- In "highlights", assign severity: "suspicious" to unusual salaries, vague details, or unusual work conditions.
- In "highlights", assign severity: "safe" to legitimate verifiable company details, standard HR processes, or transparent terms.
- Include 3-8 highlights covering red flags and any trust signals.
- Include 3-6 fraud indicators covering: payment requests, urgency/pressure, vague company info, unrealistic salary, suspicious contact info, missing interview process.
- Include 3-5 practical verification steps a college student can take.
- riskLevel must be "safe" if riskScore <= 30, "suspicious" if 31-60, "high-risk" if > 60.
- Write all descriptions in simple, student-friendly English.
- Return ONLY valid JSON, no other text.

Additionally, if and only if riskLevel is "high-risk", include two more fields in the JSON:

"extractedEntities": {
  "companyName": string (extract from text; if not found, use "Not specified"),
  "contactEmail": string (if not found, use "Not specified"),
  "contactPhone": string (if not found, use "Not specified"),
  "amountRequested": string (if not found, use "Not specified"),
  "dateReceived": string (use today's date if no date is in the text)
},
"complaintDraft": string — a formal 3-4 sentence complaint suitable for filing on the National Cyber Crime Reporting Portal (cybercrime.gov.in). Reference the specific suspicious phrases from the text as evidence. Write in first person ("I received...").

If riskLevel is "safe" or "suspicious", omit both fields entirely — do not include them as null or empty strings.

Return strictly valid JSON with no markdown code fences, no trailing commas, and no comments.

Here is the offer text to analyze:
`;

export async function analyzeOffer(text: string): Promise<AnalysisResult> {
  // Try Groq first (faster, higher limits), then Gemini as fallback
  const providers = [
    { name: "Groq", fn: () => callGroq(text) },
    { name: "Gemini", fn: () => callGemini(text) },
  ];

  let lastError: Error | null = null;

  for (const provider of providers) {
    try {
      console.log(`Trying ${provider.name}...`);
      const raw = await provider.fn();
      const result = sanitizeResult(raw, text);

      console.log(`${provider.name} succeeded! Risk: ${result.riskScore}`);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`${provider.name} failed:`, lastError.message);
    }
  }

  throw new Error("All AI providers failed. Please try again in a minute.");
}

// ── Sanitize AI Response (NEVER crash) ──────────────────────────
function sanitizeResult(raw: Record<string, unknown>, originalText?: string): AnalysisResult {
  const riskScore = typeof raw.riskScore === "number" ? Math.min(100, Math.max(0, raw.riskScore)) : 50;

  let riskLevel: "safe" | "suspicious" | "high-risk";
  if (riskScore <= 30) riskLevel = "safe";
  else if (riskScore <= 60) riskLevel = "suspicious";
  else riskLevel = "high-risk";

  const rawHighlights = Array.isArray(raw.highlights) ? raw.highlights : [];
  const parsedHighlights = rawHighlights
    .map((h: Record<string, unknown>) => {
      const text = String(h.text || "").trim();
      const rawSev = String(h.severity || "").toLowerCase().trim();
      let severity: "safe" | "suspicious" | "danger" = "suspicious";
      if (rawSev === "danger" || rawSev === "high" || rawSev === "critical" || rawSev === "red") {
        severity = "danger";
      } else if (rawSev === "safe" || rawSev === "low" || rawSev === "green") {
        severity = "safe";
      } else {
        severity = "suspicious";
      }
      return { text, severity };
    })
    .filter((h) => h.text.length > 0);

  // If high risk or suspicious, ensure critical scam triggers in originalText are highlighted as danger
  if (originalText && riskScore >= 50) {
    const criticalPatterns = [
      /(?:refundable\s+)?(?:workspace\s+|security\s+|laptop\s+)?(?:security\s+deposit|workspace\s+deposit|caution\s+deposit|registration\s+fee|processing\s+fee|training\s+fee)[^\n.]*/gi,
      /UPI\s*ID[^\n.]*/gi,
      /[a-zA-Z0-9.\-_]+@(?:ok[a-zA-Z]+|paytm|ybl|axl|ibl|upi)/gi,
      /(?:directly\s+)?approved\s+without\s+(?:any\s+)?technical\s+interview[^\n.]*/gi,
      /(?:payment\s+screenshot\s+and\s+reference\s+ID)[^\n.]*/gi,
    ];

    for (const pat of criticalPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pat.exec(originalText)) !== null) {
        const matchedPhrase = match[0].trim();
        if (matchedPhrase.length > 4) {
          const existing = parsedHighlights.find(
            (h) =>
              h.text.toLowerCase().includes(matchedPhrase.toLowerCase()) ||
              matchedPhrase.toLowerCase().includes(h.text.toLowerCase())
          );
          if (existing) {
            existing.severity = "danger"; // elevate to danger
          } else {
            parsedHighlights.push({
              text: matchedPhrase,
              severity: "danger",
            });
          }
        }
      }
    }
  }

  const result: AnalysisResult = {
    riskScore,
    riskLevel,
    summary: typeof raw.summary === "string" ? raw.summary : "Analysis complete. Review the details below.",
    highlights: parsedHighlights,
    indicators: Array.isArray(raw.indicators)
      ? raw.indicators.map((i: Record<string, unknown>) => ({
          icon: String(i.icon || "⚠️"),
          title: String(i.title || "Unknown"),
          severity: (["low", "medium", "high"].includes(String(i.severity)) ? i.severity : "medium") as "low" | "medium" | "high",
          description: String(i.description || "Review this indicator carefully."),
        }))
      : [],
    verificationSteps: Array.isArray(raw.verificationSteps)
      ? raw.verificationSteps.map((s: unknown) => String(s))
      : ["Search the company name on Google and LinkedIn to verify it exists."],
  };

  // ── Safely extract complaint fields (separate try/catch — never breaks core) ──
  try {
    if (riskLevel === "high-risk" && raw.extractedEntities && typeof raw.extractedEntities === "object") {
      const ent = raw.extractedEntities as Record<string, unknown>;
      result.extractedEntities = {
        companyName: String(ent.companyName || "Not specified"),
        contactEmail: String(ent.contactEmail || "Not specified"),
        contactPhone: String(ent.contactPhone || "Not specified"),
        amountRequested: String(ent.amountRequested || "Not specified"),
        dateReceived: String(ent.dateReceived || "Not specified"),
      };
    }
    if (riskLevel === "high-risk" && typeof raw.complaintDraft === "string" && raw.complaintDraft.length > 0) {
      result.complaintDraft = raw.complaintDraft;
    }
  } catch (e) {
    console.warn("Failed to parse complaint fields — skipping (non-fatal):", e);
  }

  return result;
}

// ── Groq (Primary) ─────────────────────────────────────────────
async function callGroq(text: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const modelsToTry = [
    process.env.GROQ_MODEL,
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
  ].filter(Boolean) as string[];

  let lastGroqError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "You are an expert cybersecurity analyst. Always respond with valid JSON only.",
            },
            {
              role: "user",
              content: ANALYSIS_PROMPT + text,
            },
          ],
          temperature: 0.3,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error (${model}) ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      if (!content) throw new Error(`Empty response from Groq (${model})`);

      return JSON.parse(content) as Record<string, unknown>;
    } catch (err) {
      lastGroqError = err instanceof Error ? err : new Error(String(err));
      console.warn(`Groq model ${model} failed, trying next fallback:`, lastGroqError.message);
    }
  }

  throw lastGroqError || new Error("All Groq models failed");
}

// ── Gemini (Fallback) ───────────────────────────────────────────
async function callGemini(text: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const geminiModels = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.5-flash"];
  let lastGeminiError: Error | null = null;

  for (const model of geminiModels) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: ANALYSIS_PROMPT + text }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.3,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error (${model}) ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) throw new Error(`Empty response from Gemini (${model})`);

      return JSON.parse(content) as Record<string, unknown>;
    } catch (err) {
      lastGeminiError = err instanceof Error ? err : new Error(String(err));
      console.warn(`Gemini model ${model} failed, trying next:`, lastGeminiError.message);
    }
  }

  throw lastGeminiError || new Error("All Gemini models failed");
}
