import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

/// AI action result data passed to the result popup.
export interface AiActionResult {
  originalContent: string;
  resultText: string;
  actionType: "translate" | "summarize" | "rewrite" | "format" | "error";
  itemId: string;
  isValid?: boolean;
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
  formal: "正式风格：使用书面语言，避免口语化表达",
  casual: "随意风格：使用轻松口语化表达，像朋友聊天",
  concise: "简洁风格：去除冗余，用最少的文字传达核心意思",
  detailed: "详细风格：展开描述，增加细节和解释",
  academic: "学术风格：使用学术语言，严谨的逻辑和术语",
};

export { REWRITE_STYLES };

// --- Helper ---

function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

/**
 * Call the AI inference backend via Tauri command.
 * Returns the result text, or throws with a user-friendly error.
 */
async function callInfer(
  prompt: string,
  systemPrompt: string,
  maxTokens: number
): Promise<string> {
  try {
    const response = await invoke<InferenceAutoResponse>("ai_infer_auto", {
      request: {
        prompt,
        system_prompt: systemPrompt,
        max_tokens: maxTokens,
        temperature: 0.7,
      },
    });
    return response.response.text;
  } catch (e: unknown) {
    const errMsg = String(e);

    // Provide user-friendly error messages
    if (errMsg.includes("not available")) {
      throw new Error(
        containsChinese(prompt)
          ? "AI 未配置或不可用。请在设置中配置 AI 提供商（如 Ollama）后再试。"
          : "AI not configured or unavailable. Please set up an AI provider (e.g. Ollama) in Settings."
      );
    }
    if (errMsg.includes("timed out") || errMsg.includes("timeout")) {
      throw new Error(
        containsChinese(prompt)
          ? "AI 请求超时，请检查 AI 服务是否正常运行。"
          : "AI request timed out. Please check if the AI service is running."
      );
    }
    if (errMsg.includes("connection") || errMsg.includes("ECONNREFUSED")) {
      throw new Error(
        containsChinese(prompt)
          ? "无法连接到 AI 服务。请确认 Ollama 或 llama.cpp 服务已启动。"
          : "Cannot connect to AI service. Make sure Ollama or llama.cpp is running."
      );
    }

    throw new Error(
      `AI error: ${errMsg}`
    );
  }
}

// --- Public API ---

/**
 * Translate content: auto-detect language direction.
 */
export async function translateContent(
  content: string,
  itemId: string
): Promise<void> {
  setProcessing("translate");
  try {
    const isChinese = containsChinese(content);
    const systemPrompt = isChinese
      ? "你是一个翻译助手。将以下中文翻译为自然流畅的英文。只返回翻译结果。"
      : "你是一个翻译助手。将以下内容翻译为自然流畅的中文。只返回翻译结果。";
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
    setResultPopup({
      originalContent: content,
      resultText: String(e),
      actionType: "error",
      itemId,
    });
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
      "你是一个总结助手。将以下内容总结为要点列表，每条以数字编号。保持简洁准确。";
    const resultText = await callInfer(content, systemPrompt, 500);
    setResultPopup({
      originalContent: content,
      resultText,
      actionType: "summarize",
      itemId,
    });
  } catch (e) {
    console.error("[ai-actions] Summarize failed:", e);
    setResultPopup({
      originalContent: content,
      resultText: String(e),
      actionType: "error",
      itemId,
    });
  } finally {
    setProcessing(null);
  }
}

/**
 * Rewrite content in a specified style.
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
    const systemPrompt = `你是一个改写助手。请用${styleDesc}改写以下内容。保持核心意思不变。只返回改写结果。`;
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
    setResultPopup({
      originalContent: content,
      resultText: String(e),
      actionType: "error",
      itemId,
    });
  } finally {
    setProcessing(null);
  }
}
