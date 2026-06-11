import { useEffect, useRef, useState } from 'react';

// Face PRESENCE detection (never identity) on a shared MediaStream via
// MediaPipe FaceDetector. Consumed by both the proctoring hook (which turns
// transitions into ProctoringEvents) and any UI that wants a live badge.
// Degrades to 'unavailable' when the model can't load (e.g. offline).

export type FaceStatus = 'init' | 'ok' | 'none' | 'multiple' | 'unavailable';

const CHECK_EVERY_MS = 3_000;
const MISSES_BEFORE_EVENT = 3;

export interface FacePresence {
  faceStatus: FaceStatus;
  // draws the current frame of the shared stream to a low-res JPEG data URL
  // (reused by proctoring snapshots) — null when no frame is available
  captureFrame: () => string | null;
}

export function useFacePresence(
  stream: MediaStream | null,
  active: boolean,
  onEvent?: (type: 'FACE_NOT_DETECTED' | 'MULTIPLE_FACES', meta?: any) => void
): FacePresence {
  const [faceStatus, setFaceStatus] = useState<FaceStatus>('init');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const captureFrame = (): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 320;
      canvasRef.current.height = 240;
    }
    canvasRef.current.getContext('2d')?.drawImage(video, 0, 0, 320, 240);
    return canvasRef.current.toDataURL('image/jpeg', 0.5);
  };

  useEffect(() => {
    if (!active || !stream) {
      setFaceStatus('init');
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let detector: any = null;
    let misses = 0;

    (async () => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        return;
      }
      if (cancelled) return;
      videoRef.current = video;

      try {
        const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
        const fileset = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        detector = await FaceDetector.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
          },
          runningMode: 'VIDEO',
        });
        if (cancelled) {
          detector.close?.();
          return;
        }
        timer = setInterval(() => {
          if (!videoRef.current || !detector) return;
          try {
            const result = detector.detectForVideo(videoRef.current, performance.now());
            const faces = result?.detections?.length ?? 0;
            if (faces === 0) {
              setFaceStatus('none');
              misses++;
              if (misses === MISSES_BEFORE_EVENT) {
                onEventRef.current?.('FACE_NOT_DETECTED', { consecutiveChecks: MISSES_BEFORE_EVENT });
                misses = 0;
              }
            } else {
              misses = 0;
              if (faces > 1) {
                setFaceStatus('multiple');
                onEventRef.current?.('MULTIPLE_FACES', { faces });
              } else {
                setFaceStatus('ok');
              }
            }
          } catch {
            /* skip frame */
          }
        }, CHECK_EVERY_MS);
      } catch (e) {
        console.warn('Face detection unavailable:', e);
        setFaceStatus('unavailable');
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      detector?.close?.();
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current = null;
      }
    };
  }, [stream, active]);

  return { faceStatus, captureFrame };
}
