// Syntax-highlight a snippet into colored spans (shiki tokens)
// Spec: docs/PROJECT_PLAN.md §14.3, spike S5

import type { CodeLine } from "../copy/slots.js";

const MAX_LINES = 14;

export async function highlightCode(
  code: string,
  lang: string,
  theme: "dark" | "light",
): Promise<CodeLine[]> {
  const clipped = code.split("\n").slice(0, MAX_LINES).join("\n");
  const fallbackColor = theme === "dark" ? "#e6edf3" : "#1f2328";
  try {
    const { codeToTokens } = await import("shiki");
    const result = await codeToTokens(clipped, {
      lang: mapLang(lang),
      theme: theme === "dark" ? "github-dark" : "github-light",
    });
    return result.tokens.map((line) => {
      if (line.length === 0) {
        return [{ text: " ", color: fallbackColor }];
      }
      return line.map((token) => ({
        text: token.content,
        color: token.color ?? fallbackColor,
      }));
    });
  } catch {
    return clipped.split("\n").map((line) => [{ text: line.length === 0 ? " " : line, color: fallbackColor }]);
  }
}

function mapLang(lang: string): "ts" | "js" | "tsx" | "jsx" | "json" | "bash" {
  const key = lang.toLowerCase();
  if (key === "javascript" || key === "js") {
    return "js";
  }
  if (key === "tsx") {
    return "tsx";
  }
  if (key === "jsx") {
    return "jsx";
  }
  if (key === "json") {
    return "json";
  }
  if (key === "bash" || key === "shell" || key === "sh") {
    return "bash";
  }
  return "ts";
}
