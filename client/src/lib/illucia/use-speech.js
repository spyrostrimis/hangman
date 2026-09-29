import { useCallback, useEffect, useRef, useState } from 'react';
import { pickVoice, rankVoices } from './voices.js';

const ENABLED_KEY = 'illucia-observatory.voice';
const VOICE_KEY = 'illucia-observatory.voice-uri';
// Some browsers never fire 'end'. A lost event must not stall the duel.
export const LONGEST_LINE_MS = 12000;

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Storage can be disabled. */ }
}
function browserSpeech() {
  return typeof window !== 'undefined' && window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function'
    ? window.speechSynthesis : null;
}

// Illucia's spoken voice: browser speech synthesis, off until the player turns it on.
// busy stays true while a line is being spoken, so the duel can wait for her.
export function useSpeech() {
  const [synth] = useState(browserSpeech);
  const [enabled, setEnabledState] = useState(() => Boolean(synth) && read(ENABLED_KEY) === 'on');
  const [voices, setVoices] = useState([]);
  const [voiceURI, setVoiceURIState] = useState(() => read(VOICE_KEY));
  const [busy, setBusy] = useState(false);
  const choice = useRef(null);
  const current = useRef(null);
  const cap = useRef(null);
  choice.current = pickVoice(voices, voiceURI);

  useEffect(() => {
    if (!synth) return undefined;
    const load = () => setVoices(rankVoices(synth.getVoices()));
    load();
    synth.addEventListener?.('voiceschanged', load);
    return () => synth.removeEventListener?.('voiceschanged', load);
  }, [synth]);

  const stop = useCallback(() => {
    current.current = null;
    clearTimeout(cap.current);
    synth?.cancel();
    setBusy(false);
  }, [synth]);

  const speak = useCallback((text, rate = 1) => {
    if (!synth || !text) return;
    stop();
    const utterance = new window.SpeechSynthesisUtterance(text);
    const voice = choice.current;
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || 'en-US';
    utterance.rate = rate;
    // Cancelling fires 'end' or 'error' on the old line; only the current one clears busy.
    const done = () => {
      if (current.current !== utterance) return;
      current.current = null;
      clearTimeout(cap.current);
      setBusy(false);
    };
    utterance.onend = done;
    utterance.onerror = done;
    current.current = utterance;
    setBusy(true);
    cap.current = setTimeout(done, LONGEST_LINE_MS);
    synth.speak(utterance);
  }, [synth, stop]);

  useEffect(() => stop, [stop]);

  const setEnabled = useCallback(value => {
    write(ENABLED_KEY, value ? 'on' : 'off');
    setEnabledState(value);
    if (!value) stop();
  }, [stop]);
  const setVoiceURI = useCallback(value => {
    write(VOICE_KEY, value);
    setVoiceURIState(value);
  }, []);

  return { supported: Boolean(synth), enabled, setEnabled, voices, voice: choice.current, setVoiceURI, speak, stop, busy };
}
