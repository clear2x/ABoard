import { Show, For } from "solid-js";
import type { ClipboardItem } from "../stores/clipboard";

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function truncateText(text: string, maxLen: number = 100): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

function typeBadgeClass(type: string): string {
  switch (type) {
    case "code":
      return "bg-blue-500/20 text-blue-400";
    case "link":
      return "bg-green-500/20 text-green-400";
    case "json":
      return "bg-orange-500/20 text-orange-400";
    case "xml":
      return "bg-yellow-500/20 text-yellow-400";
    case "image":
      return "bg-purple-500/20 text-purple-400";
    case "text":
      return "bg-gray-500/20 text-gray-400";
    // Legacy content types (pre-AI)
    case "file-paths":
      return "bg-purple-500/20 text-purple-400";
    default:
      return "bg-gray-500/20 text-gray-400";
  }
}

/// Determine the display type: prefer AI-detected type, fall back to raw content type.
function displayType(item: ClipboardItem): string {
  return item.ai_type || item.type;
}

interface Props {
  item: ClipboardItem;
  isSelected: boolean;
  showCheckbox?: boolean;
  checked?: boolean;
  onSelect: (id: string) => void;
  onContextMenu: (e: MouseEvent, id: string, pinned: boolean) => void;
}

export default function ClipboardItemCard(props: Props) {
  const selectedClass = () =>
    props.isSelected ? "ring-2 ring-[var(--color-accent)]" : "";

  const batchHighlight = () =>
    props.showCheckbox && props.checked
      ? "bg-[var(--color-accent)]/10 border-[var(--color-accent)]/50"
      : "";

  const tags = () => props.item.ai_tags || [];

  return (
    <div
      class={`glass-card p-3 transition-smooth cursor-pointer hover-lift hover:border-[var(--color-border-hover)] ${selectedClass()} ${batchHighlight()}`}
      onClick={() => props.onSelect(props.item.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        props.onContextMenu(e, props.item.id, props.item.pinned);
      }}
    >
      <div class="flex items-center justify-between mb-1">
        <Show when={props.showCheckbox}>
          <input
            type="checkbox"
            checked={props.checked}
            onChange={() => props.onSelect(props.item.id)}
            class="mr-2 accent-[var(--color-accent)] flex-shrink-0"
          />
        </Show>
        <div class="flex items-center gap-1.5 overflow-hidden flex-1 min-w-0">
          {props.item.pinned && (
            <span class="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
          )}
          <span
            class={`text-xs px-2 py-0.5 rounded-[var(--radius-full)] flex-shrink-0 ${typeBadgeClass(displayType(props.item))}`}
          >
            {displayType(props.item)}
          </span>
          <Show when={tags().length > 0}>
            <div class="flex items-center gap-1 overflow-hidden min-w-0">
              <For each={tags().slice(0, 3)}>
                {(tag) => (
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[var(--color-text-muted)] whitespace-nowrap overflow-hidden text-ellipsis max-w-[80px]">
                    {tag}
                  </span>
                )}
              </For>
              <Show when={tags().length > 3}>
                <span class="text-[10px] px-1 py-0.5 text-[var(--color-text-muted)] flex-shrink-0">
                  +{tags().length - 3}
                </span>
              </Show>
            </div>
          </Show>
        </div>
        <span class="text-xs flex-shrink-0 ml-2" style={{ "font-size": "var(--font-label)", color: "var(--color-text-muted)" }}>
          {formatTimestamp(props.item.timestamp)}
        </span>
      </div>
      <p class="break-all leading-relaxed" style={{ "font-size": "var(--font-body)", color: "var(--color-text-secondary)" }}>
        {props.item.type === "image"
          ? "[Image]"
          : truncateText(props.item.content)}
      </p>
      <Show when={props.item.ai_summary}>
        <p
          class="mt-1 text-xs leading-relaxed line-clamp-2"
          style={{ color: "var(--color-text-muted)" }}
        >
          {props.item.ai_summary}
        </p>
      </Show>
    </div>
  );
}
