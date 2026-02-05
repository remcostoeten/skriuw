import { describe, it, expect, mock, beforeEach } from "bun:test";
import { GET, POST, DELETE } from "@/app/api/assets/route";
import { PATCH, GET as GET_ONE } from "@/app/api/assets/[id]/route";
import { NextRequest } from "next/server";

// Mock auth
const mockRequireMutation = mock();
const mockAllowReadAccess = mock();
const mockGetSession = mock();

mock.module("@/lib/api-auth", () => ({
    requireMutation: mockRequireMutation,
    allowReadAccess: mockAllowReadAccess,
    GUEST_USER_ID: "guest-id"
}));

mock.module("@/lib/auth", () => ({
    auth: { api: { getSession: mockGetSession } }
}));

// Mock DB
const mockDb = {
    select: mock(() => mockDb),
    from: mock(() => mockDb),
    where: mock(() => mockDb),
    limit: mock(() => mockDb),
    offset: mock(() => mockDb),
    orderBy: mock(() => mockDb),
    insert: mock(() => mockDb),
    values: mock(() => mockDb),
    update: mock(() => mockDb),
    set: mock(() => mockDb),
    delete: mock(() => mockDb),
    returning: mock(() => [])
};

mock.module("@skriuw/db", () => ({
    getDatabase: () => mockDb,
    files: { id: 'files.id', userId: 'files.userId', name: 'files.name', createdAt: 'files.createdAt' },
    eq: (a: any, b: any) => ({ type: 'eq', a, b }),
    and: (...args: any[]) => ({ type: 'and', args }),
    like: (a: any, b: any) => ({ type: 'like', a, b }),
    desc: (col: any) => ({ type: 'desc', col }),
    asc: (col: any) => ({ type: 'asc', col })
}));

mock.module("@skriuw/shared", () => ({
    generateId: () => "new-file-id"
}));

describe("Assets API", () => {
    beforeEach(() => {
        mockRequireMutation.mockReset();
        mockAllowReadAccess.mockReset();
        // Reset DB mocks logic if needed, simplistically handled here
    });

    describe("GET /api/assets", () => {
        it("should return empty list for guest", async () => {
            mockAllowReadAccess.mockResolvedValue("guest-id");
            const req = new NextRequest("http://localhost/api/assets");

            const res = await GET(req);
            const data = await res.json();

            expect(data.items).toEqual([]);
            expect(data.total).toEqual(0);
        });

        it("should query db for authenticated user", async () => {
            mockAllowReadAccess.mockResolvedValue("user-1");
            const req = new NextRequest("http://localhost/api/assets?limit=10");

            // Mock DB return
            // count query
            mockDb.select.mockReturnValueOnce([{ count: 1 }]);
            // items query
            mockDb.select.mockReturnValueOnce([{ id: '1', name: 'test' }]);

            const res = await GET(req);
            const data = await res.json();

            expect(data.items).toHaveLength(1);
            expect(data.total).toEqual(1);
            expect(mockDb.limit).toHaveBeenCalledWith(10);
        });
    });

    describe("DELETE /api/assets", () => {
        it("should delete file if owned by user", async () => {
            mockRequireMutation.mockResolvedValue({ authenticated: true, userId: "user-1" });
            const req = new NextRequest("http://localhost/api/assets?id=file-1");

            mockDb.select.mockReturnValue([{ id: 'file-1', storageProvider: 'local-fs' }]);

            const res = await DELETE(req);
            const data = await res.json();

            expect(data.success).toBe(true);
            expect(mockDb.delete).toHaveBeenCalled();
        });
    });

    describe("PATCH /api/assets/[id]", () => {
        it("should update file name", async () => {
            mockRequireMutation.mockResolvedValue({ authenticated: true, userId: "user-1" });
            const req = new NextRequest("http://localhost/api/assets/file-1", {
                method: 'PATCH',
                body: JSON.stringify({ name: 'new name' })
            });

            mockDb.select.mockReturnValue([{ id: 'file-1' }]);
            mockDb.returning.mockReturnValue([{ id: 'file-1', name: 'new name' }]);

            const res = await PATCH(req, { params: Promise.resolve({ id: 'file-1' }) });
            const data = await res.json();

            expect(data.name).toBe('new name');
            expect(mockDb.update).toHaveBeenCalled();
        });
    });
});
