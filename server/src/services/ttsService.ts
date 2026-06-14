// Free neural text-to-speech for the AI interviewer, powered by Microsoft Edge's
// "Read Aloud" voices via `msedge-tts`. This needs NO API key and has no usage
// limits — it's the same neural engine behind Edge's read-aloud, accessed over
// its public websocket. The client plays the returned MP3 through a real Web
// Audio AnalyserNode, so the avatar's mouth lip-syncs to the actual waveform.
//
// If this service ever fails (network, MS endpoint change), the client falls
// back to the browser's built-in speechSynthesis voice automatically.

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

// A natural female neural voice to match the interviewer persona. Override with
// INTERVIEWER_TTS_VOICE (e.g. en-US-JennyNeural, en-US-EmmaNeural, en-GB-SoniaNeural).
const DEFAULT_VOICE = process.env.INTERVIEWER_TTS_VOICE || 'en-US-AriaNeural';

// Small in-memory cache so repeated phrasing (greetings, closings) isn't
// re-synthesized — keyed by voice+text.
const cache = new Map<string, Buffer>();
const MAX_CACHE = 200;

export async function synthesizeSpeech(text: string, voice?: string): Promise<Buffer> {
  const useVoice = voice || DEFAULT_VOICE;
  const key = `${useVoice}:${text}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const tts = new MsEdgeTTS();
  await tts.setMetadata(useVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = await tts.toStream(text);

  const chunks: Buffer[] = [];
  const audio = await new Promise<Buffer>((resolve, reject) => {
    audioStream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
    audioStream.on('end', () => resolve(Buffer.concat(chunks)));
    audioStream.on('close', () => resolve(Buffer.concat(chunks)));
    audioStream.on('error', reject);
  });

  if (audio.length === 0) throw new Error('Edge TTS returned empty audio');

  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, audio);
  return audio;
}
