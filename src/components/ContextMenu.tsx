import { pinItem, unpinItem, deleteItems } from "../stores/clipboard";
import { onMount, onCleanup } from "solid-js";

interface Props {
  x: number;
  y: number;
  itemId: string;
  isPinned: boolean;
  onClose: () => void;
}

export default function ContextMenu(props: Props) {
  const handlePin = async () => {
    if (props.isPinned) {
      await unpinItem(props.itemId);
    } else {
      await pinItem(props.itemId);
    }
    props.onClose();
  };

  const handleDelete = async () => {
    await deleteItems([props.itemId]);
    props.onClose();
  };

  const handleClickOutside = (e: MouseEvent) => {
    props.onClose();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      props.onClose();
    }
  };

  onMount(() => {
    // Use setTimeout to avoid the current right-click event closing the menu immediately
    setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 0);
    document.addEventListener("keydown", handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener("click", handleClickOutside);
    document.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div
      class="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[140px] z-50"
      style={{ left: `${props.x}px`, top: `${props.y}px` }}
    >
      <button
        class="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer transition-colors"
        onClick={handlePin}
      >
        {props.isPinned ? "Unpin" : "Pin"}
      </button>
      <button
        class="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-700 cursor-pointer transition-colors"
        onClick={handleDelete}
      >
        Delete
      </button>
    </div>
  );
}
