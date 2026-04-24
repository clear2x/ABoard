import { Show, onMount, onCleanup } from "solid-js";

interface Props {
  src: string;
  onClose: () => void;
}

export default function ImagePreview(props: Props) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") props.onClose();
  };

  onMount(() => document.addEventListener("keydown", handleKeyDown));
  onCleanup(() => document.removeEventListener("keydown", handleKeyDown));

  return (
    <Show when={props.src}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
      >
        <div class="relative max-w-[90vw] max-h-[90vh] animate-zoom-in">
          <button
            class="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white/90 dark:bg-gray-800/90 text-gray-600 dark:text-gray-300 flex items-center justify-center shadow-lg hover:bg-white transition-colors z-10"
            onClick={props.onClose}
          >
            <i class="ph ph-x text-sm" />
          </button>
          <img
            src={props.src}
            alt="Preview"
            class="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
          />
        </div>
      </div>
    </Show>
  );
}
