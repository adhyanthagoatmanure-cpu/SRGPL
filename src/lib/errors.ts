/** Error with a message that is safe and useful to show directly to the user. */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}

/** Convert any thrown value to a user-facing message without leaking internals. */
export function errorMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) {
    switch (err.name) {
      case "QuotaExceededError":
        return "Browser storage is full. Free up space or export a backup, then try again.";
      case "ConstraintError":
        return "This record conflicts with an existing one (duplicate value).";
      case "InvalidStateError":
      case "DatabaseClosedError":
        return "The local database is not available. Reload the page and try again.";
      case "AbortError":
      case "TransactionInactiveError":
        return "The operation was interrupted and nothing was saved. Please try again.";
    }
  }
  return "Something went wrong. Nothing was saved. Please try again.";
}
