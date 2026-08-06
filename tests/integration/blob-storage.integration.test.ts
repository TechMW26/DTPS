jest.mock("server-only", () => ({}));

const put = jest.fn();
const del = jest.fn();

jest.mock("@vercel/blob", () => ({
  put: (...args: unknown[]) => put(...args),
  del: (...args: unknown[]) => del(...args),
  list: jest.fn(),
}));

jest.mock("@/lib/imageCompressionServer", () => ({
  compressImageServer: jest.fn(async (buffer: Buffer) => buffer),
  serverCompressionPresets: {},
}));

import {
  deleteFromBlob,
  deleteMultipleFromBlob,
  uploadToBlob,
} from "@/lib/storage/blob-storage";

describe("Vercel Blob storage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    put.mockResolvedValue({
      url: "https://test.public.blob.vercel-storage.com/messages/report.pdf",
      pathname: "messages/report.pdf",
    });
    del.mockResolvedValue(undefined);
  });

  it("uploads to the mapped folder and returns canonical metadata", async () => {
    const result = await uploadToBlob(Buffer.from("report"), {
      type: "message",
      filename: "report.pdf",
      contentType: "application/pdf",
      compress: false,
    });

    expect(put).toHaveBeenCalledWith(
      "messages/report.pdf",
      expect.any(Buffer),
      expect.objectContaining({ access: "public", contentType: "application/pdf" }),
    );
    expect(result).toMatchObject({
      pathname: "messages/report.pdf",
      filename: "report.pdf",
      contentType: "application/pdf",
    });
  });

  it("deletes one or many blob references", async () => {
    await deleteFromBlob("messages/report.pdf");
    await deleteMultipleFromBlob(["messages/a.pdf", "messages/b.pdf"]);

    expect(del).toHaveBeenNthCalledWith(1, "messages/report.pdf");
    expect(del).toHaveBeenNthCalledWith(2, ["messages/a.pdf", "messages/b.pdf"]);
  });
});
