import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/api';
import { SelfViewCamera } from '../components/SelfViewCamera';
import { useCameraStream } from '../hooks/useCameraStream';
import { useFacePresence } from '../hooks/useFacePresence';
import { defaultTts } from '../interview/providers/tts';
import { defaultStt } from '../interview/providers/stt';
import { getInterviewerAvatar, AvatarState } from '../interview/providers/avatar';

// Virtual face-to-face interview room: synthetic AI interviewer (lip-synced
// avatar + TTS), candidate voice via STT (typed fallback always available),
// shared self-view camera, live captions, and the unchanged scoring pipeline
// (/ai-interview endpoints from Phase 7).

interface Turn {
  order: number;
  role: 'INTERVIEWER' | 'CANDIDATE';
  content: string;
}

interface Interview {
  id: string;
  role: string;
  company: string | null;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  maxQuestions: number;
  turns: Turn[];
}

const Avatar = getInterviewerAvatar();

export const InterviewRoom: React.FC<{
  role: string;
  companyId?: string | null;
  onExit: () => void;
  onComplete: (interviewId: string) => void;
}> = ({ role, companyId, onExit, onComplete }) => {
  const [phase, setPhase] = useState<'consent' | 'room'>('consent');
  const [consentCam, setConsentCam] = useState(false);
  const [consentMic, setConsentMic] = useState(false);
  const [interview, setInterview] = useState<Interview | null>(null);
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const [amplitude, setAmplitude] = useState(0);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [micMode, setMicMode] = useState<'auto' | 'ptt' | 'off'>('auto');
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [typed, setTyped] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const proctorCounts = useRef<Record<string, number>>({
    FACE_NOT_DETECTED: 0,
    MULTIPLE_FACES: 0,
    NO_CAMERA: 0,
    faceChecks: 0,
  });
  const endingRef = useRef(false);
  const micModeRef = useRef(micMode);
  micModeRef.current = micMode;
  // read the latest interview without putting side effects in a state updater
  // (React StrictMode double-invokes updaters — a POST inside one fires twice)
  const interviewRef = useRef<Interview | null>(null);
  useEffect(() => {
    interviewRef.current = interview;
  }, [interview]);
  const submittingRef = useRef(false);

  // ---- shared camera (same stream as proctoring / self-view) ----
  const inRoom = phase === 'room';
  const { stream, status: cameraStatus } = useCameraStream(inRoom);
  const { faceStatus } = useFacePresence(stream, inRoom, (type) => {
    proctorCounts.current[type] = (proctorCounts.current[type] || 0) + 1;
  });
  useEffect(() => {
    if (inRoom && cameraStatus === 'denied') proctorCounts.current.NO_CAMERA += 1;
  }, [cameraStatus, inRoom]);

  // ---- timer ----
  useEffect(() => {
    if (!inRoom) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [inRoom]);

  // ---- speak an interviewer line (TTS + avatar lip-sync) ----
  const lastSpokenRef = useRef<string>('');
  const speak = useCallback((text: string, after?: () => void) => {
    lastSpokenRef.current = text;
    defaultTts.speak(text, {
      onStart: () => setAvatarState('speaking'),
      onAmplitude: setAmplitude,
      onEnd: () => {
        setAmplitude(0);
        setAvatarState('idle');
        after?.();
      },
    });
  }, []);

  const startListening = useCallback(() => {
    if (micModeRef.current === 'off' || !defaultStt.available()) return;
    defaultTts.stop(); // barge-in: candidate audio wins
    setListening(true);
    setAvatarState('listening');
    setInterim('');
    defaultStt.start({
      onInterim: setInterim,
      onFinal: (text) => submitAnswer(text),
      onEnd: () => {
        setListening(false);
        setAvatarState((s) => (s === 'listening' ? 'idle' : s));
      },
      onError: (message) => {
        setNotice(message);
        setListening(false);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- conversation loop ----
  const submitAnswer = useCallback(
    async (content: string) => {
      const iv = interviewRef.current;
      if (!content.trim() || endingRef.current || submittingRef.current || !iv) return;
      submittingRef.current = true;
      defaultStt.abort();
      setListening(false);
      setInterim('');
      setTyped('');
      setBusy(true);
      setAvatarState('thinking');
      setInterview((prev) =>
        prev
          ? { ...prev, turns: [...prev.turns, { order: prev.turns.length, role: 'CANDIDATE', content }] }
          : prev
      );
      try {
        const current = await apiClient.post<Interview>(`/ai-interview/${iv.id}/reply`, { content });
        setInterview(current);
        const last = current.turns[current.turns.length - 1];
        if (current.status !== 'IN_PROGRESS') {
          // closing message, then to the report
          speak(last?.role === 'INTERVIEWER' ? last.content : 'Thank you, the interview is complete.', () =>
            finishAndExit(current.id, false)
          );
        } else if (last?.role === 'INTERVIEWER') {
          speak(last.content, () => {
            if (micModeRef.current === 'auto') startListening();
          });
        }
      } catch {
        setNotice('Failed to send your answer — try again (or type it).');
        setAvatarState('idle');
      } finally {
        submittingRef.current = false;
        setBusy(false);
      }
    },
    [speak, startListening]
  );

  const finishAndExit = useCallback(
    async (interviewId: string, callFinish: boolean) => {
      if (endingRef.current) return;
      endingRef.current = true;
      defaultTts.stop();
      defaultStt.abort();
      try {
        await apiClient.post(`/ai-interview/${interviewId}/proctoring-summary`, {
          counts: proctorCounts.current,
        });
      } catch {
        /* signal only */
      }
      if (callFinish) {
        try {
          await apiClient.post(`/ai-interview/${interviewId}/finish`, {});
        } catch {
          /* report still loads whatever was scored */
        }
      }
      onComplete(interviewId);
    },
    [onComplete]
  );

  // ---- start the interview after consent ----
  const begin = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const iv = await apiClient.post<Interview>('/ai-interview/start', {
        role,
        ...(companyId ? { companyId } : {}),
      });
      setInterview(iv);
      setPhase('room');
      const first = iv.turns[iv.turns.length - 1];
      if (first?.role === 'INTERVIEWER') {
        // slight delay so the room paints before the avatar starts talking
        setTimeout(
          () =>
            speak(first.content, () => {
              if (micModeRef.current === 'auto') startListening();
            }),
          600
        );
      }
    } catch {
      setNotice('Could not start the interview — try again.');
    } finally {
      setBusy(false);
    }
  };

  // cleanup on unmount
  useEffect(
    () => () => {
      defaultTts.stop();
      defaultStt.abort();
    },
    []
  );

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const sttAvailable = defaultStt.available();

  // ================= consent =================
  if (phase === 'consent') {
    return (
      <div className="max-w-xl mx-auto bg-white p-8 rounded-2xl shadow-xl">
        <h1 className="text-2xl font-black mb-2">📹 Face-to-Face AI Interview</h1>
        <p className="text-sm text-gray-600 mb-4">
          Role: <b>{role}</b>. You'll talk to a <b>synthetic AI interviewer</b> (not a real person) in a
          video-call-style room. Your camera shows only to you as a self-view; face presence
          (never identity) is noted in your report as an informational signal.
        </p>
        <label className="flex items-start gap-3 mb-3 cursor-pointer text-sm">
          <input type="checkbox" checked={consentCam} onChange={(e) => setConsentCam(e.target.checked)} className="mt-1 h-5 w-5" />
          <span>I consent to <b>camera</b> use during this interview (self-view + face-presence signal).</span>
        </label>
        <label className="flex items-start gap-3 mb-4 cursor-pointer text-sm">
          <input type="checkbox" checked={consentMic} onChange={(e) => setConsentMic(e.target.checked)} className="mt-1 h-5 w-5" />
          <span>I consent to <b>microphone</b> use so I can answer by voice (transcripts are stored; raw audio is not).</span>
        </label>
        <p className="text-xs text-gray-400 mb-4">
          No camera or mic? You can still continue — denied devices fall back to a text-only interview.
          {!sttAvailable && ' (Voice input is not supported in this browser — answers will be typed.)'}
        </p>
        {notice && <div className="bg-red-100 text-red-700 p-3 rounded mb-3 text-sm">{notice}</div>}
        <div className="flex gap-3">
          <button onClick={onExit} className="flex-1 py-3 rounded-xl font-bold bg-gray-100 hover:bg-gray-200">Cancel</button>
          <button
            disabled={!consentCam || !consentMic || busy}
            onClick={begin}
            className="flex-1 py-3 rounded-xl font-black text-white bg-gradient-to-r from-indigo-500 to-purple-600 disabled:opacity-40"
          >
            {busy ? 'Connecting…' : 'Join Interview →'}
          </button>
        </div>
      </div>
    );
  }

  // ================= room =================
  const currentQuestion = [...(interview?.turns || [])].reverse().find((t) => t.role === 'INTERVIEWER');
  const questionsAsked = (interview?.turns || []).filter((t) => t.role === 'INTERVIEWER').length;

  return (
    <div className="fixed inset-0 z-40 bg-slate-950 flex flex-col">
      {/* top bar */}
      <div className="flex items-center justify-between px-5 py-3 text-white">
        <div className="font-black text-sm">
          🤖 {interview?.role}
          {interview?.company ? ` @ ${interview.company}` : ''} ·
          <span className="text-slate-400"> Q{Math.min(questionsAsked, interview?.maxQuestions || 6)}/{interview?.maxQuestions || 6}</span>
        </div>
        <span className="text-[10px] bg-indigo-600 px-2 py-1 rounded-full font-black uppercase">Synthetic AI interviewer</span>
        <div className="font-mono font-bold">{fmt(elapsed)}</div>
      </div>

      {/* stage */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        <div className="flex flex-col items-center">
          <Avatar state={busy ? 'thinking' : avatarState} amplitude={amplitude} />
          {captionsOn && avatarState === 'speaking' && lastSpokenRef.current && (
            <div className="max-w-xl mt-4 bg-black/60 text-white text-sm px-4 py-2 rounded-xl text-center">
              {lastSpokenRef.current}
            </div>
          )}
          {captionsOn && listening && (
            <div className="max-w-xl mt-4 bg-emerald-900/70 text-emerald-100 text-sm px-4 py-2 rounded-xl text-center italic">
              🎙 {interim || 'Listening… speak your answer'}
            </div>
          )}
        </div>

        {/* transcript side panel */}
        {showTranscript && (
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-slate-900/95 text-white p-4 overflow-y-auto">
            <h2 className="font-black text-sm mb-3">Transcript</h2>
            {(interview?.turns || []).map((t) => (
              <div key={t.order} className={`text-xs mb-2 p-2 rounded ${t.role === 'CANDIDATE' ? 'bg-indigo-900/60' : 'bg-slate-800'}`}>
                <b>{t.role === 'CANDIDATE' ? 'You' : 'Interviewer'}:</b> {t.content}
              </div>
            ))}
          </div>
        )}

        <SelfViewCamera active={inRoom} proctoring={true} faceStatus={faceStatus} />
      </div>

      {notice && (
        <div className="mx-auto mb-2 bg-amber-500 text-white text-sm font-bold px-4 py-2 rounded-full">
          {notice} <button onClick={() => setNotice(null)} className="ml-2">✕</button>
        </div>
      )}

      {/* current question + typed fallback */}
      <div className="px-5 pb-2 max-w-3xl w-full mx-auto">
        {currentQuestion && (
          <div className="text-slate-300 text-xs mb-2 text-center">
            <b>Current question:</b> {currentQuestion.content.slice(0, 220)}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && typed.trim()) submitAnswer(typed); }}
            placeholder={sttAvailable && micMode !== 'off' ? 'Or type your answer…' : 'Type your answer…'}
            className="flex-1 bg-slate-800 text-white rounded-xl px-4 py-2 text-sm"
            disabled={busy}
          />
          <button
            onClick={() => typed.trim() && submitAnswer(typed)}
            disabled={busy || !typed.trim()}
            className="px-4 rounded-xl font-black text-white bg-indigo-600 disabled:opacity-40"
          >
            ➤
          </button>
        </div>
      </div>

      {/* bottom bar */}
      <div className="flex items-center justify-center gap-3 px-5 py-4 bg-slate-900">
        {sttAvailable && (
          <>
            <button
              onClick={() => setMicMode((m) => (m === 'off' ? 'auto' : 'off'))}
              className={`px-4 py-2 rounded-full font-bold text-sm ${micMode === 'off' ? 'bg-red-600 text-white' : 'bg-slate-700 text-white'}`}
              title="Toggle microphone"
            >
              {micMode === 'off' ? '🔇 Mic off' : '🎙 Mic on'}
            </button>
            <button
              onClick={() => setMicMode((m) => (m === 'ptt' ? 'auto' : 'ptt'))}
              disabled={micMode === 'off'}
              className={`px-4 py-2 rounded-full font-bold text-sm disabled:opacity-40 ${micMode === 'ptt' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-white'}`}
              title="Push-to-talk: hold the talk button to speak"
            >
              ✋ PTT {micMode === 'ptt' ? 'on' : 'off'}
            </button>
            {micMode === 'ptt' ? (
              <button
                onPointerDown={() => startListening()}
                onPointerUp={() => defaultStt.stop()}
                className={`px-6 py-2 rounded-full font-black text-sm ${listening ? 'bg-emerald-500 text-white' : 'bg-white text-slate-900'}`}
              >
                {listening ? '● Recording…' : 'Hold to talk'}
              </button>
            ) : (
              micMode === 'auto' && !listening && !busy && avatarState !== 'speaking' && (
                <button onClick={startListening} className="px-6 py-2 rounded-full font-black text-sm bg-white text-slate-900">
                  🎙 Answer by voice
                </button>
              )
            )}
            {listening && micMode !== 'ptt' && (
              <button onClick={() => defaultStt.stop()} className="px-4 py-2 rounded-full font-bold text-sm bg-emerald-600 text-white">
                ✔ Done speaking
              </button>
            )}
          </>
        )}
        <button
          onClick={() => setCaptionsOn((c) => !c)}
          className={`px-4 py-2 rounded-full font-bold text-sm ${captionsOn ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400'}`}
        >
          💬 CC
        </button>
        <button
          onClick={() => setShowTranscript((s) => !s)}
          className="px-4 py-2 rounded-full font-bold text-sm bg-slate-700 text-white"
        >
          📜
        </button>
        <button
          onClick={() => interview && finishAndExit(interview.id, true)}
          className="px-5 py-2 rounded-full font-black text-sm bg-red-600 text-white"
        >
          📵 End & get report
        </button>
      </div>
    </div>
  );
};
