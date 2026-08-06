import {
  getPreferredVoiceMimeType,
  getVoiceFileExtension,
  normalizeVoiceMimeType,
} from "@/lib/voice-recording";

describe("voice recording format selection", () => {
  it("prefers Opus WebM when the browser supports it", () => {
    expect(
      getPreferredVoiceMimeType((mimeType) =>
        ["audio/webm;codecs=opus", "audio/webm"].includes(mimeType),
      ),
    ).toBe("audio/webm;codecs=opus");
  });

  it("falls back to Safari-compatible MP4 audio", () => {
    expect(
      getPreferredVoiceMimeType((mimeType) => mimeType === "audio/mp4"),
    ).toBe("audio/mp4");
    expect(getVoiceFileExtension("audio/mp4")).toBe("m4a");
  });

  it("keeps file extensions aligned with normalized content types", () => {
    expect(normalizeVoiceMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(getVoiceFileExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(getVoiceFileExtension("audio/ogg;codecs=opus")).toBe("ogg");
  });
});
