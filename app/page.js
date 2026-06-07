"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import useSpeechRecognition from "../hooks/useSpeechRecognition";

// ── Language definitions ──────────────────────────────────────────────────────
const LANGUAGES = [
  { code: "vi", bcp47: "vi-VN", name: "Tiếng Việt", flag: "🇻🇳", short: "VI" },
  { code: "en", bcp47: "en-US", name: "English",    flag: "🇬🇧", short: "EN" },
  { code: "zh", bcp47: "zh-CN", name: "中文",        flag: "🇨🇳", short: "ZH" },
  { code: "ja", bcp47: "ja-JP", name: "日本語",      flag: "🇯🇵", short: "JA" },
  { code: "ko", bcp47: "ko-KR", name: "한국어",      flag: "🇰🇷", short: "KO" },
  { code: "fr", bcp47: "fr-FR", name: "Français",   flag: "🇫🇷", short: "FR" },
  { code: "de", bcp47: "de-DE", name: "Deutsch",    flag: "🇩🇪", short: "DE" },
  { code: "es", bcp47: "es-ES", name: "Español",    flag: "🇪🇸", short: "ES" },
  { code: "th", bcp47: "th-TH", name: "ภาษาไทย",   flag: "🇹🇭", short: "TH" },
  { code: "id", bcp47: "id-ID", name: "Indonesia",  flag: "🇮🇩", short: "ID" },
];

function getLang(code) {
  return LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
}

