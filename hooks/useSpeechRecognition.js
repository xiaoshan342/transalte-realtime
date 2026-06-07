"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/**
 * useSpeechRecognition
 *
 * Client-side hook wrapping the Web Speech API.
 * Handles both Chrome (continuous mode) and Safari (auto-restart workaround).
 *
 * @param {object}  options
 * @param {string}  options.lang           - BCP-47 tag, default "vi-VN"
 * @param {boolean} options.interimResults - Return partial results, default true
 */
export default function useSpeechRecognition({
  lang = "vi-VN",
  interimResults = true,
} = {}) {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [error, setError] = useState(null);
  const [isSafari, setIsSafari] = useState(false);

  // Refs so event handlers always see current values without re-registering
  const recognitionRef = useRef(null);
  const wantListeningRef = useRef(false); // user intent — true while "recording"
  const langRef = useRef(lang);
  langRef.current = lang;

  // ── Detect browser & build recognition instance ─────────────────────────
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }
    setIsSupported(true);

    // Detect Safari (webkitSpeechRecognition without native SpeechRecognition)
    const safari =
      !window.SpeechRecognition && !!window.webkitSpeechRecognition;
    setIsSafari(safari);

    const buildRecognition = () => {
      const r = new SpeechRecognition();
      r.lang = langRef.current;
      r.interimResults = interimResults;

      // Safari ignores `continuous: true`, so we use auto-restart instead.
      // Chrome works fine with continuous mode.
      r.continuous = !safari;

      // ── Handlers ──────────────────────────────────────────────────────
      r.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      r.onend = () => {
        // Safari / some Chrome scenarios: recognition stopped by browser.
        // If user still wants to listen, restart immediately.
        if (wantListeningRef.current) {
          try {
            // Rebuild with the latest lang in case it changed
            recognitionRef.current.lang = langRef.current;
            recognitionRef.current.start();
          } catch {
            // InvalidStateError: already started — safe to ignore
          }
        } else {
          setIsListening(false);
          setInterimTranscript(""); // clear any hanging interim on manual stop
        }
      };

      r.onerror = (event) => {
        // "aborted" fires when we call .abort() ourselves — not a real error
        if (event.error === "aborted") return;

        // "no-speech" on Safari is common & non-fatal; restart silently
        if (event.error === "no-speech" && wantListeningRef.current) return;

        wantListeningRef.current = false;
        setIsListening(false);

        const errorMessages = {
          "not-allowed":
            "Microphone access was denied. Please allow microphone permission in your browser settings and try again.",
          "no-speech":
            "No speech was detected. Please speak clearly into your microphone.",
          "audio-capture":
            "No microphone was found. Please connect a microphone and try again.",
          network:
            "A network error occurred during speech recognition. Please check your connection.",
          "service-not-allowed":
            "Speech recognition service is not allowed. Make sure you are on HTTPS or localhost.",
          "language-not-supported":
            "The selected language is not supported by this browser.",
        };

        setError(
          errorMessages[event.error] ||
            `Speech recognition error: ${event.error}`
        );
      };

      r.onresult = (event) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += t;
          } else {
            interim += t;
          }
        }

        if (final) {
          setFinalTranscript((prev) =>
            prev ? prev + " " + final.trim() : final.trim()
          );
        }
        setInterimTranscript(interim);
      };

      return r;
    };

    const recognition = buildRecognition();
    recognitionRef.current = recognition;

    return () => {
      wantListeningRef.current = false;
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.abort();
    };
  }, [interimResults]); // rebuild only when interimResults changes

  // ── Update lang on the existing instance without rebuilding ─────────────
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = lang;
    }
  }, [lang]);

  // ── Controls ─────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    if (!recognitionRef.current || wantListeningRef.current) return;
    setError(null);
    wantListeningRef.current = true;
    recognitionRef.current.lang = langRef.current; // always use latest lang
    try {
      recognitionRef.current.start();
    } catch (err) {
      if (err.name !== "InvalidStateError") {
        wantListeningRef.current = false;
        setError(`Could not start recognition: ${err.message}`);
      }
    }
  }, []);

  const stop = useCallback(() => {
    wantListeningRef.current = false; // prevent auto-restart
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    setInterimTranscript("");
    setFinalTranscript("");
    setError(null);
  }, []);

  return {
    isSupported,
    isListening,
    interimTranscript,
    finalTranscript,
    error,
    isSafari,
    start,
    stop,
    reset,
  };
}
