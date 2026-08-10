/**
 * ai.server.ts — LLM-powered Q&A using Databricks Foundation Model API.
 * Uses all use case data as context for answering questions.
 */
import { createServerFn } from "@tanstack/react-start";
import { getDb, getAccessToken } from "./db.server";

const MODEL_ENDPOINT = "databricks-claude-sonnet-4-6";

async function callLLM(messages: { role: string; content: string }[]): Promise<string> {
  const accessToken = await getAccessToken();
  const rawHost = process.env.DATABRICKS_HOST ?? "";
  const host = rawHost.startsWith("http") ? rawHost : `https://${rawHost}`;

  const resp = await fetch(
    `${host}/serving-endpoints/${MODEL_ENDPOINT}/invocations`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages,
        max_tokens: 2048,
        temperature: 0.3,
      }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`[AI] LLM call failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? "No response generated.";
}

async function getUseCaseContext(): Promise<string> {
  const pool = await getDb();
  const { rows } = await pool.query(`
    SELECT use_case_id, title, stage, status, workgroup, business_area,
           strategic_goal, use_case_owner, business_owner, developer,
           technical_lead, category, tags, solution_type, data_source,
           vendor, complexity, risk, priority, description,
           annual_time_saved, cost_savings, dev_lead_time_days,
           development_started_at, last_completed_at, notes
    FROM public.use_cases
    ORDER BY title
  `);

  // Format as a concise table for the LLM
  const lines = rows.map((r: any) => {
    const parts = [
      `ID: ${r.use_case_id}`,
      `Title: ${r.title}`,
      `Stage: ${r.stage}`,
      `Status: ${r.status || "On Track"}`,
      `Workgroup: ${r.workgroup || "—"}`,
      `Priority: ${r.priority === 1 ? "2026" : r.priority === 2 ? "2027+" : "—"}`,
    ];
    if (r.use_case_owner) parts.push(`Owner: ${r.use_case_owner}`);
    if (r.business_owner) parts.push(`Business Owner: ${r.business_owner}`);
    if (r.developer) parts.push(`Developer: ${r.developer}`);
    if (r.description) parts.push(`Description: ${r.description}`);
    if (r.vendor) parts.push(`Vendor: ${r.vendor}`);
    if (r.category) parts.push(`Category: ${r.category}`);
    if (r.tags && r.tags.length) parts.push(`Tags: ${Array.isArray(r.tags) ? r.tags.join(", ") : r.tags}`);
    if (r.business_area) parts.push(`Business Area: ${r.business_area}`);
    if (r.annual_time_saved) parts.push(`Annual Time Saved: ${r.annual_time_saved} hrs`);
    if (r.cost_savings) parts.push(`Cost Savings: $${r.cost_savings}`);
    if (r.dev_lead_time_days) parts.push(`Dev Lead Time: ${r.dev_lead_time_days} days`);
    if (r.complexity) parts.push(`Complexity: ${r.complexity}/5`);
    if (r.risk) parts.push(`Risk: ${r.risk}/5`);
    if (r.notes) parts.push(`Notes: ${r.notes}`);
    return parts.join(" | ");
  });

  return `Total use cases: ${rows.length}\n\n${lines.join("\n")}`;
}

const SYSTEM_PROMPT = `You are the Horizon QX AI assistant — a knowledgeable colleague who knows the AI & Innovation portfolio inside-out.

Rules for how you respond:
- Talk like a helpful coworker, not a database. Be conversational and natural.
- Lead with insight, not raw data. Summarize trends, call out what matters, give context.
- Keep responses SHORT — 2-4 sentences for simple questions, a short paragraph for complex ones.
- When listing use cases, mention 3-5 examples by name in a sentence, not a full table. If there are many, say "there are 12 total — here are some highlights..." and name a few.
- NEVER output markdown tables. Use natural language instead.
- Use bold for emphasis on key names or numbers, but keep formatting minimal.
- If asked "what's close to completion" — explain what stage they're in and why that means they're close, name a few examples.
- If a question is vague, give the most useful interpretation rather than asking for clarification.
- You can reference workgroups, owners, vendors, stages, statuses, priorities, time savings, and cost savings from the data.
- Stages in order: Submitted → Intake → Discovery → Development → Testing & Validation → Completed (Archive = paused/on hold)

Example good response:
"There are 7 use cases in Testing & Validation right now — the last stage before completion. A few highlights: **Delay Code Recommendation** (Stations), **TRAX Copilot Agents** (M&E), and **Investigation Report Writing** (Back Office). These are all actively being validated and should move to Completed soon."

Example bad response:
"| ID | Title | Stage |\n|---|---|---|\n| UC-0067 | Delay code recommendation | Testing & Validation |" (Never do this)

## Use Case Data\n`;

export const $askAI = createServerFn({ method: "POST" })
  .validator((data: { question: string; history?: { role: string; content: string }[] }) => data)
  .handler(async ({ data }) => {
    const { question, history = [] } = data;

    // Get fresh use case data as context
    const context = await getUseCaseContext();

    // Build messages array
    const messages = [
      { role: "system", content: SYSTEM_PROMPT + context },
      ...history.slice(-6), // Keep last 6 messages for conversation context
      { role: "user", content: question },
    ];

    const answer = await callLLM(messages);
    return { answer };
  });
