const VOICE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;

export function getPreferredVoiceMimeType(
  isSupported: (mimeType: string) => boolean,
): string | undefined {
  return VOICE_MIME_TYPES.find(isSupported);
}

export function normalizeVoiceMimeType(mimeType: string): string {
  return (mimeType || "audio/webm").split(";", 1)[0].trim().toLowerCase();
}

export function getVoiceFileExtension(mimeType: string): string {
  const normalized = normalizeVoiceMimeType(mimeType);
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  if (normalized.includes("ogg") || normalized.includes("opus")) return "ogg";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("3gpp")) return "3gpp";
  return "webm";
}
