# Interviewer avatar image

The face-to-face AI interview (`InterviewRoom`) shows a realistic still portrait
that lip-syncs to the synthetic interviewer's voice.

## Add your image

Save the portrait here as:

```
client/public/interviewer-avatar.jpg
```

Requirements / tips for the best result:

- **Use a clearly synthetic / AI-generated face** (not a real, identifiable
  person). Keep the "Synthetic AI interviewer" label visible — this avoids ToS
  and consent problems with talking-head use in assessments.
- A **front-facing head-and-shoulders portrait**, head roughly centered, works
  best for the puppet lip-sync.
- `.jpg` or `.png` is fine. If you use a different filename or path, set
  `VITE_INTERVIEWER_AVATAR` in `client/.env` (e.g. `VITE_INTERVIEWER_AVATAR=/my-face.png`).

If the image is missing or fails to load, the room automatically falls back to
the built-in stylized (cartoon) avatar — nothing breaks.

## Tuning the mouth position

The lips on most centered portraits land near the default seam. If the mouth
looks misaligned on your photo, nudge `MOUTH_LINE` (and optionally `MAX_JAW_DROP`)
near the top of `client/src/interview/providers/avatar.tsx`.

## Upgrading to true video lip-sync (optional, paid)

The avatar is a pluggable interface. To get real talking-head video instead of
the still-photo puppet, implement a provider (D-ID, HeyGen, etc.) behind the
same `InterviewerAvatarComponent` interface and proxy its API through the backend
(`server/ai/providers/tts.ts` already sketches the server-side TTS proxy path).
Keep the synthetic-persona and disclosure rules above.
