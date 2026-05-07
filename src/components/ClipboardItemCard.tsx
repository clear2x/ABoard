import { Show, For, createSignal, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import type { ClipboardItem } from "../stores/clipboard";
import { copyItemContent, copiedId, getItemContent } from "../stores/clipboard";
import { t } from "../stores/i18n";

export function truncateText(text: string, maxLen: number = 120): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

/** Highlight search matches in text. Returns a JSX fragment with matched parts wrapped in <mark>. */
function highlightText(text: string, query: string): JSX.Element {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return <>{text}</>;
  let regex: RegExp;
  try {
    regex = new RegExp(`(${escaped})`, "gi");
  } catch {
    return <>{text}</>;
  }
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

export function displayType(item: ClipboardItem): string {
  return item.ai_type || item.type;
}

/** Detect if content looks like markdown (US-010) */
export function isMarkdown(content: string): boolean {
  return /^(#|\*\*|\* |- |1\. |\[.*\]\(.*\)|```)/m.test(content);
}

/** Simple regex-based markdown rendering (no deps) (US-010) */
function renderMarkdown(text: string): string {
  let html = text
    // Headers: # text, ## text, ### text
    .replace(/^### (.+)$/gm, '<strong class="text-base">$1</strong>')
    .replace(/^## (.+)$/gm, '<strong class="text-lg">$1</strong>')
    .replace(/^(?!<strong>)# (.+)$/gm, '<strong class="text-xl">$1</strong>')
    // Inline code: `code`
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs font-mono">$1</code>')
    // Bold: **text**
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic: *text*
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // List items: - item
    .replace(/^- (.+)$/gm, '<span class="ml-3">&bull; $1</span>')
    // Ordered list: 1. item
    .replace(/^\d+\. (.+)$/gm, '<span class="ml-3">$&</span>');
  return html;
}

/** Map content type to avatar config */
export function typeAvatar(type: string): { letter: string; bg: string; color: string; icon?: string } {
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
  onDoubleClick?: () => void;
  "data-item-id"?: string;
}

export default function ClipboardItemCard(props: Props) {
  const [hovered, setHovered] = createSignal(false);
  const [resolvedSrc, setResolvedSrc] = createSignal<string | null>(null);
  const [videoThumb, setVideoThumb] = createSignal<string | null>(null);
  const [showVideoPlayer, setShowVideoPlayer] = createSignal(false);
  const tags = () => (props.item.ai_tags || []).filter((t) => t.length >= 2 && !/^[\s\p{P}\p{S}]+$/u.test(t));
  const justCopied = () => copiedId() === props.item.id;
  const dtype = () => displayType(props.item);
  const avatar = () => typeAvatar(dtype());
  const query = () => props.searchQuery ?? "";
  const isDuplicate = () => (props.item.ai_tags || []).includes("duplicate");

  // Resolve image content: check thumbnail first, then fallback to full content
  const imageSrc = () => {
    const c = props.item.content;
    if (resolvedSrc()) return resolvedSrc()!;
    if (c.startsWith("data:")) return c;
    return c;
  };

  onMount(() => {
    // Image: try thumbnail, then fallback to full content
    if (props.item.type === "image" && props.item.file_path) {
      const thumbPath = `thumbs/${props.item.id}.webp`;
      invoke<string>("read_data_file", { relativePath: thumbPath })
        .then((dataUrl) => {
          if (dataUrl) setResolvedSrc(dataUrl);
        })
        .catch(() => {
          // No thumbnail — load full content as before
          if (!props.item.content.startsWith("data:")) {
            getItemContent(props.item).then((dataUrl) => setResolvedSrc(dataUrl));
          }
        });
    }

    // Video: generate and load thumbnail
    if (props.item.type === "video" && props.item.file_path) {
      invoke<string>("generate_video_thumbnail", { itemId: props.item.id })
        .then((relPath) => {
          if (relPath) {
            setVideoThumb(`aboard-file://${relPath}`);
          }
        })
        .catch(() => {});
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
    if (props.onDoubleClick) {
      props.onDoubleClick();
    } else {
      copyItemContent(props.item);
    }
  };

  // Timeline mode — reference-style card matching ui.html
  if (props.timeline) {
    return (
      <div
        data-item-id={props.item.id}
        class={`glass-card p-4 rounded-xl relative cursor-pointer transition-all duration-150 min-w-0 overflow-hidden
          ${props.isSelected ? "outline-2 outline-offset-[-2px] outline-accent bg-accent-10 shadow-md" : "hover:bg-white/30"}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => props.onSelect(props.item.id)}
        onDblClick={handleDoubleClick}
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
              class="mt-1 accent-[var(--color-accent)] shrink-0"
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
              <Show when={videoThumb()} fallback={
                <div class="mt-1 flex items-center gap-2 bg-white/30 dark:bg-slate-700/30 rounded-lg p-3 border border-white/50 dark:border-white/10">
                  <i class="ph ph-video-camera text-2xl text-rose-400" />
                  <div class="flex-1 min-w-0">
                    <p class="text-xs text-gray-600 dark:text-gray-300 truncate">
                      {props.item.file_path ? props.item.file_path.split("/").pop() : "Video recording"}
                    </p>
                    <p class="text-[10px] text-gray-400">MP4</p>
                  </div>
                </div>
              }>
                <div class="mt-1 relative group cursor-pointer rounded-lg overflow-hidden border border-white/50 dark:border-white/10"
                  onClick={(e) => { e.stopPropagation(); setShowVideoPlayer(true); }}
                >
                  <img
                    src={videoThumb()!}
                    alt="Video thumbnail"
                    class="w-full max-h-[160px] object-cover"
                    loading="lazy"
                  />
                  <div class="absolute inset-0 flex items-center justify-center bg-black/20 opacity-80 group-hover:opacity-100 transition-opacity">
                    <div class="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center shadow-lg">
                      <i class="ph ph-play text-xl text-gray-700 ml-0.5" />
                    </div>
                  </div>
                </div>
              </Show>
            </Show>

            {/* Link content — with preview card matching ui.html */}
            <Show when={dtype() === "link"} fallback={
              <div>
                <Show
                  when={dtype() === "code"}
                  fallback={
                    <Show when={props.item.type !== "image" && props.item.type !== "video"}>
                      <Show
                        when={isMarkdown(props.item.content)}
                        fallback={
                          <p class="text-sm text-[var(--color-text-primary)] leading-relaxed break-anywhere">
                            {highlightText(truncateText(props.item.content), query())}
                          </p>
                        }
                      >
                        <div class="text-sm text-gray-700 dark:text-gray-200 leading-relaxed relative">
                          <span class="absolute top-0 right-0 text-[9px] bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1 rounded">MD</span>
                          <p class="pr-6 whitespace-pre-wrap break-words" innerHTML={renderMarkdown(truncateText(props.item.content, 200))} />
                        </div>
                      </Show>
                    </Show>
                  }
                >
                  <div class="font-mono text-sm text-gray-600 bg-white/30 dark:bg-slate-700/30 dark:text-gray-300 p-3 rounded-lg border border-white/50 dark:border-white/10">
                    {(() => {
                      const truncated = truncateText(props.item.content, 200);
                      const lines = truncated.split("\n");
                      return lines.map((line, i) => (
                        <div classList={{ "pl-4": i > 0 && i < (lines.length - 1) }}>{highlightText(line, query())}</div>
                      ));
                    })()}
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
          <div class={`shrink-0 flex items-center gap-2 text-gray-400 transition-opacity duration-150 ${hovered() && !props.showCheckbox ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
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

        {/* Dedup badge */}
        <Show when={isDuplicate()}>
          <span class="absolute top-2 right-2 text-[10px] bg-orange-100 text-orange-600 px-1 rounded">
            {t("ctx.duplicate")}
          </span>
        </Show>

        {/* Copied feedback */}
        <Show when={justCopied()}>
          <div class="absolute inset-0 flex items-center justify-center rounded-xl pointer-events-none bg-accent-15 backdrop-blur-[2px]">
            <span class="text-xs font-medium px-2 py-1 rounded-full bg-accent text-white">
              {t("ctx.copied")}
            </span>
          </div>
        </Show>

        {/* Video player overlay */}
        <Show when={showVideoPlayer()}>
          <div class="absolute inset-0 z-50 flex items-center justify-center rounded-xl bg-black/80 backdrop-blur-sm"
            onClick={(e) => { e.stopPropagation(); setShowVideoPlayer(false); }}
          >
            <div class="w-full max-w-[320px]" onClick={(e) => e.stopPropagation()}>
              <video
                src={props.item.file_path ? `aboard-file://${props.item.file_path}` : ""}
                controls
                autoplay
                class="w-full rounded-lg"
                style={{ "max-height": "240px" }}
              />
              <button class="mt-2 text-xs text-white/70 hover:text-white transition-colors"
                onClick={(e) => { e.stopPropagation(); setShowVideoPlayer(false); }}
              >
                {t("window.close")}
              </button>
            </div>
          </div>
        </Show>
      </div>
    );
  }

  // Legacy mode (grid / fallback)
  return (
    <div
      data-item-id={props.item.id}
      class={`glass-card transition-all duration-150 cursor-pointer hover-lift p-3 relative
        ${props.isSelected ? "outline-2 outline-offset-[-2px] outline-accent bg-accent-10 shadow-md" : "hover:bg-white/30"}
        ${props.showCheckbox && props.checked ? "bg-accent-10 border-accent-50" : ""}
      `}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => props.onSelect(props.item.id)}
      onDblClick={handleDoubleClick}
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
          <p class="break-anywhere leading-relaxed text-sm text-[var(--color-text-primary)]">
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

      {/* Dedup badge */}
      <Show when={isDuplicate()}>
        <span class="absolute top-2 right-2 text-[10px] bg-orange-100 text-orange-600 px-1 rounded">
          {t("ctx.duplicate")}
        </span>
      </Show>

      <Show when={justCopied()}>
        <div class="absolute inset-0 flex items-center justify-center rounded-xl pointer-events-none bg-accent-15 backdrop-blur-[2px]">
          <span class="text-xs font-medium px-2 py-1 rounded-full bg-accent text-white">
            {t("ctx.copied")}
          </span>
        </div>
      </Show>

      {/* Video player overlay */}
      <Show when={showVideoPlayer()}>
        <div class="absolute inset-0 z-50 flex items-center justify-center rounded-xl bg-black/80 backdrop-blur-sm"
          onClick={(e) => { e.stopPropagation(); setShowVideoPlayer(false); }}
        >
          <div class="w-full max-w-[280px]" onClick={(e) => e.stopPropagation()}>
            <video
              src={props.item.file_path ? `aboard-file://${props.item.file_path}` : ""}
              controls
              autoplay
              class="w-full rounded-lg"
              style={{ "max-height": "200px" }}
            />
            <button class="mt-2 text-xs text-white/70 hover:text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); setShowVideoPlayer(false); }}
            >
              {t("window.close")}
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
