import "./globals.css";

export const metadata = {
  title: "VoiceTranslate – Real-time Vietnamese to English Speech Translator",
  description:
    "Real-time speech-to-text translation from Vietnamese to English. Powered by Web Speech API and Google Translate. Works in Chrome-based browsers.",
  keywords: [
    "speech to text",
    "Vietnamese translator",
    "real-time translation",
    "voice translator",
    "Web Speech API",
  ],
  authors: [{ name: "VoiceTranslate" }],
  openGraph: {
    title: "VoiceTranslate – Real-time Vietnamese to English Speech Translator",
    description:
      "Speak Vietnamese and see English translation appear in real-time.",
    type: "website",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050811",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
