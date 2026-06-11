// SttProvider — pluggable speech-to-text for the candidate's answers.
//
// Default: Web Speech `SpeechRecognition` (Chrome/Edge; zero cost). The
// browser's recognizer auto-ends on silence, which doubles as our VAD; the
// room also offers push-to-talk (hold to record, release to commit).
// Voice is an enhancement, never a requirement — the room always keeps a
// typed-answer fallback.

export interface SttCallbacks {
  onInterim?: (text: string) => void; // live captions while speaking
  onFinal: (text: string) => void; // committed transcript for the turn
  onEnd?: () => void;
  onError?: (message: string) => void;
}

export interface SttProvider {
  available(): boolean;
  start(cb: SttCallbacks): void;
  stop(): void; // graceful: commit what was heard
  abort(): void; // discard
  isListening(): boolean;
}

const SpeechRecognitionImpl: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : undefined;

export class WebSpeechStt implements SttProvider {
  private recognition: any = null;
  private listening = false;
  private finalText = '';

  available(): boolean {
    return !!SpeechRecognitionImpl;
  }

  isListening(): boolean {
    return this.listening;
  }

  start(cb: SttCallbacks): void {
    if (!this.available()) {
      cb.onError?.('Speech recognition is not supported in this browser — type your answer instead.');
      return;
    }
    this.abort();
    const rec = new SpeechRecognitionImpl();
    rec.lang = navigator.language?.startsWith('en') ? navigator.language : 'en-IN';
    rec.interimResults = true;
    rec.continuous = true; // we stop on push-to-talk release or explicit stop
    this.finalText = '';

    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) this.finalText += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      cb.onInterim?.((this.finalText + interim).trim());
    };
    rec.onerror = (event: any) => {
      this.listening = false;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        cb.onError?.('Microphone permission denied — type your answer instead.');
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        cb.onError?.(`Speech recognition error: ${event.error}`);
      }
      cb.onEnd?.();
    };
    rec.onend = () => {
      // fires on silence (browser VAD) and on stop()
      this.listening = false;
      const text = this.finalText.trim();
      if (text) cb.onFinal(text);
      cb.onEnd?.();
    };

    this.recognition = rec;
    this.listening = true;
    try {
      rec.start();
    } catch {
      this.listening = false;
      cb.onError?.('Could not start the microphone.');
    }
  }

  stop(): void {
    this.recognition?.stop(); // triggers onend → onFinal with what was heard
  }

  abort(): void {
    if (this.recognition) {
      this.recognition.onend = null;
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      try {
        this.recognition.abort();
      } catch {
        /* already stopped */
      }
      this.recognition = null;
    }
    this.listening = false;
    this.finalText = '';
  }
}

export const defaultStt: SttProvider = new WebSpeechStt();
