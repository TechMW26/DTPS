import {
  flushMutationOutbox,
  getMutationOutboxEntries,
  prepareDurableMutation,
  settleDurableMutation,
  type StorageLike,
} from "@/lib/api/mutation-outbox";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const jsonMutation = (body: Record<string, unknown>): RequestInit => ({
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("durable mutation outbox", () => {
  it("coalesces repeated saves for one resource to the latest payload", () => {
    const storage = new MemoryStorage();
    prepareDurableMutation(
      "/api/users/client-1",
      jsonMutation({ firstName: "First" }),
      storage,
    );
    prepareDurableMutation(
      "/api/users/client-1",
      jsonMutation({ firstName: "Latest" }),
      storage,
    );

    const entries = getMutationOutboxEntries(storage);
    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0].body)).toEqual({ firstName: "Latest" });
    expect(entries[0].headers["x-idempotency-key"]).toBeTruthy();
  });

  it("does not persist an unsafe create without duplicate protection", () => {
    const storage = new MemoryStorage();
    const unsafe = prepareDurableMutation(
      "/api/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      },
      storage,
    );

    expect(unsafe).toBeNull();
    expect(getMutationOutboxEntries(storage)).toHaveLength(0);
  });

  it("keeps transient failures and syncs them in the background", async () => {
    const storage = new MemoryStorage();
    const prepared = prepareDurableMutation(
      "/api/users/client-1/lifestyle",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foodPreference: "veg" }),
      },
      storage,
    );
    expect(prepared).not.toBeNull();

    expect(
      settleDurableMutation(
        prepared!.entry,
        new Response(null, { status: 503 }),
        storage,
      ),
    ).toBe("pending");
    expect(getMutationOutboxEntries(storage)).toHaveLength(1);

    const queued = getMutationOutboxEntries(storage)[0];
    queued.nextAttemptAt = 0;
    storage.setItem("dtps:mutation-outbox:v1", JSON.stringify([queued]));
    const sender = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    ) as jest.MockedFunction<typeof fetch>;
    const result = await flushMutationOutbox(sender, storage);

    expect(result).toMatchObject({ attempted: 1, synced: 1, pending: 0 });
    expect(sender).toHaveBeenCalledTimes(1);
    expect(getMutationOutboxEntries(storage)).toHaveLength(0);
  });

  it("discards validation failures instead of replaying invalid data forever", () => {
    const storage = new MemoryStorage();
    const prepared = prepareDurableMutation(
      "/api/users/client-1",
      jsonMutation({ heightCm: "invalid" }),
      storage,
    );

    expect(
      settleDurableMutation(
        prepared!.entry,
        new Response(null, { status: 422 }),
        storage,
      ),
    ).toBe("discarded");
    expect(getMutationOutboxEntries(storage)).toHaveLength(0);
  });
});
