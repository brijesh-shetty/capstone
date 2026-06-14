import { useCallback, useEffect, useRef, useState } from 'react';

// Lightweight, transparent integrity monitor for the interview PRACTICE quiz.
//
// This is intentionally NOT the heavyweight proctoring used by the formal
// AssessmentRunner (camera, snapshots, server-batched ProctoringEvent rows).
// Practice quizzes are low-stakes, so we only watch focus + clipboard activity
// in the browser, surface it honestly to the student (never punitive), and hand
// a small summary to the server on submit. It never changes score or XP.

export type IntegrityEventType = 'TAB_BLUR' | 'COPY' | 'PASTE' | 'CONTEXT_MENU';

const WARNINGS: Record<IntegrityEventType, string> = {
  TAB_BLUR: 'Leaving the quiz tab was noted — try to stay focused.',
  COPY: 'Copying from the quiz was noted.',
  PASTE: 'Pasting into the quiz was noted.',
  CONTEXT_MENU: 'Right-click was noted.',
};

export interface IntegrityPayload {
  counts: Record<IntegrityEventType, number>;
  hiddenMs: number;
}

export function useQuizIntegrity(active: boolean) {
  const [warning, setWarning] = useState<string | null>(null);
  const counts = useRef<Record<IntegrityEventType, number>>({
    TAB_BLUR: 0, COPY: 0, PASTE: 0, CONTEXT_MENU: 0,
  });
  const hiddenMs = useRef(0);
  const hiddenSince = useRef<number | null>(null);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tick, setTick] = useState(0); // re-render so the live badge updates

  const flash = useCallback((message: string) => {
    setWarning(message);
    if (warningTimer.current) clearTimeout(warningTimer.current);
    warningTimer.current = setTimeout(() => setWarning(null), 5000);
  }, []);

  const record = useCallback((type: IntegrityEventType) => {
    counts.current[type] += 1;
    flash(WARNINGS[type]);
    setTick(t => t + 1);
  }, [flash]);

  useEffect(() => {
    if (!active) return;

    const onVisibility = () => {
      if (document.hidden) {
        hiddenSince.current = Date.now();
        record('TAB_BLUR');
      } else if (hiddenSince.current != null) {
        hiddenMs.current += Date.now() - hiddenSince.current;
        hiddenSince.current = null;
      }
    };
    const onBlur = () => {
      if (hiddenSince.current == null) hiddenSince.current = Date.now();
    };
    const onFocus = () => {
      if (hiddenSince.current != null) {
        hiddenMs.current += Date.now() - hiddenSince.current;
        hiddenSince.current = null;
      }
    };
    const onCopy = () => record('COPY');
    const onPaste = () => record('PASTE');
    const onContextMenu = () => record('CONTEXT_MENU');

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContextMenu);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContextMenu);
      if (warningTimer.current) clearTimeout(warningTimer.current);
    };
  }, [active, record]);

  // Snapshot of what we'd send to the server, callable at submit time.
  const getPayload = useCallback((): IntegrityPayload => {
    let totalHidden = hiddenMs.current;
    if (hiddenSince.current != null) totalHidden += Date.now() - hiddenSince.current;
    return { counts: { ...counts.current }, hiddenMs: totalHidden };
  }, []);

  const totalEvents =
    counts.current.TAB_BLUR + counts.current.COPY +
    counts.current.PASTE + counts.current.CONTEXT_MENU;

  // `tick` is read so eslint/react sees the dependency that forces re-render.
  void tick;

  return { warning, getPayload, totalEvents };
}
