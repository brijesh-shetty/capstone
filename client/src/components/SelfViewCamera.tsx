import React, { useEffect, useRef, useState } from 'react';
import { useCameraStream } from '../hooks/useCameraStream';
import { FaceStatus } from '../hooks/useFacePresence';

// Floating self-view PiP — the ONE reusable camera tile, rendered in both the
// proctored test runner and the interview room. Consumes the page's shared
// camera stream (never opens a second one). Mirrored like a normal video call,
// draggable to any corner (persisted), minimizable to a pill, with a live
// face-presence badge and a REC dot while proctoring is on.
//
// Only mount this AFTER the consent gate has passed.

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
const CORNER_KEY = 'selfview-corner';
const DEFAULT_CORNER: Corner = 'bottom-right';

const CORNER_STYLE: Record<Corner, React.CSSProperties> = {
  'top-left': { top: 16, left: 16 },
  'top-right': { top: 16, right: 16 },
  'bottom-left': { bottom: 16, left: 16 },
  'bottom-right': { bottom: 16, right: 16 },
};

const BADGES: Record<FaceStatus, { label: string; cls: string }> = {
  init: { label: '…', cls: 'bg-gray-400' },
  ok: { label: 'Face OK', cls: 'bg-emerald-500' },
  none: { label: 'No face', cls: 'bg-amber-500' },
  multiple: { label: '2+ faces', cls: 'bg-red-500' },
  unavailable: { label: 'No detector', cls: 'bg-gray-400' },
};

export const SelfViewCamera: React.FC<{
  active: boolean; // gate on consent — don't mount the stream before it
  proctoring: boolean; // shows the ● REC dot
  faceStatus: FaceStatus;
}> = ({ active, proctoring, faceStatus }) => {
  const { stream, status } = useCameraStream(active);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [corner, setCorner] = useState<Corner>(
    () => (localStorage.getItem(CORNER_KEY) as Corner) || DEFAULT_CORNER
  );
  const [minimized, setMinimized] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream, minimized, status]);

  if (!active) return null;

  // ---- drag-to-corner ----
  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragPos({ x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging.current) setDragPos({ x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const next: Corner = `${e.clientY < window.innerHeight / 2 ? 'top' : 'bottom'}-${
      e.clientX < window.innerWidth / 2 ? 'left' : 'right'
    }` as Corner;
    setCorner(next);
    localStorage.setItem(CORNER_KEY, next);
    setDragPos(null);
  };

  const position: React.CSSProperties = dragPos
    ? { top: Math.max(8, Math.min(dragPos.y - 60, window.innerHeight - 140)),
        left: Math.max(8, Math.min(dragPos.x - 100, window.innerWidth - 220)) }
    : CORNER_STYLE[corner];

  const badge = BADGES[faceStatus] || BADGES.init;

  // ---- minimized pill ----
  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed z-50 flex items-center gap-2 bg-slate-900 text-white text-xs font-bold px-3 py-2 rounded-full shadow-xl"
        style={CORNER_STYLE[corner]}
        title="Restore self-view"
      >
        🎥 {proctoring && <span className="text-red-400 animate-pulse">●</span>}
        <span className={`w-2 h-2 rounded-full ${badge.cls}`} />
      </button>
    );
  }

  return (
    <div
      className="fixed z-50 select-none"
      style={{ ...position, width: 210, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="rounded-xl overflow-hidden shadow-2xl border-2 border-slate-700 bg-slate-900 cursor-grab active:cursor-grabbing">
        {status === 'denied' ? (
          <div className="h-[140px] flex flex-col items-center justify-center text-slate-300 text-xs gap-1 p-3 text-center">
            <span className="text-xl">🚫</span>
            <span className="font-bold">Camera unavailable</span>
            <span className="text-slate-500">NO_CAMERA has been recorded</span>
          </div>
        ) : (
          <video
            ref={videoRef}
            muted
            playsInline
            className="w-full h-[140px] object-cover"
            style={{ transform: 'scaleX(-1)' }} // mirrored, like a normal call
          />
        )}
        <div className="flex items-center justify-between px-2 py-1 bg-slate-900 text-[10px] text-white">
          <span className="flex items-center gap-1 font-bold">
            {proctoring && <span className="text-red-500 animate-pulse">● REC</span>}
            <span className={`px-1.5 py-0.5 rounded-full text-white font-black ${badge.cls}`}>
              {badge.label}
            </span>
          </span>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setMinimized(true)}
            className="text-slate-400 hover:text-white font-black px-1"
            title="Minimize"
          >
            —
          </button>
        </div>
      </div>
    </div>
  );
};
