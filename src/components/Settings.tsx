import { theme, setTheme, type ThemeMode } from "../stores/theme";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "dark", label: "深色" },
  { value: "light", label: "浅色" },
];

export default function Settings() {
  return (
    <div class="space-y-4">
      <h2 class="text-base font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
        Settings
      </h2>

      {/* Theme section */}
      <div>
        <label
          class="text-xs font-medium mb-2 block"
          style={{ color: "var(--color-text-muted)" }}
        >
          Theme
        </label>
        <div class="flex gap-1">
          {THEME_OPTIONS.map((opt) => (
            <button
              class="px-3 py-1.5 text-xs rounded-[var(--radius-sm)] transition-smooth"
              style={{
                "background-color":
                  theme() === opt.value
                    ? "var(--color-accent)"
                    : "var(--color-bg-card)",
                color:
                  theme() === opt.value
                    ? "var(--color-text-primary)"
                    : "var(--color-text-secondary)",
                border: "1px solid var(--color-border)",
              }}
              onClick={() => setTheme(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Shortcuts info */}
      <div>
        <label
          class="text-xs font-medium mb-2 block"
          style={{ color: "var(--color-text-muted)" }}
        >
          Shortcuts
        </label>
        <div class="space-y-1.5">
          {[
            { key: "Cmd+Shift+V", desc: "Toggle floating popup" },
            { key: "Cmd+Shift+J", desc: "Quick cycle paste" },
            { key: "Cmd+P", desc: "Pin/Unpin selected item" },
            { key: "Delete", desc: "Delete selected item" },
          ].map((s) => (
            <div class="flex items-center justify-between text-xs">
              <span style={{ color: "var(--color-text-secondary)" }}>{s.desc}</span>
              <kbd
                class="px-1.5 py-0.5 rounded text-[10px]"
                style={{
                  "background-color": "var(--color-bg-card)",
                  color: "var(--color-text-muted)",
                  border: "1px solid var(--color-border)",
                }}
              >
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>

      {/* About */}
      <div>
        <label
          class="text-xs font-medium mb-2 block"
          style={{ color: "var(--color-text-muted)" }}
        >
          About
        </label>
        <p class="text-xs" style={{ color: "var(--color-text-secondary)" }}>
          ABoard v0.1.0
        </p>
        <p class="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
          Smart clipboard manager with AI
        </p>
      </div>
    </div>
  );
}
