import { describe, expect, it } from "vitest";
import { MemoryStore } from "../api/_lib/store";

describe("store", () => {
  it("round-trips a value", async () => {
    const s = new MemoryStore();
    await s.set("k", { a: 1 });
    expect(await s.get("k")).toEqual({ a: 1 });
    await s.del("k");
    expect(await s.get("k")).toBeNull();
  });
});
