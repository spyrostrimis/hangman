import { PIPELINE_CODES, pipelineError } from "./mw-errors.js";

const AUDIO_BASE = "https://media.merriam-webster.com/audio/prons/en/us/mp3";

function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "";
}

export class MwAudioVerificationError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "MwAudioVerificationError";
    if (status !== undefined) {
      this.status = status;
    }
  }
}

export function getMwAudioSubdirectory(audioFile) {
  if (!nonEmpty(audioFile)) {
    throw new TypeError("MW audio filename must be a non-empty string");
  }

  const normalized = audioFile.trim().toLowerCase();
  if (normalized.startsWith("bix")) {
    return "bix";
  }
  if (normalized.startsWith("gg")) {
    return "gg";
  }
  if (!/^[a-z]/.test(normalized)) {
    return "number";
  }
  return normalized[0];
}

export function buildMwAudioUrl(audioFile) {
  const normalized = audioFile.trim();
  const subdirectory = getMwAudioSubdirectory(normalized);
  return `${AUDIO_BASE}/${subdirectory}/${encodeURIComponent(normalized)}.mp3`;
}

export function extractFirstPronunciation(entry) {
  const first = entry?.hwi?.prs?.[0];
  if (!first || !nonEmpty(first.mw)) {
    throw pipelineError(
      PIPELINE_CODES.MISSING_PRONUNCIATION,
      "The first Merriam-Webster pronunciation has no written pronunciation",
    );
  }

  const audioFile = first.sound?.audio;
  if (!nonEmpty(audioFile)) {
    throw pipelineError(
      PIPELINE_CODES.MISSING_AUDIO,
      "The first Merriam-Webster pronunciation has no audio filename",
    );
  }

  const normalizedAudioFile = audioFile.trim();
  return {
    mw: first.mw,
    audio_file: normalizedAudioFile,
    audio_url: buildMwAudioUrl(normalizedAudioFile),
  };
}

export async function verifyAudioUrl(url, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required");
  }

  let response;
  try {
    response = await fetchImpl(url, { method: "HEAD" });
  } catch {
    throw new MwAudioVerificationError("MW audio verification failed during transport");
  }

  if (response?.status === 404) {
    throw pipelineError(
      PIPELINE_CODES.AUDIO_404,
      "Merriam-Webster audio URL returned HTTP 404",
      { url },
    );
  }
  if (!response?.ok) {
    throw new MwAudioVerificationError(
      `MW audio verification failed with HTTP ${response?.status ?? "unknown"}`,
      response?.status,
    );
  }

  return { ok: true, status: response.status };
}
