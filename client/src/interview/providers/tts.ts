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
}

export interface TtsProvider {
  available(): boolean;
  speak(text: string, cb: TtsCallbacks): void;
  stop(): void; // also used for barge-in ducking
}

// ---------- default: Web Speech API ----------

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
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    // prefer a natural-ish English voice when present
    const voice = speechSynthesis
      .getVoices()
      .find((v) => /en[-_]/i.test(v.lang) && /natural|neural|online/i.test(v.name));
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

  constructor(private synthesize: (text: string) => Promise<string /* audio URL */>) {}

  available(): boolean {
    return typeof window !== 'undefined' && 'AudioContext' in window;
  }

  speak(text: string, cb: TtsCallbacks): void {
    this.stop();
    this.synthesize(text)
      .then((url) => {
        const audio = new Audio(url);
        this.audio = audio;
        this.ctx = new AudioContext();
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
          cb.onStart?.();
          tick();
        };
        audio.onended = () => {
          cancelAnimationFrame(this.raf);
          cb.onAmplitude?.(0);
          cb.onEnd?.();
        };
        audio.play().catch(() => cb.onEnd?.());
      })
      .catch(() => cb.onEnd?.());
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.audio?.pause();
    this.audio = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

export const defaultTts: TtsProvider = new WebSpeechTts();
