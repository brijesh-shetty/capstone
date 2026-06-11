import React, { useEffect, useState } from 'react';

// InterviewerAvatar — pluggable "face" for the AI interviewer. The interview
// room only knows this interface; the rendering implementation can be swapped
// without touching interview logic.
//
// Implementations:
// 1. StylizedAvatar (default, ships first): free, offline, audio-reactive SVG
//    head — mouth driven by the TTS amplitude callback, idle blinks, subtle
//    head sway, and listening/thinking/speaking state cues.
// 2. Talking-head VIDEO providers (D-ID, HeyGen, etc.) can implement this same
//    interface, but stay OFF unless a provider key is configured server-side.
//    Trade-offs to weigh before enabling one:
//      - cost: streaming avatar APIs bill per minute (typically $0.10–$0.30/min)
//      - latency: 1–3s per utterance vs ~0ms for the stylized head
//      - ToS: most providers forbid assessment/decision-making use without
//        disclosure — keep the "synthetic AI interviewer" label visible
//      - identity: the avatar MUST NOT depict a real, identifiable person;
//        use a clearly synthetic, generic persona only.
//    API keys must stay server-side — proxy any vendor call through the backend.

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface InterviewerAvatarProps {
  state: AvatarState;
  amplitude: number; // 0..1 — current TTS loudness, drives the mouth
}

export type InterviewerAvatarComponent = React.FC<InterviewerAvatarProps>;

// ---------- default implementation ----------

export const StylizedAvatar: InterviewerAvatarComponent = ({ state, amplitude }) => {
  const [blink, setBlink] = useState(false);

  // idle blinks on a natural-ish randomized interval
  useEffect(() => {
    let alive = true;
    const scheduleBlink = () => {
      setTimeout(() => {
        if (!alive) return;
        setBlink(true);
        setTimeout(() => {
          setBlink(false);
          scheduleBlink();
        }, 140);
      }, 2200 + Math.random() * 2600);
    };
    scheduleBlink();
    return () => {
      alive = false;
    };
  }, []);

  const mouthOpen = state === 'speaking' ? 2 + amplitude * 16 : 1.5;
  const eyeRy = blink ? 0.6 : 5;

  return (
    <div className="relative flex flex-col items-center">
      <svg
        viewBox="0 0 200 220"
        className="w-56 h-64 md:w-72 md:h-80"
        style={{
          animation: 'avatarSway 6s ease-in-out infinite',
          transformOrigin: '50% 80%',
        }}
      >
        {/* listening ring */}
        {state === 'listening' && (
          <circle cx="100" cy="105" r="92" fill="none" stroke="#34d399" strokeWidth="3" opacity="0.8">
            <animate attributeName="r" values="88;95;88" dur="1.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.8;0.25;0.8" dur="1.6s" repeatCount="indefinite" />
          </circle>
        )}
        {/* head */}
        <ellipse cx="100" cy="105" rx="72" ry="82" fill="#6366f1" />
        <ellipse cx="100" cy="108" rx="64" ry="74" fill="#818cf8" />
        {/* hair */}
        <path d="M 36 80 Q 50 18 100 22 Q 150 18 164 80 Q 150 48 100 46 Q 50 48 36 80 Z" fill="#312e81" />
        {/* eyes */}
        <ellipse cx="72" cy="92" rx="9" ry={eyeRy} fill="#1e1b4b" />
        <ellipse cx="128" cy="92" rx="9" ry={eyeRy} fill="#1e1b4b" />
        {/* brows: raise slightly while thinking */}
        <rect x="60" y={state === 'thinking' ? 70 : 76} width="24" height="4" rx="2" fill="#312e81" />
        <rect x="116" y={state === 'thinking' ? 70 : 76} width="24" height="4" rx="2" fill="#312e81" />
        {/* mouth: amplitude-driven while speaking */}
        <ellipse cx="100" cy="142" rx="20" ry={mouthOpen} fill="#1e1b4b" />
        {/* shoulders */}
        <path d="M 20 220 Q 100 168 180 220 Z" fill="#4f46e5" />
      </svg>

      {/* thinking dots */}
      {state === 'thinking' && (
        <div className="absolute -top-2 right-6 bg-white rounded-full px-3 py-1 shadow flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes avatarSway {
          0%, 100% { transform: rotate(-1.2deg) translateY(0); }
          50% { transform: rotate(1.2deg) translateY(-4px); }
        }
      `}</style>
    </div>
  );
};

// Resolves the configured avatar. Video-based providers would be returned here
// when a key is configured (fetched from the backend, never hard-coded).
export function getInterviewerAvatar(): InterviewerAvatarComponent {
  return StylizedAvatar;
}
