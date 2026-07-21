import { NextRequest } from "next/server";

const mockLean = jest.fn();
const mockSelect = jest.fn(() => ({ lean: mockLean }));
const mockFindOne = jest.fn((_query?: unknown) => ({ select: mockSelect }));
const mockListFiles = jest.fn();
const mockGetFileDetails = jest.fn();

jest.mock("@/lib/db/connection", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/db/models/File", () => ({
  File: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
  },
}));

jest.mock("@/lib/imagekit", () => ({
  getImageKit: () => ({
    listFiles: mockListFiles,
    getFileDetails: mockGetFileDetails,
  }),
}));

import { handleMediaResolve } from "@/lib/media-response";

describe("media resolver legacy recovery", () => {
  const originalFetch = global.fetch;

  beforeAll(() => {
    global.__DTPS_SKIP_DB_CLEANUP__ = true;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.__dtpsMediaRecoveryCache = new Map();
  });

  afterAll(() => {
    global.fetch = originalFetch;
    global.__DTPS_SKIP_DB_CLEANUP__ = false;
  });

  it("recovers a missing local upload from its ImageKit File record", async () => {
    mockLean.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      filename: "recoverable.jpg",
      originalName: "Meal photo.jpg",
      mimeType: "image/jpeg",
      imageKitUrl: "https://ik.imagekit.io/dtps/messages/recoverable.webp",
    });
    global.fetch = jest.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/webp" },
      }),
    );

    const request = new NextRequest(
      "https://app.dtps.test/api/media/resolve?url=%2Fuploads%2Fmessages%2Frecoverable.jpg",
    );
    const response = await handleMediaResolve(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(global.fetch).toHaveBeenCalledWith(
      new URL("https://ik.imagekit.io/dtps/messages/recoverable.webp"),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("resolves canonical file ids directly without proxying back into DTPS", async () => {
    mockLean.mockResolvedValue({
      _id: "507f1f77bcf86cd799439014",
      filename: "meal-plan.pdf",
      originalName: "Meal plan.pdf",
      mimeType: "application/pdf",
      imageKitUrl: "https://ik.imagekit.io/dtps/messages/meal-plan.pdf",
    });
    global.fetch = jest.fn().mockResolvedValue(
      new Response(new Uint8Array([37, 80, 68, 70]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );

    const request = new NextRequest(
      "https://app.dtps.test/api/media/resolve?url=%2Fapi%2Ffiles%2F507f1f77bcf86cd799439014",
    );
    const response = await handleMediaResolve(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(mockFindOne).toHaveBeenCalledWith(expect.objectContaining({
      $or: expect.arrayContaining([{ _id: "507f1f77bcf86cd799439014" }]),
    }));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns the public ImageKit source used by native in-app viewers", async () => {
    mockLean.mockResolvedValue({
      _id: "507f1f77bcf86cd799439015",
      filename: "report.pdf",
      mimeType: "application/pdf",
      imageKitUrl: "https://ik.imagekit.io/dtps/messages/report.pdf",
    });

    const request = new NextRequest(
      "https://app.dtps.test/api/media/resolve?metadata=1&url=%2Fapi%2Ffiles%2F507f1f77bcf86cd799439015",
    );
    const response = await handleMediaResolve(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      available: true,
      publicUrl: "https://ik.imagekit.io/dtps/messages/report.pdf",
    });
  });
});
