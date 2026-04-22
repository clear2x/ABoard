import { searchQuery, setSearchQuery, searchHistory, semanticSearchHistory, loadHistory } from "../stores/clipboard";
import { t } from "../stores/i18n";
import { createSignal, onCleanup } from "solid-js";

export default function SearchBar() {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const [semanticMode, setSemanticMode] = createSignal(false);

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
      if (semanticMode()) {
        semanticSearchHistory(value);
      } else {
        searchHistory(value);
      }
    }, semanticMode() ? 500 : 300);
  };

  const toggleMode = () => {
    setSemanticMode(!semanticMode());
    // Re-run search with current query in new mode
    const q = searchQuery();
    if (q.trim()) {
      if (semanticMode()) {
        semanticSearchHistory(q);
      } else {
        searchHistory(q);
      }
    }
  };

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  return (
    <div class="relative flex-1 flex items-center gap-1.5">
      <div class="relative flex-1">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none" style={{ color: "var(--color-text-muted)" }}>
          &#x1F50D;
        </span>
        <input
          type="text"
          value={searchQuery()}
          onInput={handleInput}
          placeholder={semanticMode() ? t("search.semantic") : t("search.placeholder")}
          class="glass-subtle w-full border rounded-[var(--radius-md)] pl-9 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-smooth"
          style={{ "font-size": "var(--font-body)", color: "var(--color-text-secondary)", "border-color": "var(--color-border)" }}
        />
      </div>
      <button
        class="px-2 py-1.5 text-xs rounded-[var(--radius-sm)] transition-smooth flex-shrink-0"
        style={{
          "background-color": semanticMode() ? "var(--color-accent)" : "var(--color-bg-card)",
          color: semanticMode() ? "var(--color-text-primary)" : "var(--color-text-muted)",
          border: "1px solid var(--color-border)",
        }}
        onClick={toggleMode}
        title={semanticMode() ? "AI-powered semantic search" : "Keyword search"}
      >
        AI
      </button>
    </div>
  );
}
