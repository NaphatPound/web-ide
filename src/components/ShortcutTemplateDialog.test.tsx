import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ShortcutTemplateDialog from "./ShortcutTemplateDialog";
import type { ShortcutEntry } from "../store/useIdeStore";

function makeTemplate(command: string): ShortcutEntry {
  return { id: "tpl", name: "My Template", command, type: "template" };
}

describe("ShortcutTemplateDialog", () => {
  it("renders an input for every unique variable", () => {
    render(
      <ShortcutTemplateDialog
        shortcut={makeTemplate("echo {{a}} {{b}} {{a}}")}
        onClose={() => {}}
        onSubmit={() => {}}
      />
    );
    expect(screen.getByTestId("template-input-a")).toBeDefined();
    expect(screen.getByTestId("template-input-b")).toBeDefined();
  });

  it("updates the preview as the user types", () => {
    render(
      <ShortcutTemplateDialog
        shortcut={makeTemplate("hello {{name}}")}
        onClose={() => {}}
        onSubmit={() => {}}
      />
    );
    fireEvent.change(screen.getByTestId("template-input-name"), {
      target: { value: "world" },
    });
    expect(screen.getByTestId("template-preview")).toHaveTextContent(
      "hello world"
    );
  });

  it("submits the filled command", () => {
    const onSubmit = vi.fn();
    render(
      <ShortcutTemplateDialog
        shortcut={makeTemplate("kubectl {{verb}} {{name}}")}
        onClose={() => {}}
        onSubmit={onSubmit}
      />
    );
    fireEvent.change(screen.getByTestId("template-input-verb"), {
      target: { value: "delete" },
    });
    fireEvent.change(screen.getByTestId("template-input-name"), {
      target: { value: "api-7" },
    });
    fireEvent.click(screen.getByTestId("template-send"));
    expect(onSubmit).toHaveBeenCalledWith("kubectl delete api-7");
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    render(
      <ShortcutTemplateDialog
        shortcut={makeTemplate("x {{a}}")}
        onClose={onClose}
        onSubmit={() => {}}
      />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("sends verbatim when the template has no variables", () => {
    const onSubmit = vi.fn();
    render(
      <ShortcutTemplateDialog
        shortcut={makeTemplate("just a plain prompt")}
        onClose={() => {}}
        onSubmit={onSubmit}
      />
    );
    const sendBtn = Array.from(
      document.querySelectorAll("button")
    ).find((b) => /send/i.test(b.textContent ?? ""));
    expect(sendBtn).toBeDefined();
    fireEvent.click(sendBtn as HTMLButtonElement);
    expect(onSubmit).toHaveBeenCalledWith("just a plain prompt");
  });
});
