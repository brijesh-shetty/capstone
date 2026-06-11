// Server-side TTS provider interface (no default implementation — the free
// default is client-side Web Speech). Implement this + add a proxy route
// (e.g. POST /ai-interview/tts { text } -> audio/mpeg) to plug in a vendor
// voice. The client's AudioUrlTts consumes the returned audio and lip-syncs
// via a real Web Audio AnalyserNode.
//
// Cost note: vendor TTS bills per character/minute — cache by (voice, text)
// hash if interviews reuse phrasing.

export interface ServerTtsProvider {
  name: string;
  // Returns audio bytes (mp3/ogg) for the given text.
  synthesize(text: string, voice?: string): Promise<Buffer>;
}

export const serverTtsProvider: ServerTtsProvider | null = null; // none configured
