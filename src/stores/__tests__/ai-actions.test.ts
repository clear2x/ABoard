import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @tauri-apps/api/core
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Mock @tauri-apps/api/event
const mockUnlisten = vi.fn();
const mockListen = vi.fn().mockResolvedValue(mockUnlisten);
vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

import {
  resultPopup,
  setResultPopup,
  processing,
  translateContent,
  summarizeContent,
  rewriteContent,
  REWRITE_STYLES,
} from "../ai-actions";

describe("ai-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setResultPopup(null);
  });

  describe("signals", () => {
    it("resultPopup starts as null", () => {
      expect(resultPopup()).toBeNull();
    });

    it("processing starts as null", () => {
      expect(processing()).toBeNull();
    });

    it("setResultPopup sets the popup state", () => {
      const popup = {
        originalContent: "hello",
        resultText: "world",
        actionType: "translate" as const,
        itemId: "item-1",
      };
      setResultPopup(popup);
      expect(resultPopup()).toEqual(popup);
    });
  });

  describe("REWRITE_STYLES", () => {
    it("contains formal style", () => {
      expect(REWRITE_STYLES.formal).toBeDefined();
    });

    it("contains all 5 styles", () => {
      const keys = Object.keys(REWRITE_STYLES);
      expect(keys).toContain("formal");
      expect(keys).toContain("casual");
      expect(keys).toContain("concise");
      expect(keys).toContain("detailed");
      expect(keys).toContain("academic");
    });

    it("each style description contains Chinese text", () => {
      for (const desc of Object.values(REWRITE_STYLES)) {
        expect(desc).toMatch(/[\u4e00-\u9fff]/);
      }
    });
  });

  describe("translateContent()", () => {
    it("translates Chinese to English via invoke", async () => {
      mockInvoke.mockResolvedValue({
        response: {
          text: "Hello World",
          tokens_used: 50,
          provider: "ollama",
          duration_ms: 1200,
        },
        routing_decision: null,
      });

      await translateContent("你好世界", "item-1");

      expect(mockInvoke).toHaveBeenCalledWith("ai_infer_auto", {
        request: {
          prompt: "你好世界",
          system_prompt: expect.stringContaining("翻译"),
          max_tokens: expect.any(Number),
          temperature: 0.3,
        },
      });

      const popup = resultPopup();
      expect(popup).not.toBeNull();
      expect(popup!.resultText).toBe("Hello World");
      expect(popup!.actionType).toBe("translate");
      expect(popup!.durationMs).toBe(1200);
      expect(popup!.tokensUsed).toBe(50);
    });

    it("translates English to Chinese", async () => {
      mockInvoke.mockResolvedValue({
        response: {
          text: "你好",
          tokens_used: 30,
          provider: "ollama",
          duration_ms: 800,
        },
        routing_decision: null,
      });

      await translateContent("Hello", "item-2");

      expect(mockInvoke).toHaveBeenCalledWith("ai_infer_auto", {
        request: {
          prompt: "Hello",
          system_prompt: expect.stringContaining("翻译"),
          max_tokens: expect.any(Number),
          temperature: 0.3,
        },
      });
    });

    it("shows error popup when AI is not available", async () => {
      mockInvoke.mockRejectedValue(new Error("AI not available"));

      await translateContent("hello", "item-3");

      const popup = resultPopup();
      expect(popup).not.toBeNull();
      expect(popup!.actionType).toBe("error");
      expect(popup!.resultText).toMatch(/未配置|not configured/i);
    });

    it("shows timeout error for timed out requests", async () => {
      mockInvoke.mockRejectedValue(new Error("request timed out"));

      await translateContent("hello", "item-4");

      const popup = resultPopup();
      expect(popup!.actionType).toBe("error");
      expect(popup!.resultText).toMatch(/超时|timed out/i);
    });

    it("shows connection error for ECONNREFUSED", async () => {
      mockInvoke.mockRejectedValue(new Error("ECONNREFUSED connection refused"));

      await translateContent("hello", "item-5");

      const popup = resultPopup();
      expect(popup!.actionType).toBe("error");
      expect(popup!.resultText).toMatch(/无法连接|Cannot connect/i);
    });

    it("sets processing during operation and clears after", async () => {
      let resolveInfer: (v: unknown) => void;
      const inferPromise = new Promise((resolve) => {
        resolveInfer = resolve;
      });
      mockInvoke.mockReturnValue(inferPromise);

      const translatePromise = translateContent("hello", "item-6");
      expect(processing()).toBe("translate");

      resolveInfer!({
        response: { text: "result", tokens_used: 0, provider: "test", duration_ms: 100 },
        routing_decision: null,
      });
      await translatePromise;

      expect(processing()).toBeNull();
    });
  });

  describe("summarizeContent()", () => {
    it("summarizes content and sets popup", async () => {
      mockInvoke.mockResolvedValue({
        response: {
          text: "1. Point one\n2. Point two",
          tokens_used: 40,
          provider: "ollama",
          duration_ms: 900,
        },
        routing_decision: null,
      });

      await summarizeContent("Long text here...", "item-s1");

      expect(mockInvoke).toHaveBeenCalledWith("ai_infer_auto", {
        request: {
          prompt: "Long text here...",
          system_prompt: expect.stringContaining("总结"),
          max_tokens: 500,
          temperature: 0.3,
        },
      });

      const popup = resultPopup();
      expect(popup!.actionType).toBe("summarize");
      expect(popup!.resultText).toContain("Point one");
    });

    it("shows error popup on failure", async () => {
      mockInvoke.mockRejectedValue(new Error("Something went wrong"));

      await summarizeContent("text", "item-s2");

      const popup = resultPopup();
      expect(popup!.actionType).toBe("error");
    });

    it("clears processing after failure", async () => {
      mockInvoke.mockRejectedValue(new Error("fail"));

      await summarizeContent("text", "item-s3");

      expect(processing()).toBeNull();
    });
  });

  describe("rewriteContent()", () => {
    it("rewrites content with formal style", async () => {
      mockInvoke.mockResolvedValue({
        response: {
          text: "Dear Sir/Madam,",
          tokens_used: 60,
          provider: "ollama",
          duration_ms: 1500,
        },
        routing_decision: null,
      });

      await rewriteContent("Hey what's up", "item-r1", "formal");

      expect(mockInvoke).toHaveBeenCalledWith("ai_infer_auto", {
        request: {
          prompt: "Hey what's up",
          system_prompt: expect.stringContaining("正式风格"),
          max_tokens: expect.any(Number),
          temperature: 0.3,
        },
      });

      const popup = resultPopup();
      expect(popup!.actionType).toBe("rewrite");
      expect(popup!.resultText).toBe("Dear Sir/Madam,");
    });

    it("rewrites with casual style", async () => {
      mockInvoke.mockResolvedValue({
        response: {
          text: "Hey there!",
          tokens_used: 20,
          provider: "ollama",
          duration_ms: 500,
        },
        routing_decision: null,
      });

      await rewriteContent("Greetings.", "item-r2", "casual");

      expect(mockInvoke).toHaveBeenCalledWith("ai_infer_auto", {
        request: expect.objectContaining({
          system_prompt: expect.stringContaining("随意风格"),
        }),
      });
    });

    it("defaults to formal for unknown style", async () => {
      mockInvoke.mockResolvedValue({
        response: {
          text: "result",
          tokens_used: 10,
          provider: "test",
          duration_ms: 100,
        },
        routing_decision: null,
      });

      await rewriteContent("text", "item-r3", "unknown_style");

      expect(mockInvoke).toHaveBeenCalledWith("ai_infer_auto", {
        request: expect.objectContaining({
          system_prompt: expect.stringContaining("正式风格"),
        }),
      });
    });

    it("shows error popup on failure", async () => {
      mockInvoke.mockRejectedValue(new Error("AI error"));

      await rewriteContent("text", "item-r4", "concise");

      const popup = resultPopup();
      expect(popup!.actionType).toBe("error");
    });
  });
});
