import { Show } from "solid-js";
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
    case "text":
      return "bg-blue-500/20 text-blue-400";
    case "image":
      return "bg-green-500/20 text-green-400";
    case "file-paths":
      return "bg-purple-500/20 text-purple-400";
    default:
      return "bg-gray-500/20 text-gray-400";
  }
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

  return (
    <div
      class={`glass-card p-3 transition-smooth cursor-pointer hover:border-[var(--color-border-hover)] ${selectedClass()} ${batchHighlight()}`}
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
        <div class="flex items-center gap-1.5">
          {props.item.pinned && (
            <span class="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
          )}
          <span
            class={`text-xs px-2 py-0.5 rounded-[var(--radius-full)] ${typeBadgeClass(props.item.type)}`}
          >
            {props.item.type}
          </span>
        </div>
        <span class="text-xs" style={{ "font-size": "var(--font-label)", color: "var(--color-text-muted)" }}>
          {formatTimestamp(props.item.timestamp)}
        </span>
      </div>
      <p class="break-all leading-relaxed" style={{ "font-size": "var(--font-body)", color: "var(--color-text-secondary)" }}>
        {props.item.type === "image"
          ? "[Image]"
          : truncateText(props.item.content)}
      </p>
    </div>
  );
}
