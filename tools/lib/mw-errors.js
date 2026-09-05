export const PIPELINE_CODES = Object.freeze({
  NO_MW_ENTRY: "NO_MW_ENTRY",
  AMBIGUOUS_ENTRY: "AMBIGUOUS_ENTRY",
  AMBIGUOUS_UNIT: "AMBIGUOUS_UNIT",
  NO_DEFINING_TEXT: "NO_DEFINING_TEXT",
  SENSE_IS_ARCHAIC: "SENSE_IS_ARCHAIC",
  INVALID_OVERRIDE: "INVALID_OVERRIDE",
  MISSING_PRONUNCIATION: "MISSING_PRONUNCIATION",
  MISSING_AUDIO: "MISSING_AUDIO",
  AUDIO_404: "AUDIO_404",
  MW_MARKUP_REMAINS: "MW_MARKUP_REMAINS",
  EXAMPLE_HEADWORD_MISMATCH: "EXAMPLE_HEADWORD_MISMATCH",
  NO_PART_OF_SPEECH: "NO_PART_OF_SPEECH",
});

export class MwPipelineError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "MwPipelineError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function pipelineError(code, message, details) {
  return new MwPipelineError(code, message, details);
}
