import { searchQuery, setSearchQuery, searchHistory, loadHistory } from "../stores/clipboard";
import { onCleanup } from "solid-js";

export default function SearchBar() {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const handleInput = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    setSearchQuery(value);

    if (debounceTimer) clearTimeout(debounceTimer);

    if (!value.trim()) {
      loadHistory();
      return;
    }

    debounceTimer = setTimeout(() => {
      searchHistory(value);
    }, 300);
  };

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  return (
    <div class="relative px-2 pb-2">
      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">
          &#x1F50D;
        </span>
        <input
          type="text"
          value={searchQuery()}
          onInput={handleInput}
          placeholder="Search history..."
          class="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-300 placeholder-gray-500 focus:outline-none focus:border-gray-600/50 transition-colors"
        />
      </div>
    </div>
  );
}
