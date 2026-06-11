import { useEffect, useState } from 'react';

// Single shared camera stream per page. The proctoring face-presence detector,
// snapshot capture, and the SelfViewCamera tile all consume THIS stream —
// getUserMedia is never called twice concurrently.

export type CameraStatus = 'off' | 'pending' | 'on' | 'denied';

interface CameraState {
  stream: MediaStream | null;
  status: CameraStatus;
}

let state: CameraState = { stream: null, status: 'off' };
let refCount = 0;
const listeners = new Set<(s: CameraState) => void>();

function notify() {
  for (const l of listeners) l({ ...state });
}

async function acquire() {
  refCount++;
  if (state.status === 'on' || state.status === 'pending') return;
  state = { stream: null, status: 'pending' };
  notify();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240 },
      audio: false,
    });
    if (refCount === 0) {
      // everyone released while we were waiting
      stream.getTracks().forEach((t) => t.stop());
      state = { stream: null, status: 'off' };
    } else {
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        state = { stream: null, status: 'denied' };
        notify();
      });
      state = { stream, status: 'on' };
    }
  } catch {
    state = { stream: null, status: 'denied' };
  }
  notify();
}

function release() {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0) {
    state.stream?.getTracks().forEach((t) => t.stop());
    state = { stream: null, status: 'off' };
    notify();
  }
}

// React subscription. `active=false` neither acquires nor blocks others.
export function useCameraStream(active: boolean): CameraState {
  const [snapshot, setSnapshot] = useState<CameraState>({ ...state });

  useEffect(() => {
    const listener = (s: CameraState) => setSnapshot(s);
    listeners.add(listener);
    setSnapshot({ ...state });
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    acquire();
    return () => release();
  }, [active]);

  return snapshot;
}
