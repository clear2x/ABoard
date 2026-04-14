import { createSignal } from "solid-js";
import { listen } from "@tauri-apps/api/event";

export interface ClipboardItem {
  id: string;
  type: "text" | "image" | "file-paths";
  content: string;
  hash: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

/// Maximum number of items kept in the frontend store.
/// Prevents unbounded memory growth from long-running sessions (T-01-07).
const MAX_ITEMS = 100;

// Items stored newest-first
const [items, setItems] = createSignal<ClipboardItem[]>([]);
export { items, setItems };

// Deduplication: check hash before adding
export function addItem(item: ClipboardItem) {
  setItems((prev) => {
    // Skip if hash already exists (extra frontend dedup safety)
    if (prev.some((i) => i.hash === item.hash)) return prev;
    // Add to front, cap at MAX_ITEMS
    const updated = [item, ...prev];
    if (updated.length > MAX_ITEMS) {
      return updated.slice(0, MAX_ITEMS);
    }
    return updated;
  });
}

let unlistenFn: (() => void) | null = null;

/// Start listening to Tauri clipboard events.
/// Call once from App's onMount. Safe to call multiple times (idempotent).
export async function startClipboardListener() {
  if (unlistenFn) return; // Already listening
  unlistenFn = await listen<ClipboardItem>("clipboard-update", (event) => {
    addItem(event.payload);
  });
}

export function stopClipboardListener() {
  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
  }
}
