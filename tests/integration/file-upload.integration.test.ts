/**
 * Integration tests for file upload functionality
 * Tests the upload API for various file types and error handling
 */

import { UserRole } from '@/types';
import {
    createUser,
    ensureDatabaseConnection,
} from '../utils/database';
import { getServerSession } from 'next-auth';
import { NextRequest } from 'next/server';
import { getImageKit } from '@/lib/imagekit';

// Mock next-auth
jest.mock('next-auth', () => ({
    getServerSession: jest.fn(),
}));

const mockImageKitUpload = jest.fn().mockImplementation(
    async (options: { file: Buffer; fileName: string; folder: string }) => ({
        url: `https://ik.imagekit.io/test-dtps${options.folder}/${options.fileName}`,
        fileId: `imagekit-${options.fileName}`,
    }),
);

// Mock durable ImageKit storage without making external network writes.
jest.mock('@/lib/imagekit', () => ({
    getImageKit: jest.fn(() => ({
        upload: mockImageKitUpload,
    })),
}));

// Mock fs/promises to avoid actual file writes
jest.mock('fs/promises', () => ({
    writeFile: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
}));

function buildSession(user: Record<string, any> | null) {
    if (!user) {
        return null;
    }
    return {
        user: {
            id: String(user._id ?? user.id),
            email: user.email,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName,
            name: `${user.firstName} ${user.lastName}`.trim(),
        },
    };
}

function mockSession(user: Record<string, any> | null): void {
    (getServerSession as jest.Mock).mockResolvedValue(buildSession(user));
}

// Helper to create a mock file for FormData
function createMockFile(
    content: string | Buffer,
    filename: string,
    mimeType: string
): File {
    const blob = new Blob([content], { type: mimeType });
    return new File([blob], filename, { type: mimeType });
}

// Helper to invoke upload route with FormData
async function invokeUploadRoute(options: {
    user: Record<string, any> | null;
    file: File;
    type: string;
}): Promise<{ response: Response; status: number; json: any }> {
    mockSession(options.user);

    const formData = new FormData();
    formData.append('file', options.file);
    formData.append('type', options.type);

    const request = new NextRequest('http://localhost/api/upload', {
        method: 'POST',
        body: formData,
    });

    const route = await import('@/app/api/upload/route');
    const response = await route.POST(request);

    let json: any = null;
    try {
        json = await response.json();
    } catch {
        json = null;
    }

    return {
        response,
        status: response.status,
        json,
    };
}