// ── Debounce helper ───────────────────────────────────────────────────────────
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// ── Wave bars ─────────────────────────────────────────────────────────────────
function WaveBars() {
  return (
    <div className="wave-bars" aria-hidden="true">
      {[4, 10, 18, 24, 18, 10, 4].map((h, i) => (
        <div key={i} className="wave-bar" style={{ height: `${h}px` }} />
      ))}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading…" />;
}

// ── Language selector dropdown ────────────────────────────────────────────────
function LangSelect({ value, onChange, excludeCode, id }) {
  return (
    <select
      id={id}
      className="lang-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Select language"
    >
      {LANGUAGES.filter((l) => l.code !== excludeCode).map((l) => (
        <option key={l.code} value={l.code}>
          {l.flag} {l.name}
        </option>
      ))}
    </select>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function Home() {
  // ── Language pair state ─────────────────────────────────────────────────
  const [srcCode, setSrcCode] = useState("vi");
  const [tgtCode, setTgtCode] = useState("en");
  const [isSwapping, setIsSwapping] = useState(false);

  const srcLang = getLang(srcCode);
  const tgtLang = getLang(tgtCode);

  // ── Speech recognition (re-initialises automatically when lang changes) ─
  const {
    isSupported,
    isListening,
    interimTranscript,
    finalTranscript,
    error: speechError,
    isSafari,
    start,
    stop,
    reset,
  } = useSpeechRecognition({ lang: srcLang.bcp47 });

  // ── Translation state ───────────────────────────────────────────────────
  const [translatedText, setTranslatedText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState(null);
  const [translationSource, setTranslationSource] = useState(null);

  // Combine final + interim so translation fires while user is still speaking.
  // Debounce 700ms: short enough to feel real-time, long enough to skip
  // every keystroke and avoid API hammering during fast speech.
  const liveText = [finalTranscript, interimTranscript].filter(Boolean).join(" ").trim();
  const debouncedLiveText = useDebounce(liveText, 700);
  const abortRef = useRef(null);

  // ── SSR guard ───────────────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ── Translate in real-time as user speaks ──────────────────────────────
  useEffect(() => {
    if (!debouncedLiveText) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const doTranslate = async () => {
      setIsTranslating(true);
      setTranslationError(null);
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: debouncedLiveText, from: srcCode, to: tgtCode }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Server error: ${res.status}`);
        setTranslatedText(data.translatedText);
        setTranslationSource(data.source);
      } catch (err) {
        if (err.name === "AbortError") return;
        setTranslationError(err.message || "Translation failed. Please try again.");
      } finally {
        setIsTranslating(false);
      }
    };

    doTranslate();
    return () => controller.abort();
  }, [debouncedLiveText, srcCode, tgtCode]);

  // ── Swap languages ──────────────────────────────────────────────────────
  const handleSwap = useCallback(() => {
    if (isListening) stop();
    if (abortRef.current) abortRef.current.abort();

    setIsSwapping(true);
    setTimeout(() => setIsSwapping(false), 450);

    setSrcCode(tgtCode);
    setTgtCode(srcCode);

    // Move translated text to source side so it can be re-translated
    const prevTranslated = translatedText;
    reset();
    setTranslatedText("");
    setTranslationError(null);
    setTranslationSource(null);

    // After state settles, put translated content as new source transcript
    // (handled by the reset; user can speak again in the new source language)
    void prevTranslated;
  }, [isListening, stop, srcCode, tgtCode, translatedText, reset]);

  // ── Change source language ──────────────────────────────────────────────
  const handleSrcChange = useCallback((code) => {
    if (isListening) stop();
    setSrcCode(code);
    reset();
    setTranslatedText("");
    setTranslationError(null);
    setTranslationSource(null);
  }, [isListening, stop, reset]);

  // ── Change target language ──────────────────────────────────────────────
  const handleTgtChange = useCallback((code) => {
    if (abortRef.current) abortRef.current.abort();
    setTgtCode(code);
    setTranslatedText("");
    setTranslationError(null);
    setTranslationSource(null);
  }, []);

  // ── Toggle mic ──────────────────────────────────────────────────────────
  const toggleRecording = useCallback(() => {
    if (isListening) stop();
    else start();
  }, [isListening, start, stop]);

  // ── Clear all ───────────────────────────────────────────────────────────
  const clearAll = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    reset();
    setTranslatedText("");
    setTranslationError(null);
    setTranslationSource(null);
    setIsTranslating(false);
  }, [reset]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const micState = speechError ? "error" : isListening ? "recording" : "idle";
  const hasSourceText = finalTranscript || interimTranscript;
  const charCount = (finalTranscript + interimTranscript).length;

  if (!mounted) return null;

  // ── Unsupported browser ─────────────────────────────────────────────────
  if (!isSupported) {
    return (
      <div className="app-wrapper">
        <header className="app-header">
          <div className="header-logo">
            <div className="logo-icon">🎙️</div>
            <span className="logo-text">VoiceTranslate</span>
          </div>
        </header>
        <main className="app-main">
          <div className="unsupported-state">
            <div className="unsupported-icon">🚫</div>
            <h1 className="unsupported-title">Browser Not Supported</h1>
            <p className="unsupported-desc">
              The Web Speech API is not available in your browser. Please use
              Google Chrome, Microsoft Edge, or Safari 14.1+ to use this app.
            </p>
            <div className="unsupported-badge">
              <span>🌐</span>
              <span>Supported: Chrome · Edge · Safari 14.1+</span>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <header className="app-header">
        <div className="header-logo">
          <div className="logo-icon" aria-hidden="true">🎙️</div>
          <span className="logo-text">VoiceTranslate</span>
        </div>
        <div className="header-badge" role="note">
          <div className="badge-dot" />
          {isSafari ? "Safari · limited support" : "Best on Chrome / Edge"}
        </div>
      </header>

      {/* ══ MAIN ════════════════════════════════════════════════════════════ */}
      <main className="app-main">

        {/* ── Status bar ─────────────────────────────────────────────────── */}
        <StatusBar
          isListening={isListening}
          isTranslating={isTranslating}
          speechError={speechError}
          translationError={translationError}
          hasText={!!hasSourceText}
          srcLang={srcLang}
          tgtLang={tgtLang}
        />

        {/* ── Browser notice ─────────────────────────────────────────────────── */}
        {isSafari ? (
          <div className="chrome-notice safari-notice" role="note">
            <span>🧭</span>
            <span>
              <strong>Safari detected:</strong> Mic auto-restarts after each phrase.
              Interim (realtime) text may be limited. For best results, use{" "}
              <strong>Chrome</strong>.
            </span>
          </div>
        ) : (
          <div className="chrome-notice" role="note">
            <span>⚠️</span>
            <span>
              <strong>Note:</strong> Web Speech API is only supported in{" "}
              <strong>Chrome, Edge, or Safari 14.1+</strong>.
            </span>
          </div>
        )}

        {/* ── Translation panels ──────────────────────────────────────────── */}
        <div
          className="panels-container"
          role="region"
          aria-label="Translation workspace"
        >
          {/* ── Source panel ─────────────────────────────────────────────── */}
          <section
            className={`panel source-panel ${isListening ? "is-active" : ""}`}
            aria-label="Speech input"
          >
            {/* Panel header with lang selector */}
            <div className="panel-header">
              <div className="panel-label">
                <span className="panel-lang-flag" aria-hidden="true">
                  {srcLang.flag}
                </span>
                <div className="panel-lang-info">
                  <LangSelect
                    id="src-lang-select"
                    value={srcCode}
                    onChange={handleSrcChange}
                    excludeCode={tgtCode}
                  />
                  <span className="panel-lang-code">Input · Speech</span>
                </div>
              </div>
              <div className="panel-tag speech-tag">
                <div className="tag-dot" />
                Speech
              </div>
            </div>

            <hr className="panel-divider" />

            <div
              className="transcript-area"
              aria-live="polite"
              aria-atomic="false"
            >
              {!hasSourceText ? (
                <p className="transcript-placeholder">
                  {isListening
                    ? `Listening… speak in ${srcLang.name} 🎤`
                    : `Press the microphone button and speak in ${srcLang.name}…`}
                </p>
              ) : (
                <>
                  {finalTranscript && (
                    <p className="transcript-final">{finalTranscript}</p>
                  )}
                  {interimTranscript && (
                    <p className="transcript-interim">{interimTranscript}</p>
                  )}
                </>
              )}
            </div>

            <div className="panel-footer">
              <span className="char-count">{charCount} chars</span>
              {hasSourceText && (
                <button
                  id="clear-source-btn"
                  className="clear-btn"
                  onClick={clearAll}
                  title="Clear all text"
                >
                  🗑 Clear
                </button>
              )}
            </div>
          </section>

          {/* ── Swap button (centre) ──────────────────────────────────────── */}
          <div className="swap-col">
            <button
              id="swap-lang-btn"
              className={`swap-btn ${isSwapping ? "is-swapping" : ""}`}
              onClick={handleSwap}
              title={`Swap: ${srcLang.name} ↔ ${tgtLang.name}`}
              aria-label={`Swap languages: currently ${srcLang.name} to ${tgtLang.name}`}
            >
              <span className="swap-icon" aria-hidden="true">⇄</span>
            </button>
            <span className="swap-hint">Swap</span>
          </div>

          {/* ── Target panel ─────────────────────────────────────────────── */}
          <section
            className={`panel target-panel ${isTranslating ? "is-translating" : ""}`}
            aria-label="Translation output"
          >
            <div className="panel-header">
              <div className="panel-label">
                <span className="panel-lang-flag" aria-hidden="true">
                  {tgtLang.flag}
                </span>
                <div className="panel-lang-info">
                  <LangSelect
                    id="tgt-lang-select"
                    value={tgtCode}
                    onChange={handleTgtChange}
                    excludeCode={srcCode}
                  />
                  <span className="panel-lang-code">Output · Translation</span>
                </div>
              </div>
              <div className="panel-tag translation-tag">
                <div className="tag-dot" />
                Translation
              </div>
            </div>

            <hr className="panel-divider" />

            <div
              className="transcript-area"
              aria-live="polite"
              aria-atomic="true"
            >
              {isTranslating ? (
                <div className="translation-loading" role="status">
                  <Spinner />
                  <span>Translating…</span>
                </div>
              ) : translationError ? (
                <div className="translation-error" role="alert">
                  <span className="error-icon">⚠️</span>
                  <span>{translationError}</span>
                </div>
              ) : translatedText ? (
                <p className="translation-text">{translatedText}</p>
              ) : (
                <p className="transcript-placeholder">
                  Translation will appear here once you speak…
                </p>
              )}
            </div>

            <div className="panel-footer">
              <span className="char-count">{translatedText.length} chars</span>
              {translationSource && (
                <span className="translation-source-badge">
                  via{" "}
                  {translationSource === "google"
                    ? "Google Translate"
                    : "LibreTranslate"}
                </span>
              )}
            </div>
          </section>
        </div>

        {/* ── Microphone section ──────────────────────────────────────────── */}
        <div
          className={`mic-section ${isListening ? "is-recording" : ""}`}
          role="region"
          aria-label="Microphone controls"
        >
          <div
            className={`mic-button-wrapper ${isListening ? "is-recording" : ""}`}
          >
            <div className="pulse-ring pulse-ring-1" aria-hidden="true" />
            <div className="pulse-ring pulse-ring-2" aria-hidden="true" />
            <div className="pulse-ring pulse-ring-3" aria-hidden="true" />

            <button
              id="mic-toggle-btn"
              className={`mic-button ${micState}`}
              onClick={toggleRecording}
              aria-label={isListening ? "Stop recording" : "Start recording"}
              aria-pressed={isListening}
              title={isListening ? "Click to stop" : "Click to start speaking"}
            >
              {micState === "error" ? "🚫" : isListening ? "⏹️" : "🎙️"}
            </button>
          </div>

          {/* Wave bars */}
          <div
            className={`mic-button-wrapper ${isListening ? "is-recording" : ""}`}
            style={{ marginTop: "-8px" }}
          >
            <WaveBars />
          </div>

          {/* Label */}
          <div className={`mic-label ${isListening ? "is-recording" : ""}`}>
            <span className="mic-label-text">
              {micState === "error"
                ? "Permission Denied"
                : isListening
                ? "Recording…"
                : "Click to Speak"}
            </span>
            {!speechError && (
              <span className="mic-hint">
                {isListening
                  ? `Speak clearly in ${srcLang.name}`
                  : `${srcLang.name} → ${tgtLang.name} · Real-time`}
              </span>
            )}
            {speechError && (
              <span
                className="mic-hint"
                style={{ color: "var(--clr-text-error)" }}
              >
                {speechError}
              </span>
            )}
          </div>
        </div>
      </main>

      {/* ══ FOOTER ══════════════════════════════════════════════════════════ */}
      <footer className="app-footer">
        <div className="footer-note">
          <span>🎙️</span>
          <span>VoiceTranslate — Real-time Speech Translation</span>
        </div>
        <div className="footer-links">
          <span>Powered by Web Speech API + Google Translate</span>
        </div>
      </footer>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  STATUS BAR
// ══════════════════════════════════════════════════════════════════════════════
function StatusBar({
  isListening,
  isTranslating,
  speechError,
  translationError,
  hasText,
  srcLang,
  tgtLang,
}) {
  let state = "idle";
  let icon = "💤";
  let message = `Ready · ${srcLang.name} → ${tgtLang.name}. Press the microphone to begin.`;

  if (speechError) {
    state = "error"; icon = "🚫";
    message = "Microphone error. Check permissions and try again.";
  } else if (translationError) {
    state = "error"; icon = "⚠️";
    message = "Translation service error. Will retry on next speech input.";
  } else if (isListening && isTranslating) {
    state = "recording"; icon = "🔄";
    message = "Recording and translating simultaneously…";
  } else if (isListening) {
    state = "recording"; icon = "🎙️";
    message = `Listening… Speak clearly in ${srcLang.name}.`;
  } else if (isTranslating) {
    state = "recording"; icon = "🔄";
    message = "Translating your speech…";
  } else if (hasText) {
    state = "success"; icon = "✅";
    message = `Translated: ${srcLang.name} → ${tgtLang.name}. Press microphone to continue.`;
  }

  return (
    <div className={`status-bar ${state}`} role="status" aria-live="polite">
      <span className="status-icon" aria-hidden="true">{icon}</span>
      <span>{message}</span>
    </div>
  );
}
