// Base class for all Ollama-related errors
export class OllamaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaError";
  }
}

export class OllamaUnreachableError extends OllamaError {
  constructor(url: string) {
    super(`Ollama unreachable at ${url}. Run: ollama serve`);
    this.name = "OllamaUnreachableError";
  }
}

export class OllamaModelNotFoundError extends OllamaError {
  constructor(model: string) {
    super(`Model ${model} not found. Run: ollama pull ${model}`);
    this.name = "OllamaModelNotFoundError";
  }
}

export class OllamaTimeoutError extends OllamaError {
  constructor(url: string, timeoutMs: number) {
    super(`Ollama request timed out after ${timeoutMs}ms at ${url}. Run: ollama serve`);
    this.name = "OllamaTimeoutError";
  }
}

export class EmbedDimensionError extends OllamaError {
  constructor(model: string, got: number, expected: number) {
    super(
      `Dimension mismatch: model ${model} returned ${got} dimensions, expected ${expected}. ` +
        `This usually means the model changed or a different model is loaded.`,
    );
    this.name = "EmbedDimensionError";
  }
}
