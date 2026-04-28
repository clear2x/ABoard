import { Show, For, createSignal, onMount } from "solid-js";
import type { ClipboardItem } from "../stores/clipboard";
import { copyItemContent, copiedId, getItemContent } from "../stores/clipboard";
import { t } from "../stores/i18n";

function truncateText(text: string, maxLen: number = 120): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

/** Highlight search matches in text. Returns a JSX fragment with matched parts wrapped in <mark>. */
function highlightText(text: string, query: string): JSX.Element {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  if (parts.length <= 1) return <>{text}</>;
  const lowerQuery = query.toLowerCase();
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === lowerQuery ? (
          <mark class="bg-yellow-200 dark:bg-yellow-800 rounded-[2px] px-[1px]">{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function displayType(item: ClipboardItem): string {
  return item.ai_type || item.type;
}

/** Map content type to avatar config */
function typeAvatar(type: string): { letter: string; bg: string; color: string; icon?: string } {
  switch (type) {
    case "code":
      return { letter: "", bg: "bg-purple-50", color: "text-purple-500", icon: "ph-code" };
    case "link":
      return { letter: "", bg: "bg-blue-50", color: "text-blue-500", icon: "ph-link" };
    case "image":
      return { letter: "", bg: "bg-green-50", color: "text-green-500", icon: "ph-image" };
    case "video":
      return { letter: "", bg: "bg-rose-50", color: "text-rose-500", icon: "ph-video-camera" };
    case "file-paths":
      return { letter: "", bg: "bg-amber-50", color: "text-amber-600", icon: "ph-file" };
    case "json":
      return { letter: "", bg: "bg-orange-50", color: "text-orange-500", icon: "ph-brackets-curly" };
    case "xml":
      return { letter: "", bg: "bg-yellow-50", color: "text-yellow-600", icon: "ph-brackets-curly" };
    case "text":
    default:
      return { letter: "T", bg: "bg-blue-100", color: "text-blue-600" };
  }
}

interface Props {
  item: ClipboardItem;
  isSelected: boolean;
  showCheckbox?: boolean;
  checked?: boolean;
  grid?: boolean;
  timeline?: boolean;
  searchQuery?: string;
  onSelect: (id: string) => void;
  onContextMenu: (e: MouseEvent, id: string, pinned: boolean) => void;
  onCopy?: (item: ClipboardItem) => void;
  onDelete?: (id: string) => void;
  onPin?: (id: string, pinned: boolean) => void;
  onImageClick?: (src: string) => void;
}

export default function ClipboardItemCard(props: Props) {
  const [hovered, setHovered] = createSignal(false);
  const [resolvedSrc, setResolvedSrc] = createSignal<string | null>(null);
  const tags = () => (props.item.ai_tags || []).filter((t) => t.length >= 2 && !/^[\s\p{P}\p{S}]+$/u.test(t));
  const justCopied = () => copiedId() === props.item.id;
  const dtype = () => displayType(props.item);
  const avatar = () => typeAvatar(dtype());
  const query = () => props.searchQuery ?? "";

  // Resolve image content: if file_path exists, load from backend
  const imageSrc = () => {
    const c = props.item.content;
    if (c.startsWith("data:")) return c;
    if (resolvedSrc()) return resolvedSrc()!;
    return c;
  };

  onMount(() => {
    if (props.item.type === "image" && props.item.file_path && !props.item.content.startsWith("data:")) {
      getItemContent(props.item).then((dataUrl) => setResolvedSrc(dataUrl));
    }
  });

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

  // Timeline mode — reference-style card matching ui.html
  if (props.timeline) {
    return (
      <div
        class={`glass-card flex-1 p-4 rounded-xl relative cursor-pointer transition-all duration-150
          ${props.isSelected ? "ring-2 ring-blue-500 bg-blue-50/60 dark:bg-blue-900/20 shadow-sm" : "hover:bg-white/30"}`}
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
            <div class={`w-7 h-7 rounded-full ${avatar().bg} ${avatar().color} flex items-center justify-center shrink-0 font-bold text-sm border border-white/50 shadow-sm`}>
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
            {/* Image preview */}
            <Show when={props.item.type === "image"}>
              <div class="mt-1">
                <img
                  src={imageSrc()}
                  alt="Clipboard image"
                  class="max-w-full max-h-[120px] rounded-lg object-contain border border-white/50 dark:border-white/10 cursor-pointer hover:opacity-90 transition-opacity"
                  loading="lazy"
                  onClick={(e) => {
                    e.stopPropagation();
                    const src = imageSrc();
                    if (src) props.onImageClick?.(src);
                  }}
                />
              </div>
            </Show>

            {/* Video preview */}
            <Show when={props.item.type === "video"}>
              <div class="mt-1 flex items-center gap-2 bg-white/30 dark:bg-slate-700/30 rounded-lg p-3 border border-white/50 dark:border-white/10">
                <i class="ph ph-video-camera text-2xl text-rose-400" />
                <div class="flex-1 min-w-0">
                  <p class="text-xs text-gray-600 dark:text-gray-300 truncate">
                    {props.item.file_path ? props.item.file_path.split("/").pop() : "Video recording"}
                  </p>
                  <p class="text-[10px] text-gray-400">MP4</p>
                </div>
              </div>
            </Show>

            {/* Link content — with preview card matching ui.html */}
            <Show when={dtype() === "link"} fallback={
              <div>
                <Show
                  when={dtype() === "code"}
                  fallback={
                    <Show when={props.item.type !== "image" && props.item.type !== "video"}>
                      <p class="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                        {highlightText(truncateText(props.item.content), query())}
                      </p>
                    </Show>
                  }
                >
                  <div class="font-mono text-sm text-gray-600 bg-white/30 dark:bg-slate-700/30 dark:text-gray-300 p-3 rounded-lg border border-white/50 dark:border-white/10">
                    {truncateText(props.item.content, 200).split("\n").map((line, i) => (
                      <div classList={{ "pl-4": i > 0 && i < (props.item.content.split("\n").length - 1) }}>{highlightText(line, query())}</div>
                    ))}
                  </div>
                </Show>

                {/* Tags — matching ui.html */}
                <Show when={tags().length > 0}>
                  <div class="flex gap-2 mt-2">
                    <For each={tags().slice(0, 4)}>
                      {(tag) => (
                        <span class="px-2 py-0.5 bg-gray-100/50 border border-gray-200 text-gray-500 rounded-md text-[10px] dark:bg-gray-700/30 dark:border-gray-600 dark:text-gray-400">
                          {tag}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>

                {/* AI Summary */}
                <Show when={props.item.ai_summary && props.item.ai_summary.trim().length > 0}>
                  <p class="text-xs text-gray-400 truncate mt-1">
                    {truncateText(props.item.ai_summary!, 80)}
                  </p>
                </Show>
              </div>
            }>
              {/* Link card matching ui.html */}
              <div class="flex items-center gap-2 mb-3">
                <span class="text-sm text-blue-600 dark:text-blue-400 truncate">
                  {highlightText(truncateText(props.item.content, 80), query())}
                </span>
              </div>
              <div class="bg-white/40 border border-white/60 rounded-lg p-3 flex gap-3 items-center dark:bg-slate-700/30 dark:border-white/10">
                <div class="flex-1">
                  <div class="text-sm font-bold text-gray-800 dark:text-gray-100 mb-1">
                    {props.item.content.replace(/https?:\/\//, "").split("/")[0]}
                  </div>
                  <div class="text-xs text-gray-500 line-clamp-2">
                    {highlightText(truncateText(props.item.content), query())}
                  </div>
                </div>
              </div>
            </Show>
          </div>

          {/* Hover actions — CSS opacity transition, always rendered */}
          <div class={`flex items-center gap-2 text-gray-400 transition-opacity duration-150 ${hovered() && !props.showCheckbox ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
              <button
                class="transition-colors"
                onClick={handlePin}
                title={props.item.pinned ? t("ctx.unpin") : t("ctx.pin")}
              >
                <i class={props.item.pinned ? "ph-fill ph-star text-yellow-400" : "ph ph-star hover:text-yellow-400"} />
              </button>
              <button class="transition-colors hover:text-blue-500" onClick={handleCopy} title={t("ctx.copy")}>
                <i class="ph ph-copy" />
              </button>
              <button class="transition-colors hover:text-red-500" onClick={handleDelete} title={t("ctx.delete")}>
                <i class="ph ph-trash" />
              </button>
          </div>
        </div>

        {/* Copied feedback */}
        <Show when={justCopied()}>
          <div class="absolute inset-0 flex items-center justify-center rounded-xl pointer-events-none bg-blue-500/15 backdrop-blur-[2px]">
            <span class="text-xs font-medium px-2 py-1 rounded-full bg-blue-500 text-white">
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
      class={`glass-card transition-all duration-150 cursor-pointer hover-lift p-3 relative
        ${props.isSelected ? "ring-2 ring-blue-500 bg-blue-50/60 shadow-sm" : "hover:bg-white/30"}
        ${props.showCheckbox && props.checked ? "bg-blue-500/10 border-blue-500/50" : ""}
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
            class="mr-2 accent-blue-500 shrink-0" />
        </Show>
        <div class="flex items-center gap-1.5 overflow-hidden flex-1 min-w-0">
          {props.item.pinned && <span class="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />}
          <span class="text-xs px-2 py-0.5 rounded-full shrink-0 bg-gray-100/50 text-gray-500">
            {dtype()}
          </span>
        </div>
        <span class="text-xs ml-2 shrink-0 text-gray-400">
          {new Date(props.item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <Show
        when={props.item.type === "image"}
        fallback={
          <p class="break-all leading-relaxed text-sm text-gray-700">
            {highlightText(truncateText(props.item.content), query())}
          </p>
        }
      >
        <div class="mt-1">
          <img src={imageSrc()} alt="Clipboard image" class="clipboard-image-preview cursor-pointer hover:opacity-90 transition-opacity" loading="lazy"
            onClick={(e) => { e.stopPropagation(); const src = imageSrc(); if (src) props.onImageClick?.(src); }}
          />
        </div>
      </Show>

      {/* AI Summary */}
      <Show when={props.item.ai_summary && props.item.ai_summary.trim().length > 0}>
        <p class="text-xs text-gray-400 truncate mt-1">
          {truncateText(props.item.ai_summary!, 80)}
        </p>
      </Show>

      <Show when={justCopied()}>
        <div class="absolute inset-0 flex items-center justify-center rounded-xl pointer-events-none bg-blue-500/15 backdrop-blur-[2px]">
          <span class="text-xs font-medium px-2 py-1 rounded-full bg-blue-500 text-white">
            {t("ctx.copied")}
          </span>
        </div>
      </Show>
    </div>
  );
}
