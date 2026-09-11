// Typed errors: what went wrong, why, how to fix
// Spec: docs/PROJECT_PLAN.md §0.3

export class ShipsealError extends Error {
  readonly code: string;
  readonly fix: string;

  constructor(code: string, message: string, fix: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ShipsealError";
    this.code = code;
    this.fix = fix;
  }
}

export function formatError(error: ShipsealError): string {
  return `${error.message}\nFix: ${error.fix}`;
}
