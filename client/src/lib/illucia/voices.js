// Orders the browser's speech voices for Illucia's lines. Every voice is
// allowed, cloud voices included; English comes first, best-sounding first.
const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|pipe organ|superstar|trinoids|whisper|wobble|zarvox)\b/i;
const FEMININE = /\b(aria|ava|allison|clara|emma|female|hazel|jenny|karen|libby|michelle|moira|natasha|samantha|serena|sonia|susan|tessa|zira)\b|google us english/i;

// Android reports en_US where other browsers report en-US.
const language = voice => String(voice.lang ?? '').replace('_', '-').toLowerCase();
export const isEnglish = voice => /^en(-|$)/.test(language(voice));

function score(voice) {
  const name = voice.name ?? '';
  let value = isEnglish(voice) ? 1000 : 0;
  if (language(voice) === 'en-us') value += 30;
  else if (language(voice) === 'en-gb') value += 20;
  if (/natural|neural/i.test(name)) value += 400;
  if (/online/i.test(name)) value += 150;
  if (/premium|enhanced/i.test(name)) value += 300;
  if (/google/i.test(name)) value += 200;
  // Illucia is a girl: a feminine voice wins among otherwise equal voices.
  if (FEMININE.test(name)) value += 50;
  if (NOVELTY.test(name)) value -= 600;
  return value;
}

export function rankVoices(voices) {
  return [...voices].map(voice => [score(voice), voice])
    .sort((a, b) => b[0] - a[0] || String(a[1].name).localeCompare(String(b[1].name)))
    .map(([, voice]) => voice);
}

// The player's stored choice if this browser still has it, else the best ranked.
export function pickVoice(ranked, voiceURI) {
  return ranked.find(voice => voice.voiceURI === voiceURI) ?? ranked[0] ?? null;
}
