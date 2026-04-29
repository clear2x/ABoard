import { Show, createEffect, on } from "solid-js";
import { t } from "../stores/i18n";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog(props: ConfirmDialogProps) {
  let cancelButtonRef: HTMLButtonElement | undefined;

  createEffect(
    on(
      () => props.open,
      (isOpen) => {
        if (isOpen) {
          // Focus cancel button after dialog opens
          setTimeout(() => cancelButtonRef?.focus(), 0);
        }
      }
    )
  );

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      props.onCancel();
    }
  };

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
        onClick={handleBackdropClick}
      >
        <div class="glass-card p-6 max-w-sm mx-auto" style={{ "border-radius": "var(--radius-lg)", "box-shadow": "var(--shadow-elevated)" }}>
          <h2 class="text-lg font-semibold text-white mb-2">{props.title}</h2>
          <p class="text-sm mb-6 text-gray-400">{props.message}</p>
          <div class="flex justify-end gap-3">
            <button
              ref={cancelButtonRef}
              class="px-4 py-2 text-sm rounded-[var(--radius-md)] transition-smooth border bg-white/50 text-gray-600 border-white/80 dark:border-white/10"
              onClick={props.onCancel}
            >
              {props.cancelLabel ?? t("dialog.cancel")}
            </button>
            <button
              class="px-4 py-2 text-sm rounded-[var(--radius-md)] transition-smooth text-white hover:opacity-80"
              style={{ background: "var(--color-destructive)" }}
              onClick={props.onConfirm}
            >
              {props.confirmLabel ?? t("dialog.delete")}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
