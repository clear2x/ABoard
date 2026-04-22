import { Show, For, createSignal } from "solid-js";
import type { ClipboardItem } from "../stores/clipboard";
import { copyItemContent, copiedId } from "../stores/clipboard";
import { t } from "../stores/i18n";

function truncateText(text: string, maxLen: number = 120): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

function displayType(item: ClipboardItem): string {
  return item.ai_type || item.type;
}

/** Map content type to avatar config */
function typeAvatar(type: string): { letter: string; bg: string; color: string; icon?: string } {
  switch (type) {
    case "code":
      return { letter: "", bg: "bg-purple-50 dark:bg-purple-900/30", color: "text-purple-500 dark:text-purple-400", icon: "ph-code" };
    case "link":
      return { letter: "", bg: "bg-blue-50 dark:bg-blue-900/30", color: "text-blue-500 dark:text-blue-400", icon: "ph-link" };
    case "image":
      return { letter: "", bg: "bg-green-50 dark:bg-green-900/30", color: "text-green-500 dark:text-green-400", icon: "ph-image" };
    case "json":
      return { letter: "", bg: "bg-orange-50 dark:bg-orange-900/30", color: "text-orange-500 dark:text-orange-400", icon: "ph-brackets-curly" };
    case "xml":
      return { letter: "", bg: "bg-yellow-50 dark:bg-yellow-900/30", color: "text-yellow-600 dark:text-yellow-400", icon: "ph-brackets-curly" };
    case "text":
    default:
      return { letter: "T", bg: "bg-blue-100 dark:bg-blue-900/30", color: "text-blue-600 dark:text-blue-400" };
  }
}

interface Props {
  item: ClipboardItem;
  isSelected: boolean;
  showCheckbox?: boolean;
  checked?: boolean;
  grid?: boolean;
  timeline?: boolean;
  onSelect: (id: string) => void;
  onContextMenu: (e: MouseEvent, id: string, pinned: boolean) => void;
  onCopy?: (item: ClipboardItem) => void;
  onDelete?: (id: string) => void;
  onPin?: (id: string, pinned: boolean) => void;
}

