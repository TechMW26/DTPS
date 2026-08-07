import { NextRequest } from "next/server";

const handleUploadMock = jest.fn();
const getTokenMock = jest.fn();
const directUploadMock = jest.fn();

jest.mock("@vercel/blob/client", () => ({
  handleUpload: (...args: unknown[]) => handleUploadMock(...args),
  upload: (...args: unknown[]) => directUploadMock(...args),
}));

jest.mock("next-auth/jwt", () => ({
  getToken: (...args: unknown[]) => getTokenMock(...args),
}));

describe("client Blob upload resilience", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("issues a direct-upload token from the signed JWT without using MongoDB", async () => {
    getTokenMock.mockResolvedValue({ sub: "507f1f77bcf86cd799439011" });
    handleUploadMock.mockImplementation(async ({ onBeforeGenerateToken }) => {
      const tokenOptions = await onBeforeGenerateToken(
        "messages/voice.webm",
        JSON.stringify({
          uploadType: "message",
          originalName: "voice.webm",
          mimeType: "audio/webm",
          size: 128,
        }),
      );
      return { clientToken: "blob-client-token", tokenOptions };
    });

    const { POST } = await import("@/app/api/upload/client/route");
    const response = await POST(new NextRequest("http://localhost/api/upload/client", {
      method: "POST",
      body: JSON.stringify({ type: "blob.generate-client-token" }),
      headers: { "content-type": "application/json" },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(JSON.parse(body.tokenOptions.tokenPayload)).toMatchObject({
      userId: "507f1f77bcf86cd799439011",
      uploadType: "message",
    });
  });

  it("retries transient server and direct-upload failures", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ error: "temporarily unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }));
    directUploadMock
      .mockRejectedValueOnce(new Error("Failed to retrieve the client token"))
      .mockResolvedValueOnce({
        url: "https://test.public.blob.vercel-storage.com/messages/voice.webm",
        pathname: "messages/voice.webm",
      });

    const { uploadFileReliably } = await import("@/lib/client-upload");
    const file = new File([new Uint8Array([1, 2, 3])], "voice.webm", {
      type: "audio/webm",
    });
    const result = await uploadFileReliably(file, "message");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(directUploadMock).toHaveBeenCalledTimes(2);
    expect(result.url).toContain("blob.vercel-storage.com");
  });
});
