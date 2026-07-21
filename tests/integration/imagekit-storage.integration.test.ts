jest.mock("server-only", () => ({}));

const deleteFile = jest.fn();
const listFiles = jest.fn();

jest.mock("@/lib/imagekit", () => ({
  getImageKit: () => ({ deleteFile, listFiles }),
}));

import {
  deleteImageKitAsset,
  deleteImageKitAssets,
  imageKitFilePathFromUrl,
} from "@/lib/imagekit-storage";

describe("ImageKit storage cleanup", () => {
  beforeEach(() => {
    process.env.IMAGEKIT_URL_ENDPOINT = "https://ik.imagekit.io/dtps";
    deleteFile.mockResolvedValue(undefined);
    listFiles.mockResolvedValue([]);
  });

  it("extracts original paths from transformed account URLs only", () => {
    expect(
      imageKitFilePathFromUrl(
        "https://ik.imagekit.io/dtps/tr:w-600,h-400/blogs/meal%20plan.jpg",
      ),
    ).toBe("/blogs/meal plan.jpg");
    expect(
      imageKitFilePathFromUrl("https://example.com/dtps/blogs/image.jpg"),
    ).toBeNull();
  });

  it("uses durable file IDs without a lookup", async () => {
    await expect(deleteImageKitAsset({ fileId: "file-1" })).resolves.toBe(true);
    expect(deleteFile).toHaveBeenCalledWith("file-1");
    expect(listFiles).not.toHaveBeenCalled();
  });

  it("recovers historical file IDs from exact ImageKit URLs", async () => {
    listFiles.mockResolvedValue([
      { fileId: "wrong", filePath: "/other/report.pdf" },
      { fileId: "right", filePath: "/documents/report.pdf" },
    ]);

    await deleteImageKitAsset({
      url: "https://ik.imagekit.io/dtps/documents/report.pdf",
    });
    expect(deleteFile).toHaveBeenCalledWith("right");
  });

  it("deduplicates batch deletion and treats already-missing files as success", async () => {
    deleteFile.mockRejectedValueOnce({ statusCode: 404, message: "Not found" });
    await expect(
      deleteImageKitAssets([{ fileId: "same" }, { fileId: "same" }]),
    ).resolves.toBeUndefined();
    expect(deleteFile).toHaveBeenCalledTimes(1);
  });
});
