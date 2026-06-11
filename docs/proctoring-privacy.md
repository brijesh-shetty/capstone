# Proctoring & Privacy

This document describes what the platform monitors during **PROCTORED** tests,
who can see that data, and how long it is kept. PRACTICE tests are never
monitored.

## What is collected (PROCTORED attempts only)

| Signal | What is stored | What is NOT stored |
|---|---|---|
| Tab/window switches | Event type + timestamp (`TAB_BLUR`/`TAB_FOCUS`) | Which tab/app you switched to |
| Fullscreen exits | Event + timestamp | — |
| Copy / paste / right-click | Event + timestamp | The copied/pasted content |
| Camera presence | `FACE_NOT_DETECTED` / `MULTIPLE_FACES` / `NO_CAMERA` events | No identity recognition of any kind — the detector only counts whether a face is present |
| Webcam snapshots | One low-resolution (320×240) JPEG per minute | No continuous video, no audio |

## Consent

- A proctored attempt shows an explicit consent screen **before any question is
  served** — the server withholds test content until consent is recorded
  (`TestAttempt.consentAt`).
- Declining consent simply means not taking the proctored test.
- Camera permission is requested by the browser after consent; denying it lets
  the attempt continue, but `NO_CAMERA` is recorded for the reviewer.

## Who can see the data

- Only users with the `ADMIN` or `EDUCATOR` role, via the proctoring report
  (`/admin/attempts/:id/proctoring`). Snapshot images are served through the
  same role-checked endpoint — there are no public URLs.
- Students never see other students' events; flags are presented to reviewers
  as *signals for human judgment, not verdicts*.

## Retention

- Snapshots are kept for the report window (default **30 days**) and then
  purged — files and database records — by `server/scripts/purge-snapshots.ts`
  (run `npx ts-node scripts/purge-snapshots.ts`, or schedule it).
- Activity events (no images) are retained with the attempt for reporting.

## Face-to-face AI interview (camera + microphone)

- The video interview asks for **separate, explicit camera and microphone
  consent** before it starts; denying either falls back to a text-only
  interview — voice and video are enhancements, never requirements.
- The interviewer is always labeled a **synthetic AI** — it is not a real
  person, and the avatar never depicts a real, identifiable person.
- What is stored: the **text transcript** of both sides and face-presence
  event **counts** (`FACE_NOT_DETECTED`, `MULTIPLE_FACES`, `NO_CAMERA`) on the
  interview record, shown in the report as an informational signal.
- What is NOT stored: raw microphone audio, raw video, or webcam snapshots —
  the interview records no media at all.
- Captions can be toggled on at any time for accessibility.

## Student-visible statement (shown on the consent screen)

> This is a proctored test: tab switches, fullscreen exits, and copy/paste are
> recorded, and camera monitoring applies while the attempt is open.
> Warnings during the test are informational — they are recorded for the
> reviewer, who makes any final judgment.
