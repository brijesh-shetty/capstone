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

// ---------- photo-based avatar (realistic still portrait, puppet lip-sync) ----------
//
// PhotoAvatar makes a single still photo feel alive without a paid video
// provider. It is a clearly synthetic, generic persona (an AI-generated face),
// so it does NOT depict a real, identifiable person — keep it that way.
//
// How "talking" works on a static image (no real face mesh):
//   - the photo is drawn twice; the bottom copy ("jaw") is clipped to the lower
//     face and translated/scaled down by the live TTS amplitude, so the chin and
//     lower lip move while the interviewer speaks (the classic puppet warp).
//   - a soft dark "mouth cavity" shadow fades in over the lips with amplitude,
//     reading as an opening mouth.
//   - idle breathing (subtle scale) + slow head sway keep it from looking frozen.
//   - state rings/glow reuse the same listening / thinking / speaking cues as the
//     stylized head, so the room logic is unchanged.
//
// If the image can't load, it transparently falls back to StylizedAvatar.

// Image is served from client/public — drop your portrait there as
// `interviewer-avatar.jpg` (or override with VITE_INTERVIEWER_AVATAR).
const AVATAR_IMAGE_URL: string =
  ((import.meta as any).env?.VITE_INTERVIEWER_AVATAR as string) || '/interviewer-avatar.jpg';

// Mouth/jaw geometry as a fraction of the displayed image height/width. Defaults
// are tuned for a centered head-and-shoulders portrait; nudge MOUTH_LINE if the
// lips on your photo sit higher or lower than the seam.
const MOUTH_LINE = 0.52; // vertical position of the lips (0 = top, 1 = bottom)
const JAW_SIDE_TRIM = 0.26; // trim the jaw layer's sides so cheeks don't double
const MAX_JAW_DROP = 0.05; // max downward chin travel, as a fraction of height

export const PhotoAvatar: InterviewerAvatarComponent = ({ state, amplitude }) => {
  const [failed, setFailed] = useState(false);

  // smooth the raw amplitude a touch so the jaw doesn't jitter frame-to-frame
  const [smooth, setSmooth] = useState(0);
  useEffect(() => {
    setSmooth((s) => s * 0.5 + amplitude * 0.5);
  }, [amplitude]);

  if (failed) return <StylizedAvatar state={state} amplitude={amplitude} />;

  const speaking = state === 'speaking';
  const drop = speaking ? smooth * MAX_JAW_DROP : 0; // fraction of height
  const ringColor =
    state === 'listening' ? '#34d399' : state === 'thinking' ? '#fbbf24' : '#818cf8';
  const glow = speaking ? 0.35 + smooth * 0.55 : state === 'listening' ? 0.45 : 0.18;

  return (
    <div className="relative flex flex-col items-center">
      <div
        className="relative w-64 md:w-80"
        style={{ animation: 'avatarSway 7s ease-in-out infinite', transformOrigin: '50% 90%' }}
      >
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            boxShadow: `0 0 0 3px ${ringColor}${Math.round(glow * 255).toString(16).padStart(2, '0')}, 0 18px 50px rgba(0,0,0,0.5)`,
            animation: 'avatarBreathe 4.5s ease-in-out infinite',
          }}
        >
          {/* base photo — also defines the layout size */}
          <img
            src={AVATAR_IMAGE_URL}
            alt="AI interviewer"
            className="w-full block select-none"
            draggable={false}
            onError={() => setFailed(true)}
          />

          {/* jaw layer: same photo, clipped to the lower face, pushed down while speaking */}
          <img
            src={AVATAR_IMAGE_URL}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full block select-none"
            draggable={false}
            style={{
              clipPath: `inset(${MOUTH_LINE * 100}% ${JAW_SIDE_TRIM * 100}% 0% ${JAW_SIDE_TRIM * 100}%)`,
              transform: `translateY(${drop * 100}%) scaleY(${1 + drop * 1.6})`,
              transformOrigin: '50% 0%',
              transition: 'transform 60ms linear',
            }}
          />

          {/* mouth-cavity shadow: opens with amplitude */}
          <div
            className="absolute pointer-events-none"
            style={{
              left: '38%',
              top: `${MOUTH_LINE * 100 - 1}%`,
              width: '24%',
              height: `${4 + drop * 120}%`,
              background: 'radial-gradient(ellipse at center, rgba(40,10,15,0.85) 0%, rgba(40,10,15,0) 70%)',
              opacity: speaking ? Math.min(0.9, smooth * 1.2) : 0,
              borderRadius: '50%',
              filter: 'blur(1px)',
              transition: 'opacity 60ms linear, height 60ms linear',
            }}
          />

          {/* warm vignette so the framed photo blends into the dark room */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ boxShadow: 'inset 0 0 60px 10px rgba(0,0,0,0.35)' }}
          />
        </div>

        {/* listening pulse ring */}
        {state === 'listening' && (
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{ animation: 'avatarPulse 1.6s ease-in-out infinite', border: '2px solid #34d399' }}
          />
        )}
      </div>

      {/* thinking dots */}
      {state === 'thinking' && (
        <div className="absolute -top-2 right-4 bg-white rounded-full px-3 py-1 shadow flex gap-1">
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
          0%, 100% { transform: rotate(-1deg) translateY(0); }
          50% { transform: rotate(1deg) translateY(-3px); }
        }
        @keyframes avatarBreathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.012); }
        }
        @keyframes avatarPulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.04); opacity: 0.2; }
        }
      `}</style>
    </div>
  );
};

// Resolves the configured avatar. Video-based providers would be returned here
// when a key is configured (fetched from the backend, never hard-coded).
// Default is now the realistic PhotoAvatar (falls back to StylizedAvatar if the
// image can't be loaded).
export function getInterviewerAvatar(): InterviewerAvatarComponent {
  return PhotoAvatar;
}
