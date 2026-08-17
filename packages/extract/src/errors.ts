export class ExtractError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnsupportedFileError extends ExtractError {
  constructor(message: string) {
    super(message, "unsupported_file", 415);
  }
}

export class LimitExceededError extends ExtractError {
  constructor(limitName: string, limit: number, actual: number) {
    super(`${limitName} exceeded: limit ${limit}, actual ${actual}`, "limit_exceeded", 413);
  }
}

/**
 * The input is too coarse to read.
 *
 * This exists because of an observed failure: a 376x531 thumbnail of an A4
 * invoice — roughly 45 dpi — produced a complete, internally consistent
 * extraction in which the invoice date was out by thirteen years and the unit
 * price, line count and totals were all invented. The control layer then
 * reported REVIEW with four warnings, as though the document were merely
 * imperfect. Confident output from an unreadable input is the most dangerous
 * thing this system can do, so it is refused rather than scored.
 */
export class IllegibleInputError extends ExtractError {
  constructor(message: string) {
    super(message, "illegible_input", 422);
  }
}

export class ModelRefusalError extends ExtractError {
  constructor(message: string) {
    super(message, "model_refusal", 422);
  }
}

export class ExtractionFailedError extends ExtractError {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message, "extraction_failed", 502);
  }
}

export class ConfigError extends ExtractError {
  constructor(message: string) {
    super(message, "config_error", 500);
  }
}
