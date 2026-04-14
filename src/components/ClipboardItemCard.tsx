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
}

export default function ClipboardItemCard(props: Props) {
  return (
    <div class="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 hover:border-gray-600/50 transition-colors">
      <div class="flex items-center justify-between mb-1">
        <span
          class={`text-xs px-2 py-0.5 rounded-full ${typeBadgeClass(props.item.type)}`}
        >
          {props.item.type}
        </span>
        <span class="text-xs text-gray-500">
          {formatTimestamp(props.item.timestamp)}
        </span>
      </div>
      <p class="text-sm text-gray-300 break-all leading-relaxed">
        {props.item.type === "image"
          ? "[Image]"
          : truncateText(props.item.content)}
      </p>
    </div>
  );
}
