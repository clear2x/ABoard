import { For, Show } from "solid-js";
import { items } from "../stores/clipboard";
import ClipboardItemCard from "./ClipboardItemCard";

export default function ClipboardList() {
  return (
    <div class="flex flex-col gap-2 overflow-y-auto max-h-[450px] p-2">
      <Show
        when={items().length > 0}
        fallback={
          <div class="flex items-center justify-center h-32 text-gray-500 text-sm">
            No clipboard items yet. Copy something!
          </div>
        }
      >
        <For each={items()}>
          {(item) => <ClipboardItemCard item={item} />}
        </For>
      </Show>
    </div>
  );
}
