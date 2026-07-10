/** Best-effort readable message from an unknown error shape (SDK errors are not Error instances). */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const { message, details } = error as {
      message?: unknown;
      details?: unknown;
    };
    if (typeof message === "string" && message) return message;
    if (typeof details === "string" && details) return details;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}