export default function ClipboardItemCard(props: Props) {
  const [hovered, setHovered] = createSignal(false);
  const tags = () => props.item.ai_tags || [];
  const justCopied = () => copiedId() === props.item.id;
  const dtype = () => displayType(props.item);
  const avatar = () => typeAvatar(dtype());

  const handleCopy = async (e: MouseEvent) => {
    e.stopPropagation();
    await copyItemContent(props.item);
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    props.onDelete?.(props.item.id);
  };

  const handlePin = (e: MouseEvent) => {
    e.stopPropagation();
    props.onPin?.(props.item.id, props.item.pinned);
  };

  const handleDoubleClick = () => {
    copyItemContent(props.item);
  };

  // Timeline mode — reference-style card
  if (props.timeline) {
    return (
      <div
        class={`glass-card-ref flex-1 p-4 rounded-xl relative cursor-pointer ${props.isSelected ? "ring-2 ring-blue-500/50" : ""}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => props.onSelect(props.item.id)}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          props.onContextMenu(e, props.item.id, props.item.pinned);
        }}
      >
        <div class="flex items-start gap-3">
          {/* Type avatar */}
          <Show when={props.showCheckbox} fallback={
            <div class={`w-7 h-7 rounded-full ${avatar().bg} ${avatar().color} flex items-center justify-center shrink-0 font-bold text-sm`}>
              <Show when={avatar().icon} fallback={avatar().letter}>
                <i class={`ph ${avatar().icon}`} />
              </Show>
            </div>
          }>
            <input
              type="checkbox"
              checked={props.checked}
              onChange={() => props.onSelect(props.item.id)}
              class="mt-1 accent-blue-500 shrink-0"
            />
          </Show>

          {/* Content */}
          <div class="flex-1 min-w-0">
            {/* Text content */}
            <Show when={dtype() === "link"} fallback={
              <div>
                <Show
                  when={dtype() === "code"}
                  fallback={
                    <p class="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                      {truncateText(props.item.content)}
                    </p>
                  }
                >
                  <div class="font-mono text-sm p-3 rounded-lg border"
                    style={{
                      background: "rgba(255,255,255,0.2)",
                      color: "var(--color-text-secondary)",
                      "border-color": "rgba(255,255,255,0.3)",
                    }}
                  >
                    {truncateText(props.item.content, 200).split("\n").map((line, i) => (
                      <div classList={{ "pl-4": i > 0 && i < (props.item.content.split("\n").length - 1) }}>{line}</div>
                    ))}
                  </div>
                </Show>

                {/* Tags */}
                <Show when={tags().length > 0}>
                  <div class="flex gap-2 mt-2">
                    <For each={tags().slice(0, 4)}>
                      {(tag) => (
                        <span class="px-2 py-0.5 rounded-md text-[10px]"
                          style={{
                            background: "rgba(128,128,128,0.08)",
                            border: "1px solid rgba(128,128,128,0.15)",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          {tag}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            }>
              {/* Link content */}
              <div class="flex items-center gap-2 mb-2">
                <span class="text-sm text-blue-600 dark:text-blue-400 truncate">
                  {truncateText(props.item.content, 80)}
                </span>
              </div>
            </Show>
          </div>

          {/* Hover actions */}
          <Show when={hovered() && !props.showCheckbox}>
            <div class="flex items-center gap-2 shrink-0" style={{ color: "var(--color-text-muted)" }}>
              <button
                class="transition-colors"
                style={{ color: props.item.pinned ? "#facc15" : "var(--color-text-muted)" }}
                onClick={handlePin}
                title={props.item.pinned ? t("ctx.unpin") : t("ctx.pin")}
              >
                <i class={props.item.pinned ? "ph-fill ph-star text-yellow-400" : "ph ph-star hover:text-yellow-400"} />
              </button>
              <button class="transition-colors hover:text-gray-600" onClick={handleDelete} title={t("ctx.delete")}>
                <i class="ph ph-dots-three-vertical" />
              </button>
            </div>
          </Show>
        </div>

        {/* Copied feedback */}
        <Show when={justCopied()}>
          <div class="absolute inset-0 flex items-center justify-center rounded-xl pointer-events-none"
            style={{ background: "rgba(59, 130, 246, 0.15)", "backdrop-filter": "blur(2px)" }}
          >
            <span class="text-xs font-medium px-2 py-1 rounded-full" style={{ background: "var(--color-accent)", color: "#fff" }}>
              {t("ctx.copied")}
            </span>
          </div>
        </Show>
      </div>
    );
  }

  // Legacy mode (grid / fallback)
  return (
    <div
      class={`glass-card transition-smooth cursor-pointer hover-lift hover:border-[var(--color-border-hover)] p-3 relative
        ${props.isSelected ? "ring-2 ring-[var(--color-accent)]" : ""}
        ${props.showCheckbox && props.checked ? "bg-[var(--color-accent)]/10 border-[var(--color-accent)]/50" : ""}
      `}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => props.onSelect(props.item.id)}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        props.onContextMenu(e, props.item.id, props.item.pinned);
      }}
    >
      <div class="flex items-center justify-between mb-1">
        <Show when={props.showCheckbox}>
          <input type="checkbox" checked={props.checked} onChange={() => props.onSelect(props.item.id)}
            class="mr-2 accent-[var(--color-accent)] shrink-0" />
        </Show>
        <div class="flex items-center gap-1.5 overflow-hidden flex-1 min-w-0">
          {props.item.pinned && <span class="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />}
          <span class="text-xs px-2 py-0.5 rounded-full shrink-0" style={{
            background: "rgba(128,128,128,0.1)",
            color: "var(--color-text-muted)",
          }}>
            {dtype()}
          </span>
        </div>
        <span class="text-xs ml-2 shrink-0" style={{ color: "var(--color-text-muted)" }}>
          {new Date(props.item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <Show
        when={props.item.type === "image" && props.item.content.startsWith("data:")}
        fallback={
          <p class="break-all leading-relaxed" style={{ "font-size": "var(--font-body)", color: "var(--color-text-secondary)" }}>
            {truncateText(props.item.content)}
          </p>
        }
      >
        <div class="mt-1">
          <img src={props.item.content} alt="Clipboard image" class="clipboard-image-preview" loading="lazy" />
        </div>
      </Show>

      <Show when={justCopied()}>
        <div class="absolute inset-0 flex items-center justify-center rounded-[var(--radius-md)] pointer-events-none"
          style={{ background: "rgba(59, 130, 246, 0.15)", "backdrop-filter": "blur(2px)" }}
        >
          <span class="text-xs font-medium px-2 py-1 rounded-full" style={{ background: "var(--color-accent)", color: "#fff" }}>
            {t("ctx.copied")}
          </span>
        </div>
      </Show>
    </div>
  );
}
