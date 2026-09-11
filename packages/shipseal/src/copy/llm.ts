// Optional LLM copy via OpenAI-compatible fetch (BYOK, no extra SDK)
// Spec: docs/PROJECT_PLAN.md §13.3

import { z } from "zod";
import type { Facts } from "../facts/schema.js";
import { ShipsealError } from "../core/errors.js";
import { COPY_LIMITS, MAX_HIGHLIGHTS, type Copy } from "./slots.js";
import { deterministicCopy } from "./deterministic.js";
import { guardCopy } from "./number-guard.js";

const llmCopySchema = z.object({
  headline: z.string(),
  subheadline: z.string(),
  highlights: z.array(z.string()).max(MAX_HIGHLIGHTS),
  cta: z.string(),
});

export interface LlmCopyOptions {
  apiKey: string;
  model: string;
  maxRetries: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export async function llmCopy(
  facts: Facts,
  options: LlmCopyOptions,
  fallback = deterministicCopy(facts),
): Promise<{ copy: Copy; mode: "llm" | "deterministic"; warning?: string }> {
  const payload = factsForLlm(facts);
  let lastError: string | undefined;
  const retries = Math.max(0, options.maxRetries);
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let parsed: z.infer<typeof llmCopySchema>;
    try {
      // Sequential retries are required: each attempt depends on the previous rejection.
      // eslint-disable-next-line no-await-in-loop
      const raw = await requestCopy(payload, options);
      parsed = llmCopySchema.parse(JSON.parse(raw));
    } catch (error) {
      lastError = error instanceof Error ? error.message : "LLM request failed";
      continue;
    }
    const expanded = expandPlaceholders(parsed, facts);
    const styled: Copy = {
      headline: stripStyle(expanded.headline).slice(0, COPY_LIMITS.headline),
      subheadline: stripStyle(expanded.subheadline).slice(0, COPY_LIMITS.subheadline),
      highlights: expanded.highlights.map((line) => stripStyle(line).slice(0, COPY_LIMITS.highlight)),
      cta: stripStyle(expanded.cta).slice(0, COPY_LIMITS.cta),
    };
    const guarded = guardCopy(styled, facts);
    if (!guarded.ok) {
      lastError = `Number guard rejected ${guarded.slot}: ${guarded.digits.join(", ")}`;
      continue;
    }
    return { copy: styled, mode: "llm" };
  }
  return {
    copy: fallback,
    mode: "deterministic",
    warning: lastError ?? "LLM copy failed; using deterministic copy",
  };
}

function factsForLlm(facts: Facts): Record<string, unknown> {
  return {
    project: {
      name: facts.project.name.value,
      tagline: facts.project.tagline?.value,
      npmPackage: facts.project.npmPackage?.value,
      url: facts.project.url?.value,
    },
    release: facts.release === undefined
      ? undefined
      : {
          version: "{version}",
          features: facts.release.features.map((item) => item.value),
          fixes: facts.release.fixes.map((item) => item.value),
          breaking: facts.release.breaking.map((item) => item.value),
        },
    metrics: {
      stars: facts.metrics?.stars === undefined ? undefined : "{stars}",
      weeklyDownloads: facts.metrics?.weeklyDownloads === undefined ? undefined : "{weeklyDownloads}",
      contributorCount: facts.metrics?.contributorCount === undefined ? undefined : "{contributorCount}",
    },
  };
}

function expandPlaceholders(copy: z.infer<typeof llmCopySchema>, facts: Facts): z.infer<typeof llmCopySchema> {
  const map: Record<string, string> = {
    "{version}": facts.release?.version.value ?? "",
    "{stars}": facts.metrics?.stars === undefined ? "" : formatCount(facts.metrics.stars.value),
    "{weeklyDownloads}":
      facts.metrics?.weeklyDownloads === undefined ? "" : formatCount(facts.metrics.weeklyDownloads.value),
    "{contributorCount}":
      facts.metrics?.contributorCount === undefined ? "" : formatCount(facts.metrics.contributorCount.value),
  };
  const expand = (text: string): string => {
    let out = text;
    for (const [token, value] of Object.entries(map)) {
      out = out.replaceAll(token, value);
    }
    return out;
  };
  return {
    headline: expand(copy.headline),
    subheadline: expand(copy.subheadline),
    highlights: copy.highlights.map(expand),
    cta: expand(copy.cta),
  };
}

function stripStyle(text: string): string {
  return text.replaceAll("\u2014", ":").replaceAll("\u2013", "-").replaceAll("!", ".");
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

async function requestCopy(facts: Record<string, unknown>, options: LlmCopyOptions): Promise<string> {
  const base = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Write short release-card copy as JSON with keys headline, subheadline, highlights, cta. No em dashes, no exclamation marks. Use placeholders like {version} for numbers. Never invent numbers.",
        },
        { role: "user", content: JSON.stringify(facts) },
      ],
    }),
  });
  if (!response.ok) {
    throw new ShipsealError(
      "copy.llm-http",
      `LLM provider returned HTTP ${String(response.status)}.`,
      "Check SHIPSEAL_LLM_API_KEY, copy.model, and SHIPSEAL_LLM_BASE_URL.",
    );
  }
  const json: unknown = await response.json();
  const message = z
    .object({
      choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
    })
    .parse(json);
  const first = message.choices[0];
  if (first === undefined) {
    throw new ShipsealError("copy.llm-empty", "LLM returned no choices.", "Retry, or run with --no-copy.");
  }
  return first.message.content;
}
