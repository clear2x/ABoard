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
    <div class="relative flex-1">
      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none" style={{ color: "var(--color-text-muted)" }}>
          &#x1F50D;
        </span>
        <input
          type="text"
          value={searchQuery()}
          onInput={handleInput}
          placeholder="Search history..."
          class="glass-subtle w-full border rounded-[var(--radius-md)] pl-9 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-smooth"
          style={{ "font-size": "var(--font-body)", color: "var(--color-text-secondary)", "border-color": "var(--color-border)" }}
        />
      </div>
    </div>
  );
}
