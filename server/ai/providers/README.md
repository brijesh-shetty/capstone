# Server-side AI providers

Provider integrations that must hold an API key live HERE, behind interfaces —
keys are never exposed client-side; the client calls a backend proxy route.

| Concern | Default (free) | Swappable to |
|---|---|---|
| Interview LLM | Groq `llama-3.3-70b` (auto-fallback `llama-3.1-8b-instant`) | Anthropic `claude-opus-4-8` — automatic when `ANTHROPIC_API_KEY` is set (`src/services/llmService.ts`) |
| TTS (interviewer voice) | Client-side Web Speech `speechSynthesis` (no server involved) | Any vendor TTS via `tts.ts` here + a proxy route returning audio; the client's `AudioUrlTts` then lip-syncs from a real AnalyserNode |
| STT (candidate voice) | Client-side Web Speech `SpeechRecognition` | Vendor STT via a proxy route (stream mic audio to backend) |
| Avatar face | Client-side stylized SVG head (free, offline) | Streaming talking-head APIs — see trade-off notes in `client/src/interview/providers/avatar.tsx`: per-minute cost, 1–3s latency, vendor ToS, and **never a real person's likeness** |

Rules:
- New vendor = new file implementing the matching interface + a proxy route.
  Client code must not change beyond choosing the provider.
- Keys come from `server/.env` only.
- Disclose synthetic media: the interviewer must always be labeled as an AI.
