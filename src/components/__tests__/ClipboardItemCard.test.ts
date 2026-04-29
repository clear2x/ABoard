import { describe, it, expect, vi } from "vitest";

// We test the pure utility functions from ClipboardItemCard by re-implementing
// the logic here (they are module-scoped, not exported).
// These tests ensure the detection/display logic stays correct.

// --- Copied from ClipboardItemCard.tsx ---
function truncateText(text: string, maxLen: number = 120): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

function isMarkdown(content: string): boolean {
  return /^(#|\*\*|\* |- |1\. |\[.*\]\(.*\)|```)/m.test(content);
}

function displayType(item: { ai_type?: string | null; type: string }): string {
  return item.ai_type || item.type;
}

function typeAvatar(type: string): { letter: string; bg: string; color: string } {
  switch (type) {
    case "code":
      return { letter: "", bg: "bg-purple-50", color: "text-purple-500" };
    case "link":
      return { letter: "", bg: "bg-blue-50", color: "text-blue-500" };
    case "image":
      return { letter: "", bg: "bg-green-50", color: "text-green-500" };
    case "video":
      return { letter: "", bg: "bg-rose-50", color: "text-rose-500" };
    default:
      return { letter: "T", bg: "bg-blue-100", color: "text-blue-600" };
  }
}
// --- End copied ---

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
      expect(displayType({ ai_type: "code", type: "text" })).toBe("code");
    });

    it("falls back to type when ai_type is null", () => {
      expect(displayType({ ai_type: null, type: "text" })).toBe("text");
    });

    it("falls back to type when ai_type is undefined", () => {
      expect(displayType({ type: "link" })).toBe("link");
    });
  });

  describe("typeAvatar()", () => {
    it("returns code avatar for code type", () => {
      const avatar = typeAvatar("code");
      expect(avatar.bg).toContain("purple");
    });

    it("returns link avatar for link type", () => {
      const avatar = typeAvatar("link");
      expect(avatar.bg).toContain("blue");
    });

    it("returns image avatar for image type", () => {
      const avatar = typeAvatar("image");
      expect(avatar.bg).toContain("green");
    });

    it("returns video avatar for video type", () => {
      const avatar = typeAvatar("video");
      expect(avatar.bg).toContain("rose");
    });

    it("returns text fallback with letter T for unknown type", () => {
      const avatar = typeAvatar("text");
      expect(avatar.letter).toBe("T");
    });
  });
});

// --- Test FloatingPopup utilities ---
describe("FloatingPopup utilities", () => {
  // Copied from FloatingPopup.tsx
  function itemLabel(item: { type: string; file_path?: string | null; content: string }): string {
    if (item.type === "video") {
      return item.file_path ? item.file_path.split("/").pop() || "Video" : "Video recording";
    }
    if (item.type === "image") {
      return "Image";
    }
    return item.content.slice(0, 80);
  }

  describe("itemLabel()", () => {
    it("returns 'Image' for image items", () => {
      expect(itemLabel({ type: "image", content: "base64data..." })).toBe("Image");
    });

    it("returns filename for video items with file_path", () => {
      expect(itemLabel({
        type: "video",
        file_path: "data/abc123.mp4",
        content: "",
      })).toBe("abc123.mp4");
    });

    it("returns 'Video recording' for video items without file_path", () => {
      expect(itemLabel({ type: "video", content: "" })).toBe("Video recording");
    });

    it("truncates text content to 80 chars", () => {
      const long = "x".repeat(200);
      const label = itemLabel({ type: "text", content: long });
      expect(label).toHaveLength(80);
    });

    it("preserves short text content", () => {
      expect(itemLabel({ type: "text", content: "hello" })).toBe("hello");
    });
  });
});
