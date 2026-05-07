import { describe, it, expect, vi } from "vitest";
import { truncateText, isMarkdown, displayType, typeAvatar } from "../ClipboardItemCard";
import type { ClipboardItem } from "../../stores/clipboard";

// Mock Tauri invoke for imports
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

describe("ClipboardItemCard utilities", () => {
  describe("truncateText()", () => {
    it("returns text unchanged when within limit", () => {
      expect(truncateText("hello", 120)).toBe("hello");
    });

    it("truncates and appends ellipsis when over limit", () => {
      const long = "a".repeat(200);
      expect(truncateText(long)).toBe("a".repeat(120) + "...");
    });

    it("respects custom maxLen", () => {
      expect(truncateText("hello world", 5)).toBe("hello...");
    });

    it("returns exact-length text unchanged", () => {
      const text = "a".repeat(120);
      expect(truncateText(text)).toBe(text);
    });
  });

  describe("isMarkdown()", () => {
    it("detects heading", () => {
      expect(isMarkdown("# Title")).toBe(true);
      expect(isMarkdown("## Subtitle")).toBe(true);
    });

    it("detects bold text at line start", () => {
      expect(isMarkdown("**bold** at start")).toBe(true);
    });

    it("detects list items", () => {
      expect(isMarkdown("- item one")).toBe(true);
      expect(isMarkdown("1. ordered item")).toBe(true);
    });

    it("detects links", () => {
      expect(isMarkdown("[click here](https://example.com)")).toBe(true);
    });

    it("detects code blocks", () => {
      expect(isMarkdown("```js\nconsole.log('hi')\n```")).toBe(true);
    });

    it("returns false for plain text", () => {
      expect(isMarkdown("Just some regular text")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isMarkdown("")).toBe(false);
    });
  });

  describe("displayType()", () => {
    it("returns ai_type when available", () => {
      const item = { ai_type: "code", type: "text" } as unknown as ClipboardItem;
      expect(displayType(item)).toBe("code");
    });

    it("falls back to type when ai_type is null", () => {
      const item = { ai_type: null, type: "text" } as unknown as ClipboardItem;
      expect(displayType(item)).toBe("text");
    });

    it("falls back to type when ai_type is undefined", () => {
      const item = { type: "link" } as unknown as ClipboardItem;
      expect(displayType(item)).toBe("link");
    });
  });

  describe("typeAvatar()", () => {
    it("returns code avatar for code type", () => {
      const avatar = typeAvatar("code");
      expect(avatar.bg).toContain("purple");
      expect(avatar.icon).toBe("ph-code");
    });

    it("returns link avatar for link type", () => {
      const avatar = typeAvatar("link");
      expect(avatar.bg).toContain("blue");
      expect(avatar.icon).toBe("ph-link");
    });

    it("returns image avatar for image type", () => {
      const avatar = typeAvatar("image");
      expect(avatar.bg).toContain("green");
    });

    it("returns video avatar for video type", () => {
      const avatar = typeAvatar("video");
      expect(avatar.bg).toContain("rose");
    });

    it("returns file-paths avatar for file-paths type", () => {
      const avatar = typeAvatar("file-paths");
      expect(avatar.bg).toContain("amber");
      expect(avatar.icon).toBe("ph-file");
    });

    it("returns json avatar for json type", () => {
      const avatar = typeAvatar("json");
      expect(avatar.bg).toContain("orange");
    });

    it("returns text fallback with letter T for unknown type", () => {
      const avatar = typeAvatar("text");
      expect(avatar.letter).toBe("T");
      expect(avatar.icon).toBeUndefined();
    });
  });
});
