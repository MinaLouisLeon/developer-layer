import { useEffect, useState } from "react";

import type { Capability } from "@developer-layer/shared";

import { onVoice, voice, voiceCapability, type VoiceState } from "./ipc";

const PHASE_LABEL: Record<VoiceState["phase"], string> = {
  off: "Voice is off",
  idle: "Hold the voice key to speak",
  listening: "Listening…",
  thinking: "Working out what you said…",
  asking: "",
  speaking: "",
};

/**
 * The voice strip along the bottom of the command bar.
 *
 * Everything it shows is pushed from Rust — the phase, the transcript, the
 * question. It decides nothing about the conversation; the one thing it owns
 * is the pair of buttons for answering, because a spoken confirmation the user
 * cannot also click would be unanswerable with a broken microphone.
 */
export function Voice() {
  const [state, setState] = useState<VoiceState>({ phase: "off", message: null });
  const [capability, setCapability] = useState<Capability | null>(null);

  useEffect(() => {
    voiceCapability().then(setCapability).catch(() => setCapability(null));
    const unlisten = onVoice(setState);
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  // Nothing at all until the backend has answered. A strip that says "voice is
  // off" for one frame and then contradicts itself is worse than a late one.
  if (!capability) return null;

  if (!capability.usable) {
    return (
      <div className="atlas__voice atlas__voice--muted">
        {/* The reason, not merely the fact. "Voice unavailable" sends the user
            hunting through settings; the remedy sends them to the fix. */}
        <span>{capability.missing[0]?.remedy ?? "Voice is unavailable."}</span>
      </div>
    );
  }

  if (state.phase === "asking") {
    return (
      <div className="atlas__voice atlas__voice--asking" role="alertdialog" aria-live="assertive">
        <span className="atlas__voice-text">{state.message}</span>
        <div className="atlas__voice-answers">
          {/* Cancel is first and focused: the only thing that asks is the one
              thing that cannot be undone. */}
          <button type="button" autoFocus onClick={() => void voice("no")}>
            No
          </button>
          <button type="button" onClick={() => void voice("yes")}>
            Yes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`atlas__voice atlas__voice--${state.phase}`} aria-live="polite">
      <span className={`atlas__voice-dot atlas__voice-dot--${state.phase}`} aria-hidden="true" />
      <span className="atlas__voice-text">
        {state.message ?? PHASE_LABEL[state.phase]}
      </span>
    </div>
  );
}
