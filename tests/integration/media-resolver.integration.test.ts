import {
  getDocumentViewerUrl,
  getMediaKind,
  getMediaProxyUrl,
  getMediaUrl,
  isViewableDocument,
  normalizeMediaUrl,
} from "@/lib/media";

describe("media resolver", () => {
  const origin = "https://app.dtps.test";

  it.each([
    ["uploads/messages/photo.jpg", `${origin}/uploads/messages/photo.jpg`],
    ["/public/uploads/reports/result.pdf", `${origin}/uploads/reports/result.pdf`],
    ["/srv/dtps/public/uploads/legacy/image.png", `${origin}/uploads/legacy/image.png`],
    ["http://localhost:3000/uploads/old/photo.jpg", `${origin}/uploads/old/photo.jpg`],
    ["http://192.168.1.10/api/files/507f1f77bcf86cd799439011", `${origin}/api/files/507f1f77bcf86cd799439011`],
    ["http://localhost:3000/api/reports/507f1f77bcf86cd799439011", `${origin}/api/reports/507f1f77bcf86cd799439011`],
  ])("normalizes legacy path %s", (input, expected) => {
    expect(normalizeMediaUrl(input, origin)).toBe(expected);
  });

  it("keeps external CDN URLs intact", () => {
    expect(normalizeMediaUrl("https://ik.imagekit.io/dtps/photo.webp", origin)).toBe(
      "https://ik.imagekit.io/dtps/photo.webp",
    );
  });

  it("keeps canonical DTPS media URLs intact for desktop recovery", () => {
    expect(normalizeMediaUrl("https://dtps.tech/uploads/messages/photo.jpg", origin)).toBe(
      "https://dtps.tech/uploads/messages/photo.jpg",
    );
  });

  it("reads legacy media object fields", () => {
    expect(getMediaUrl({ filePath: "/uploads/report.pdf" })).toBe("/uploads/report.pdf");
    expect(getMediaUrl({ imagePath: "/uploads/photo.jpg" })).toBe("/uploads/photo.jpg");
  });

  it("prefers a stable database file id over a transient storage URL", () => {
    expect(
      getMediaUrl({
        fileId: "507f1f77bcf86cd799439011",
        url: "/uploads/message/restart-sensitive.pdf",
      }),
    ).toBe("/api/files/507f1f77bcf86cd799439011");
  });

  it("detects media from MIME type or extension", () => {
    expect(getMediaKind("scan.pdf", "", "")).toBe("pdf");
    expect(getMediaKind("report.docx", "", "")).toBe("office");
    expect(getMediaKind("", "image/jpeg", "legacy-without-extension")).toBe("image");
  });

  it("opens PDFs and generic documents in the in-app viewer", () => {
    expect(isViewableDocument("report.pdf", "application/octet-stream")).toBe(true);
    expect(isViewableDocument("medical-report", "application/octet-stream")).toBe(true);
  });

  it("builds a DTPS viewer URL", () => {
    const viewerUrl = getDocumentViewerUrl("/uploads/report.pdf", "Blood report.pdf", "application/pdf");
    expect(viewerUrl).toContain("/viewer/document?");
    expect(viewerUrl).toContain("filename=Blood+report.pdf");
  });

  it("preserves a requested download filename", () => {
    const downloadUrl = getMediaProxyUrl("/uploads/report.pdf", {
      download: true,
      filename: "Blood report.pdf",
    });
    expect(downloadUrl).toContain("download=1");
    expect(downloadUrl).toContain("filename=Blood+report.pdf");
  });

  it("rejects executable and local-file schemes", () => {
    expect(normalizeMediaUrl("javascript:alert(1)", origin)).toBe("");
    expect(normalizeMediaUrl("file:///etc/passwd", origin)).toBe("");
    expect(normalizeMediaUrl("data:application/pdf,embedded", origin)).toBe("");
  });
});
