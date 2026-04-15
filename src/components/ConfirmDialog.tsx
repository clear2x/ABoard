import { Show, createEffect, on } from "solid-js";

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
        class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
        onClick={handleBackdropClick}
      >
        <div class="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 max-w-sm mx-auto">
          <h2 class="text-lg font-semibold text-white mb-2">{props.title}</h2>
          <p class="text-sm text-gray-400 mb-6">{props.message}</p>
          <div class="flex justify-end gap-3">
            <button
              ref={cancelButtonRef}
              class="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
              onClick={props.onCancel}
            >
              {props.cancelLabel ?? "Cancel"}
            </button>
            <button
              class="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"
              onClick={props.onConfirm}
            >
              {props.confirmLabel ?? "Delete"}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