describe('File Upload Integration Tests', () => {
    beforeAll(async () => {
        await ensureDatabaseConnection();
    });

    describe('Authentication', () => {
        it('should reject upload without authentication', async () => {
            const file = createMockFile('test content', 'test.txt', 'text/plain');

            const result = await invokeUploadRoute({
                user: null,
                file,
                type: 'message',
            });

            expect(result.status).toBe(401);
            expect(result.json.error).toBe('Unauthorized');
        });

        it('should allow upload with authenticated user', async () => {
            const client = await createUser({
                role: UserRole.CLIENT,
                email: `upload-test-${Date.now()}@test.com`,
            });

            const file = createMockFile('test content', 'test.txt', 'text/plain');

            const result = await invokeUploadRoute({
                user: client,
                file,
                type: 'message',
            });

            // All successful uploads must be durably stored in ImageKit.
            expect(result.status).toBe(200);
            expect(result.json.storage).toBe('imagekit');
            expect(result.json.url).toContain('https://ik.imagekit.io/');
            expect(Buffer.isBuffer(mockImageKitUpload.mock.calls.at(-1)?.[0]?.file)).toBe(true);
            expect(result.json.url).toBeDefined();
            expect(result.json.filename).toBeDefined();
        });
    });

    describe('File Validation', () => {
        let testUser: any;

        beforeAll(async () => {
            testUser = await createUser({
                role: UserRole.CLIENT,
                email: `upload-validation-${Date.now()}@test.com`,
            });
        });

        it('should reject upload without file', async () => {
            mockSession(testUser);

            const formData = new FormData();
            formData.append('type', 'message');

            const request = new NextRequest('http://localhost/api/upload', {
                method: 'POST',
                body: formData,
            });

            const route = await import('@/app/api/upload/route');
            const response = await route.POST(request);
            const json = await response.json();

            expect(response.status).toBe(400);
            expect(json.error).toBe('No file provided');
        });

        it('should reject invalid file type for avatar upload', async () => {
            const file = createMockFile('test content', 'test.txt', 'text/plain');

            const result = await invokeUploadRoute({
                user: testUser,
                file,
                type: 'avatar',
            });

            expect(result.status).toBe(400);
            expect(result.json.error).toBe('Invalid file type');
        });

        it('should accept valid image for avatar upload', async () => {
            // Create a minimal valid JPEG file (just the header)
            const jpegHeader = Buffer.from([
                0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
            ]);
            const file = createMockFile(jpegHeader, 'avatar.jpg', 'image/jpeg');

            const result = await invokeUploadRoute({
                user: testUser,
                file,
                type: 'avatar',
            });

            expect(result.status).toBe(200);
            expect(result.json.url).toBeDefined();
        });

        it('should accept PDF for message upload', async () => {
            const file = createMockFile('%PDF-1.4 test content', 'document.pdf', 'application/pdf');

            const result = await invokeUploadRoute({
                user: testUser,
                file,
                type: 'message',
            });

            expect(result.status).toBe(200);
            expect(result.json.url).toBeDefined();
        });

        it('should accept Word document for message upload', async () => {
            const file = createMockFile(
                'PK word content',
                'document.docx',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            );

            const result = await invokeUploadRoute({
                user: testUser,
                file,
                type: 'message',
            });

            expect(result.status).toBe(200);
            expect(result.json.url).toBeDefined();
        });

        it('should accept Excel file for message upload', async () => {
            const file = createMockFile(
                'PK excel content',
                'spreadsheet.xlsx',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );

            const result = await invokeUploadRoute({
                user: testUser,
                file,
                type: 'message',
            });

            expect(result.status).toBe(200);
            expect(result.json.url).toBeDefined();
        });

        it('should accept text file for message upload', async () => {
            const file = createMockFile('Plain text content', 'notes.txt', 'text/plain');

            const result = await invokeUploadRoute({
                user: testUser,
                file,
                type: 'message',
            });

            expect(result.status).toBe(200);
            expect(result.json.url).toBeDefined();
        });
    });

    describe('File Size Limits', () => {
        let testUser: any;

        beforeAll(async () => {
            testUser = await createUser({
                role: UserRole.CLIENT,
                email: `upload-size-${Date.now()}@test.com`,
            });
        });

        it('should reject avatar larger than 5MB', async () => {
            // Create a file larger than 5MB
            const largeContent = Buffer.alloc(6 * 1024 * 1024, 'x');
            const file = createMockFile(largeContent, 'large-avatar.jpg', 'image/jpeg');

            const result = await invokeUploadRoute({
                user: testUser,
                file,
                type: 'avatar',
            });

            expect(result.status).toBe(400);
            expect(result.json.error).toBe('File too large');
        });

        it('should reject message file larger than 25MB', async () => {
            // Create a file larger than 25MB
            const largeContent = Buffer.alloc(26 * 1024 * 1024, 'x');
            const file = createMockFile(largeContent, 'large-document.pdf', 'application/pdf');

            const result = await invokeUploadRoute({
                user: testUser,
                file,
                type: 'message',
            });

            expect(result.status).toBe(400);
            expect(result.json.error).toBe('File too large');
        });
    });

    describe('Upload Types', () => {
        let testUser: any;

        beforeAll(async () => {
            testUser = await createUser({
                role: UserRole.CLIENT,
                email: `upload-types-${Date.now()}@test.com`,
            });
        });

        it('should handle image message upload', async () => {
            const jpegHeader = Buffer.from([
                0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
            ]);
            const file = createMockFile(jpegHeader, 'photo.jpg', 'image/jpeg');

            const result = await invokeUploadRoute({
                user: testUser,
                file,
                type: 'message',
            });

            expect(result.status).toBe(200);
            expect(result.json.url).toBeDefined();
            expect(result.json.type).toMatch(/image/);
        });

        it('should handle video message upload', async () => {
            const file = createMockFile(
                Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]),
                'video.mp4',
                'video/mp4'
            );

            const result = await invokeUploadRoute({
                user: testUser,
                file,
                type: 'message',
            });

            expect(result.status).toBe(200);
            expect(result.json.url).toBeDefined();
        });

        it('should handle audio message upload', async () => {
            const file = createMockFile(
                Buffer.from([0x52, 0x49, 0x46, 0x46]),
                'audio.webm',
                'audio/webm'
            );

            const result = await invokeUploadRoute({
                user: testUser,
                file,
                type: 'message',
            });

            expect(result.status).toBe(200);
            expect(result.json.url).toBeDefined();
        });

        it('should handle medical report upload', async () => {
            const file = createMockFile('%PDF-1.4 medical report', 'report.pdf', 'application/pdf');

            const result = await invokeUploadRoute({
                user: testUser,
                file,
                type: 'medical-report',
            });

            expect(result.status).toBe(200);
            expect(result.json.url).toBeDefined();
        });
    });

    describe('Response Format', () => {
        let testUser: any;

        beforeAll(async () => {
            testUser = await createUser({
                role: UserRole.CLIENT,
                email: `upload-response-${Date.now()}@test.com`,
            });
        });

        it('should return all required fields in response', async () => {
            const file = createMockFile('test content', 'test.txt', 'text/plain');

            const result = await invokeUploadRoute({
                user: testUser,
                file,
                type: 'message',
            });

            expect(result.status).toBe(200);
            expect(result.json).toMatchObject({
                url: expect.any(String),
                filename: expect.any(String),
                size: expect.any(Number),
                type: expect.any(String),
            });
        });

        it('should return file ID for database reference', async () => {
            const file = createMockFile('test content', 'test.txt', 'text/plain');

            const result = await invokeUploadRoute({
                user: testUser,
                file,
                type: 'message',
            });

            expect(result.status).toBe(200);
            expect(result.json.fileId).toBeDefined();
        });
    });

    describe('ImageKit-only storage', () => {
        it('rejects the upload instead of falling back to local or database storage', async () => {
            const client = await createUser({
                role: UserRole.CLIENT,
                email: `upload-imagekit-required-${Date.now()}@test.com`,
            });
            (getImageKit as jest.Mock).mockReturnValueOnce(null);

            const result = await invokeUploadRoute({
                user: client,
                file: createMockFile('test content', 'test.txt', 'text/plain'),
                type: 'message',
            });

            expect(result.status).toBe(503);
            expect(result.json.code).toBe('MEDIA_SERVICE_DOWN');
        });
    });
});
