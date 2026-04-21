import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

/// AI action result data passed to the result popup.
export interface AiActionResult {
  originalContent: string;
  resultText: string;
  actionType: "translate" | "summarize" | "rewrite" | "format";
  itemId: string;
  isValid?: boolean; // for validation results
}

/// Inference auto-response mirrors the Rust struct InferenceAutoResponse.
interface InferenceAutoResponse {
  response: {
    text: string;
    tokens_used: number;
    provider: string;
    duration_ms: number;
  };
  routing_decision: unknown | null;
}

// Result popup state: null means popup is hidden.
const [resultPopup, setResultPopup] = createSignal<AiActionResult | null>(null);

// Processing indicator: which action is currently running, or null.
const [processing, setProcessing] = createSignal<string | null>(null);

export { resultPopup, setResultPopup, processing, setProcessing };

// --- Rewrite style definitions ---

const REWRITE_STYLES: Record<string, string> = {
  formal:
    "\u6b63\u5f0f\u98ce\u683c\uff1a\u4f7f\u7528\u4e66\u9762\u8bed\u8a00\uff0c\u907f\u514d\u53e3\u8bed\u5316\u8868\u8fbe",
  casual:
    "\u968f\u610f\u98ce\u683c\uff1a\u4f7f\u7528\u8f7b\u677e\u53e3\u8bed\u5316\u8868\u8fbe\uff0c\u50cf\u670b\u53cb\u804a\u5929",
  concise:
    "\u7b80\u6d01\u98ce\u683c\uff1a\u53bb\u9664\u5197\u4f59\uff0c\u7528\u6700\u5c11\u7684\u6587\u5b57\u4f20\u8fbe\u6838\u5fc3\u610f\u601d",
  detailed:
    "\u8be6\u7ec6\u98ce\u683c\uff1a\u5c55\u5f00\u63cf\u8ff0\uff0c\u589e\u52e0\u7ec6\u8282\u548c\u89e3\u91ca",
  academic:
    "\u5b66\u672f\u98ce\u683c\uff1a\u4f7f\u7528\u5b66\u672f\u8bed\u8a00\uff0c\u4e25\u8c28\u7684\u903b\u8f91\u548c\u672f\u8bed",
};

export { REWRITE_STYLES };

// --- Helper ---

/**
 * Detect if text contains Chinese characters.
 * Used to auto-determine translation direction.
 */
function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

/**
 * Call the AI inference backend via Tauri command.
 */
async function callInfer(
  prompt: string,
  systemPrompt: string,
  maxTokens: number
): Promise<string> {
  const response = await invoke<InferenceAutoResponse>("ai_infer_auto", {
    request: {
      prompt,
      system_prompt: systemPrompt,
      max_tokens: maxTokens,
      temperature: 0.7,
    },
  });
  return response.response.text;
}

// --- Public API ---

/**
 * Translate content: auto-detect language direction.
 * Chinese -> English, non-Chinese -> Chinese.
 */
export async function translateContent(
  content: string,
  itemId: string
): Promise<void> {
  setProcessing("translate");
  try {
    const isChinese = containsChinese(content);
    const systemPrompt = isChinese
      ? "\u4f60\u662f\u4e00\u4e2a\u7ffb\u8bd1\u52a9\u624b\u3002\u5c06\u4ee5\u4e0b\u4e2d\u6587\u7ffb\u8bd1\u4e3a\u81ea\u7136\u6d41\u7545\u7684\u82f1\u6587\u3002\u53ea\u8fd4\u56de\u7ffb\u8bd1\u7ed3\u679c\u3002"
      : "\u4f60\u662f\u4e00\u4e2a\u7ffb\u8bd1\u52a9\u624b\u3002\u5c06\u4ee5\u4e0b\u5185\u5bb9\u7ffb\u8bd1\u4e3a\u81ea\u7136\u6d41\u7545\u7684\u4e2d\u6587\u3002\u53ea\u8fd4\u56de\u7ffb\u8bd1\u7ed3\u679c\u3002";
    const maxTokens = Math.max(content.length * 2, 500);
    const resultText = await callInfer(content, systemPrompt, maxTokens);
    setResultPopup({
      originalContent: content,
      resultText,
      actionType: "translate",
      itemId,
    });
  } catch (e) {
    console.error("[ai-actions] Translate failed:", e);
  } finally {
    setProcessing(null);
  }
}

/**
 * Summarize content into a numbered bullet-point list.
 */
export async function summarizeContent(
  content: string,
  itemId: string
): Promise<void> {
  setProcessing("summarize");
  try {
    const systemPrompt =
      "\u4f60\u662f\u4e00\u4e2a\u603b\u7ed3\u52a9\u624b\u3002\u5c06\u4ee5\u4e0b\u5185\u5bb9\u603b\u7ed3\u4e3a\u8981\u70b9\u5217\u8868\uff0c\u6bcf\u6761\u4ee5\u6570\u5b57\u7f16\u53f7\u3002\u4fdd\u6301\u7b80\u6d01\u51c6\u786e\u3002";
    const resultText = await callInfer(content, systemPrompt, 500);
    setResultPopup({
      originalContent: content,
      resultText,
      actionType: "summarize",
      itemId,
    });
  } catch (e) {
    console.error("[ai-actions] Summarize failed:", e);
  } finally {
    setProcessing(null);
  }
}

/**
 * Rewrite content in a specified style.
 * Available styles: formal, casual, concise, detailed, academic.
 */
export async function rewriteContent(
  content: string,
  itemId: string,
  style: string
): Promise<void> {
  setProcessing("rewrite");
  try {
    const styleDesc =
      REWRITE_STYLES[style] || REWRITE_STYLES["formal"];
    const systemPrompt = `\u4f60\u662f\u4e00\u4e2a\u6539\u5199\u52a9\u624b\u3002\u8bf7\u7528${styleDesc}\u6539\u5199\u4ee5\u4e0b\u5185\u5bb9\u3002\u4fdd\u6301\u6838\u5fc3\u610f\u601d\u4e0d\u53d8\u3002\u53ea\u8fd4\u56de\u6539\u5199\u7ed3\u679c\u3002`;
    const maxTokens = Math.max(content.length * 2, 500);
    const resultText = await callInfer(content, systemPrompt, maxTokens);
    setResultPopup({
      originalContent: content,
      resultText,
      actionType: "rewrite",
      itemId,
    });
  } catch (e) {
    console.error("[ai-actions] Rewrite failed:", e);
  } finally {
    setProcessing(null);
  }
}
