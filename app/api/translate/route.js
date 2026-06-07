import { translate } from "@vitalets/google-translate-api";
import { NextResponse } from "next/server";

const LIBRE_TRANSLATE_URL = "https://libretranslate.com/translate";
const TIMEOUT_MS = 8000;

/**
 * Wraps a promise with a timeout.
 */
function withTimeout(promise, ms) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

/**
 * Primary: Google Translate via @vitalets/google-translate-api
 */
async function translateWithGoogle(text, from, to) {
  const result = await withTimeout(translate(text, { from, to }), TIMEOUT_MS);
  return result.text;
}

/**
 * Fallback: LibreTranslate public API
 */
async function translateWithLibre(text, from, to) {
  const response = await withTimeout(
    fetch(LIBRE_TRANSLATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        source: from,
        target: to,
        format: "text",
      }),
    }),
    TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(
      `LibreTranslate responded with status ${response.status}: ${response.statusText}`
    );
  }

  const data = await response.json();
  if (!data.translatedText) {
    throw new Error("LibreTranslate returned an empty translation.");
  }
  return data.translatedText;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { text, from = "vi", to = "en" } = body;

    if (!text || typeof text !== "string" || text.trim() === "") {
      return NextResponse.json(
        { error: "Invalid request: 'text' field is required and must be a non-empty string." },
        { status: 400 }
      );
    }

    const trimmedText = text.trim();

    // ── Primary: Google Translate ─────────────────────────────────────────
    try {
      const translatedText = await translateWithGoogle(trimmedText, from, to);
      return NextResponse.json({
        translatedText,
        source: "google",
      });
    } catch (googleError) {
      console.warn(
        "[translate/route] Google Translate failed, falling back to LibreTranslate.",
        googleError.message
      );
    }

    // ── Fallback: LibreTranslate ──────────────────────────────────────────
    try {
      const translatedText = await translateWithLibre(trimmedText, from, to);
      return NextResponse.json({
        translatedText,
        source: "libre",
      });
    } catch (libreError) {
      console.error(
        "[translate/route] LibreTranslate fallback also failed.",
        libreError.message
      );
      return NextResponse.json(
        {
          error:
            "All translation services are unavailable. Please try again later.",
          details: libreError.message,
        },
        { status: 503 }
      );
    }
  } catch (err) {
    console.error("[translate/route] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error.", details: err.message },
      { status: 500 }
    );
  }
}
