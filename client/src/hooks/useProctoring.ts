import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/api';
import { useCameraStream } from './useCameraStream';
import { useFacePresence, FaceStatus } from './useFacePresence';

// Client-side proctoring for PROCTORED attempts.
// - Activity signals: tab blur/focus, fullscreen exit, copy/paste → batched
//   to POST /assessments/attempts/:id/events every few seconds.
// - Camera: consumes the page's SINGLE shared stream (useCameraStream) — the
//   SelfViewCamera tile uses the same one; getUserMedia is never called twice.
// - Face presence via useFacePresence (presence only, no identity).
// - Low-res snapshots every SNAPSHOT_EVERY_MS, stored server-side for the
//   admin report only.
// Warnings shown to the student are informational, never punitive.

const FLUSH_EVERY_MS = 5_000;
const SNAPSHOT_EVERY_MS = 60_000;

type EventType =
  | 'TAB_BLUR' | 'TAB_FOCUS' | 'FULLSCREEN_EXIT' | 'COPY' | 'PASTE'
  | 'FACE_NOT_DETECTED' | 'MULTIPLE_FACES' | 'NO_CAMERA';

const WARNINGS: Partial<Record<EventType, string>> = {
  TAB_BLUR: 'Leaving the test tab was recorded.',
  FULLSCREEN_EXIT: 'Exiting fullscreen was recorded.',
  COPY: 'Copying was recorded.',
  PASTE: 'Pasting was recorded.',
  FACE_NOT_DETECTED: 'Your face is not visible to the camera.',
  MULTIPLE_FACES: 'More than one face is visible to the camera.',
  NO_CAMERA: 'Camera unavailable — this was recorded.',
};

export function useProctoring(attemptId: string | null, active: boolean) {
  const [warning, setWarning] = useState<string | null>(null);
  const queue = useRef<{ type: EventType; meta?: any; at: string }[]>([]);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noCameraReported = useRef(false);

  const record = useCallback((type: EventType, meta?: any) => {
    queue.current.push({ type, meta, at: new Date().toISOString() });
    const message = WARNINGS[type];
    if (message) {
      setWarning(message);
      if (warningTimer.current) clearTimeout(warningTimer.current);
      warningTimer.current = setTimeout(() => setWarning(null), 6000);
    }
  }, []);

  // ---- shared camera + face presence ----
  const { stream, status: cameraStatus } = useCameraStream(active && !!attemptId);
  const { faceStatus, captureFrame } = useFacePresence(stream, active && !!attemptId, record);

  useEffect(() => {
    if (!active) {
      noCameraReported.current = false;
      return;
    }
    if (cameraStatus === 'denied' && !noCameraReported.current) {
      noCameraReported.current = true;
      record('NO_CAMERA', { via: 'getUserMedia-denied-or-ended' });
    }
    if (cameraStatus === 'on') noCameraReported.current = false;
  }, [cameraStatus, active, record]);

  // ---- batched flush ----
  useEffect(() => {
    if (!active || !attemptId) return;
    const flush = async () => {
      if (queue.current.length === 0) return;
      const events = queue.current.splice(0, 50);
      try {
        await apiClient.post(`/assessments/attempts/${attemptId}/events`, { events });
      } catch {
        queue.current.unshift(...events); // retry next tick
      }
    };
    const t = setInterval(flush, FLUSH_EVERY_MS);
    return () => {
      clearInterval(t);
      flush();
    };
  }, [active, attemptId]);

  // ---- activity signals ----
  useEffect(() => {
    if (!active) return;
    const onVisibility = () =>
      record(document.hidden ? 'TAB_BLUR' : 'TAB_FOCUS', { via: 'visibilitychange' });
    const onBlur = () => record('TAB_BLUR', { via: 'window.blur' });
    const onFocus = () => record('TAB_FOCUS', { via: 'window.focus' });
    const onFullscreen = () => {
      if (!document.fullscreenElement) record('FULLSCREEN_EXIT');
    };
    const onCopy = () => record('COPY');
    const onPaste = () => record('PASTE');
    const onContextMenu = () => record('COPY', { via: 'contextmenu' });

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContextMenu);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, [active, record]);

  // ---- periodic snapshots from the shared stream ----
  useEffect(() => {
    if (!active || !attemptId || cameraStatus !== 'on') return;
    const sendSnapshot = async () => {
      const image = captureFrame();
      if (!image) return;
      try {
        await apiClient.post(`/assessments/attempts/${attemptId}/snapshot`, { image });
      } catch {
        /* non-fatal */
      }
    };
    const first = setTimeout(sendSnapshot, 3000); // give the stream a moment
    const t = setInterval(sendSnapshot, SNAPSHOT_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, attemptId, cameraStatus]);

  return {
    warning,
    cameraOn: cameraStatus === 'on',
    faceStatus: (cameraStatus === 'denied' ? 'unavailable' : faceStatus) as FaceStatus,
  };
}

export async function enterFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
  } catch {
    /* user agent refused — the exit event listeners still apply */
  }
}
