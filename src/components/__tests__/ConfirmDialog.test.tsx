import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@solidjs/testing-library";
import ConfirmDialog from "../ConfirmDialog";

// Mock i18n and tauri
vi.mock("../../stores/i18n", () => ({
  t: (key: string) => {
    const map: Record<string, string> = {
      "dialog.cancel": "Cancel",
      "dialog.delete": "Delete",
    };
    return map[key] ?? key;
  },
  initLocale: vi.fn(),
  locale: () => "en",
}));

describe("ConfirmDialog", () => {
  it("renders title and message when open", () => {
    const { getByText } = render(() => (
      <ConfirmDialog
        open={true}
        title="Confirm Action"
        message="Are you sure?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    ));

    expect(getByText("Confirm Action")).toBeTruthy();
    expect(getByText("Are you sure?")).toBeTruthy();
  });

  it("renders nothing when closed", () => {
    const { queryByText } = render(() => (
      <ConfirmDialog
        open={false}
        title="Confirm Action"
        message="Are you sure?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    ));

    expect(queryByText("Confirm Action")).toBeNull();
  });

  it("uses default cancel and delete labels from i18n", () => {
    const { getByText } = render(() => (
      <ConfirmDialog
        open={true}
        title="Test"
        message="msg"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    ));

    expect(getByText("Cancel")).toBeTruthy();
    expect(getByText("Delete")).toBeTruthy();
  });

  it("uses custom labels when provided", () => {
    const { getByText } = render(() => (
      <ConfirmDialog
        open={true}
        title="Test"
        message="msg"
        confirmLabel="Remove"
        cancelLabel="Go Back"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    ));

    expect(getByText("Remove")).toBeTruthy();
    expect(getByText("Go Back")).toBeTruthy();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const onCancel = vi.fn();
    const { getByText } = render(() => (
      <ConfirmDialog
        open={true}
        title="Test"
        message="msg"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    ));

    fireEvent.click(getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    const { getByText } = render(() => (
      <ConfirmDialog
        open={true}
        title="Test"
        message="msg"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    ));

    fireEvent.click(getByText("Delete"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
