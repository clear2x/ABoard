import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @tauri-apps/api/core
const mockInvoke = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Mock @tauri-apps/api/event
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import {
  items,
  setItems,
  addItem,
  reorderItems,
  toggleSelect,
  clearSelection,
  selectAll,
  selectedIds,
} from "../clipboard";
import type { ClipboardItem } from "../clipboard";

function makeItem(overrides: Partial<ClipboardItem> = {}): ClipboardItem {
  return {
    id: `test-${Math.random().toString(36).slice(2, 8)}`,
    type: "text",
    content: "hello world",
    hash: `hash-${Math.random().toString(36).slice(2, 10)}`,
    timestamp: Date.now(),
    metadata: {},
    pinned: false,
    ...overrides,
  };
}

describe("clipboard store", () => {
  beforeEach(() => {
    setItems([]);
    mockInvoke.mockClear();
  });

  describe("addItem()", () => {
    it("adds a new item to the front of the list", () => {
      const item = makeItem();
      addItem(item);
      expect(items()).toHaveLength(1);
      expect(items()[0].id).toBe(item.id);
    });

    it("deduplicates by hash — skips items with existing hash", () => {
      const item = makeItem({ hash: "abc123" });
      addItem(item);
      addItem(makeItem({ id: "different", hash: "abc123" }));
      expect(items()).toHaveLength(1);
    });

    it("allows items with different hashes", () => {
      addItem(makeItem({ hash: "aaa" }));
      addItem(makeItem({ hash: "bbb" }));
      expect(items()).toHaveLength(2);
    });
  });

  describe("reorderItems()", () => {
    it("moves item from one index to another", () => {
      const a = makeItem({ id: "a" });
      const b = makeItem({ id: "b" });
      const c = makeItem({ id: "c" });
      setItems([a, b, c]);

      reorderItems(0, 2); // move a to position 2
      expect(items().map((i) => i.id)).toEqual(["b", "c", "a"]);
    });

    it("does nothing when fromIndex === toIndex", () => {
      const a = makeItem({ id: "a" });
      const b = makeItem({ id: "b" });
      setItems([a, b]);

      reorderItems(0, 0);
      expect(items().map((i) => i.id)).toEqual(["a", "b"]);
    });

    it("does nothing with negative indices", () => {
      const a = makeItem({ id: "a" });
      setItems([a]);

      reorderItems(-1, 0);
      expect(items().map((i) => i.id)).toEqual(["a"]);
    });

    it("persists sort_order to backend via invoke", () => {
      const a = makeItem({ id: "a" });
      const b = makeItem({ id: "b" });
      const c = makeItem({ id: "c" });
      setItems([a, b, c]);
      mockInvoke.mockClear();

      reorderItems(0, 2); // move a to position 2 -> [b, c, a]

      expect(mockInvoke).toHaveBeenCalledWith("update_sort_order", {
        orders: [["b", "0"], ["c", "1"], ["a", "2"]],
      });
    });

    it("does not call invoke when indices are equal", () => {
      const a = makeItem({ id: "a" });
      setItems([a]);
      mockInvoke.mockClear();

      reorderItems(0, 0);
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  describe("selection", () => {
    it("toggleSelect adds and removes ids", () => {
      toggleSelect("item-1");
      expect(selectedIds().has("item-1")).toBe(true);

      toggleSelect("item-1");
      expect(selectedIds().has("item-1")).toBe(false);
    });

    it("clearSelection empties the set", () => {
      toggleSelect("item-1");
      toggleSelect("item-2");
      expect(selectedIds().size).toBe(2);

      clearSelection();
      expect(selectedIds().size).toBe(0);
    });

    it("selectAll selects all item ids", () => {
      const a = makeItem({ id: "a" });
      const b = makeItem({ id: "b" });
      setItems([a, b]);

      selectAll();
      expect(selectedIds().size).toBe(2);
      expect(selectedIds().has("a")).toBe(true);
      expect(selectedIds().has("b")).toBe(true);
    });
  });

  describe("deleteItems()", () => {
    it("optimistically removes items from state", async () => {
      const a = makeItem({ id: "a" });
      const b = makeItem({ id: "b" });
      setItems([a, b]);

      await import("../clipboard").then((m) => m.deleteItems(["a"]));
      expect(items().map((i) => i.id)).toEqual(["b"]);
    });

    it("reloads history on failure", async () => {
      const a = makeItem({ id: "a" });
      setItems([a]);
      mockInvoke.mockRejectedValueOnce(new Error("db error"));
      // Subsequent call for loadHistory
      mockInvoke.mockResolvedValue([]);

      await import("../clipboard").then((m) => m.deleteItems(["a"]));
      // Should have called invoke for loadHistory recovery
      expect(mockInvoke).toHaveBeenCalled();
    });
  });

  describe("pinItem() / unpinItem()", () => {
    it("optimistically pins an item", async () => {
      const a = makeItem({ id: "a", pinned: false });
      setItems([a]);

      await import("../clipboard").then((m) => m.pinItem("a"));
      expect(items()[0].pinned).toBe(true);
    });

    it("optimistically unpins an item", async () => {
      const a = makeItem({ id: "a", pinned: true });
      setItems([a]);

      await import("../clipboard").then((m) => m.unpinItem("a"));
      expect(items()[0].pinned).toBe(false);
    });
  });
});
