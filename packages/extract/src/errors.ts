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
