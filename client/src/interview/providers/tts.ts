import { apiClient } from '../../services/api';

// TtsProvider — pluggable text-to-speech for the AI interviewer.
//
// Default: Web Speech `speechSynthesis` (zero cost, offline, ships first).
// Limitation worth knowing: speechSynthesis audio never passes through the
// Web Audio graph, so a real `AnalyserNode` CANNOT observe it. For lip-sync we
// therefore synthesize a speech-like amplitude envelope while the utterance is
// speaking (pulsing on word boundaries). The `AudioUrlTts` provider below
// shows the real AnalyserNode path for any backend TTS that returns audio —
// swap it in without touching interview logic.

export interface TtsCallbacks {
  onStart?: () => void;
  onAmplitude?: (a: number) => void; // 0..1, drives the avatar mouth
  onEnd?: () => void;
  onError?: () => void; // pre-playback failure — lets a hybrid provider fall back
}

export interface TtsProvider {
  available(): boolean;
  speak(text: string, cb: TtsCallbacks): void;
  stop(): void; // also used for barge-in ducking
}

// ---------- default: Web Speech API ----------

// Pick a natural-sounding FEMALE English voice to match the avatar persona.
// getVoices() is async on most browsers (empty until 'voiceschanged' fires), so
// we cache the best match and refresh it when the list arrives.
let cachedVoice: SpeechSynthesisVoice | null = null;
const FEMALE_HINTS = /(female|woman|samantha|victoria|karen|moira|tessa|fiona|serena|zira|aria|jenny|natasha|libby|sonia|neerja|google us english|google uk english female)/i;

function resolveVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  const en = voices.filter((v) => /en[-_]/i.test(v.lang));
  cachedVoice =
    en.find((v) => FEMALE_HINTS.test(v.name) && /natural|neural|online/i.test(v.name)) ||
    en.find((v) => FEMALE_HINTS.test(v.name)) ||
    en.find((v) => /natural|neural|online/i.test(v.name)) ||
    en[0] ||
    null;
  return cachedVoice;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  // populate the cache as soon as the browser loads its voice list
  resolveVoice();
  speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
    resolveVoice();
  };
}

export class WebSpeechTts implements TtsProvider {
  private envelopeTimer: ReturnType<typeof setInterval> | null = null;
  private speaking = false;

  available(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  speak(text: string, cb: TtsCallbacks): void {
    if (!this.available()) {
      // text-only mode: report an instant start/end so the UI flow continues
      cb.onStart?.();
      cb.onEnd?.();
      return;
    }
    this.stop();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.98; // a hair slower reads as calmer/more natural
    utterance.pitch = 1.05; // slightly up to match the female persona
    const voice = resolveVoice();
    if (voice) utterance.voice = voice;

    let boundaryPulse = 1;
    utterance.onstart = () => {
      this.speaking = true;
      cb.onStart?.();
      // synthetic speech envelope (see header comment for why)
      let t = 0;
      this.envelopeTimer = setInterval(() => {
        t += 0.08;
        const base = 0.35 + 0.4 * Math.abs(Math.sin(t * 7.3)) + 0.25 * Math.random();
        cb.onAmplitude?.(Math.min(1, base * boundaryPulse));
        boundaryPulse = Math.min(1, boundaryPulse + 0.15);
      }, 80);
    };
    utterance.onboundary = () => {
      boundaryPulse = 0.25; // brief dip between words/sentences
    };
    const finish = () => {
      this.speaking = false;
      if (this.envelopeTimer) clearInterval(this.envelopeTimer);
      this.envelopeTimer = null;
      cb.onAmplitude?.(0);
      cb.onEnd?.();
    };
    utterance.onend = finish;
    utterance.onerror = finish;

    speechSynthesis.speak(utterance);
  }

  stop(): void {
    if (!this.available()) return;
    if (this.envelopeTimer) clearInterval(this.envelopeTimer);
    this.envelopeTimer = null;
    if (this.speaking || speechSynthesis.speaking || speechSynthesis.pending) {
      speechSynthesis.cancel();
    }
    this.speaking = false;
  }
}

// ---------- alternative: backend-audio TTS with a REAL analyser ----------
// For a higher-quality voice, add a backend endpoint that returns audio
// (proxying the vendor — never expose the API key client-side) and construct
// this provider with its URL factory. Amplitude here comes from an actual
// Web Audio AnalyserNode on the playing audio.

export class AudioUrlTts implements TtsProvider {
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private raf = 0;
  private objectUrl: string | null = null;

  constructor(private synthesize: (text: string) => Promise<string /* audio URL */>) {}

  available(): boolean {
    return typeof window !== 'undefined' && 'AudioContext' in window;
  }

  speak(text: string, cb: TtsCallbacks): void {
    this.stop();
    let started = false;
    // A failure before audio actually starts should let a hybrid provider fall
    // back to another voice; once playback has begun we just end normally.
    const fail = () => (started ? cb.onEnd?.() : (cb.onError ?? cb.onEnd)?.());

    this.synthesize(text)
      .then((url) => {
        this.objectUrl = url.startsWith('blob:') ? url : null;
        const audio = new Audio(url);
        this.audio = audio;
        this.ctx = new AudioContext();
        this.ctx.resume().catch(() => {});
        const source = this.ctx.createMediaElementSource(audio);
        const analyser = this.ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(this.ctx.destination);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const v of data) sum += Math.abs(v - 128);
          cb.onAmplitude?.(Math.min(1, (sum / data.length / 40) * 1.5));
          this.raf = requestAnimationFrame(tick);
        };
        audio.onplay = () => {
          started = true;
          cb.onStart?.();
          tick();
        };
        audio.onended = () => {
          cancelAnimationFrame(this.raf);
          this.releaseUrl();
          cb.onAmplitude?.(0);
          cb.onEnd?.();
        };
        audio.onerror = () => fail();
        audio.play().catch(() => fail());
      })
      .catch(() => fail());
  }

  private releaseUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.audio?.pause();
    this.audio = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.releaseUrl();
  }
}

// ---------- hybrid: free Edge neural voice with a Web Speech fallback ----------
// Tries the backend Edge-TTS endpoint first (natural neural voice + real
// AnalyserNode lip-sync). If it can't reach/produce audio, it falls back to the
// browser's speechSynthesis for that (and every later) utterance.

export class HybridTts implements TtsProvider {
  private backendDown = false;
  constructor(private backend: TtsProvider, private fallback: TtsProvider) {}

  available(): boolean {
    return this.backend.available() || this.fallback.available();
  }

  speak(text: string, cb: TtsCallbacks): void {
    if (this.backendDown || !this.backend.available()) {
      this.fallback.speak(text, cb);
      return;
    }
    this.backend.speak(text, {
      ...cb,
      onError: () => {
        this.backendDown = true; // stop paying the round-trip on a dead backend
        this.fallback.speak(text, cb);
      },
    });
  }

  stop(): void {
    this.backend.stop();
    this.fallback.stop();
  }
}

// Fetch interviewer audio from the backend (auth'd) and hand back a same-origin
// object URL so Web Audio can analyse it for lip-sync without CORS tainting.
async function synthesizeViaBackend(text: string): Promise<string> {
  const blob = await apiClient.postBlob('/ai-interview/tts', { text });
  if (!blob.size) throw new Error('empty audio');
  return URL.createObjectURL(blob);
}

export const defaultTts: TtsProvider =
  typeof window !== 'undefined' && 'AudioContext' in window
    ? new HybridTts(new AudioUrlTts(synthesizeViaBackend), new WebSpeechTts())
    : new WebSpeechTts();
