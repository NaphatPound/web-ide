import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Sidebar from "./Sidebar";
import { useIdeStore } from "../store/useIdeStore";

beforeEach(() => {
  useIdeStore.setState({
    mode: "vs_code",
    files: {
      "proj/README.md": {
        path: "proj/README.md",
        language: "markdown",
        content: "# hi",
      },
    },
    activeFile: "proj/README.md",
    openFiles: ["proj/README.md"],
    rootName: "proj",
    rootPath: "/Users/me/proj",
    terminals: [{ id: "t1", title: "Term 1" }],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Sidebar create file / folder", () => {
  it("New File shows an inline input focused on the default name", () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByTestId("new-file"));
    const input = screen.getByTestId("create-input") as HTMLInputElement;
    expect(input.value).toBe("newfile.ts");
    expect(document.activeElement).toBe(input);
  });

  it("Escape cancels the inline input", () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByTestId("new-file"));
    const input = screen.getByTestId("create-input");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByTestId("create-input")).toBeNull();
  });

  it("submitting a file POSTs to /__writeFile and opens the new file", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    render(<Sidebar />);
    fireEvent.click(screen.getByTestId("new-file"));
    const input = screen.getByTestId("create-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "src/hooks/useFoo.ts" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/__writeFile",
        expect.objectContaining({ method: "POST" })
      );
    });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({
      rootPath: "/Users/me/proj",
      relPath: "src/hooks/useFoo.ts",
      content: "",
    });

    await waitFor(() => {
      const s = useIdeStore.getState();
      expect(s.files["proj/src/hooks/useFoo.ts"]).toBeDefined();
      expect(s.activeFile).toBe("proj/src/hooks/useFoo.ts");
    });
  });

  it("submitting a folder POSTs /__createFolder then seeds a .gitkeep", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    render(<Sidebar />);
    fireEvent.click(screen.getByTestId("new-folder"));
    const input = screen.getByTestId("create-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "docs/guides" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
    const [first, second] = fetchSpy.mock.calls;
    expect(first[0]).toBe("/__createFolder");
    expect(second[0]).toBe("/__writeFile");
    const writeBody = JSON.parse((second[1] as RequestInit).body as string);
    expect(writeBody.relPath).toBe("docs/guides/.gitkeep");

    await waitFor(() => {
      expect(
        useIdeStore.getState().files["proj/docs/guides/.gitkeep"]
      ).toBeDefined();
    });
  });

  it("rejects invalid paths without making a request", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    render(<Sidebar />);
    fireEvent.click(screen.getByTestId("new-file"));
    const input = screen.getByTestId("create-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "../escape.ts" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByTestId("create-error")).toHaveTextContent(/Invalid/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects paths that already exist in the store", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    render(<Sidebar />);
    fireEvent.click(screen.getByTestId("new-file"));
    const input = screen.getByTestId("create-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "README.md" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByTestId("create-error")).toHaveTextContent(/already exists/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("disables +File / +Folder when no folder is open", () => {
    useIdeStore.setState({ rootPath: null, rootName: null });
    render(<Sidebar />);
    expect((screen.getByTestId("new-file") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("new-folder") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Sidebar right-click rename / delete", () => {
  beforeEach(() => {
    useIdeStore.setState({
      files: {
        "proj/README.md": {
          path: "proj/README.md",
          language: "markdown",
          content: "# hi",
        },
        "proj/src/a.ts": {
          path: "proj/src/a.ts",
          language: "typescript",
          content: "a",
        },
        "proj/src/b.ts": {
          path: "proj/src/b.ts",
          language: "typescript",
          content: "b",
        },
      },
      activeFile: "proj/src/a.ts",
      openFiles: ["proj/src/a.ts"],
      rootName: "proj",
      rootPath: "/Users/me/proj",
    });
  });

  const findRowByName = (name: string): HTMLElement => {
    const matches = screen.getAllByTitle(new RegExp(`(^|/)${name}$`));
    return matches.find((el) => el.textContent?.endsWith(name)) ?? matches[0];
  };

  it("right-click on a file opens the context menu with Rename/Delete", () => {
    render(<Sidebar />);
    fireEvent.contextMenu(findRowByName("README.md"), { clientX: 50, clientY: 80 });
    expect(screen.getByTestId("context-menu")).toBeDefined();
    expect(screen.getByTestId("context-menu-rename")).toBeDefined();
    expect(screen.getByTestId("context-menu-delete")).toBeDefined();
  });

  it("rename → type new name → Enter POSTs and updates the store", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    render(<Sidebar />);
    fireEvent.contextMenu(findRowByName("README.md"), { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByTestId("context-menu-rename"));
    const input = (await screen.findByTestId("rename-input")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "README.rst" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/__renamePath",
        expect.objectContaining({ method: "POST" })
      );
    });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({
      rootPath: "/Users/me/proj",
      fromRel: "README.md",
      toRel: "README.rst",
    });
    await waitFor(() => {
      const s = useIdeStore.getState();
      expect(s.files["proj/README.md"]).toBeUndefined();
      expect(s.files["proj/README.rst"]).toBeDefined();
    });
  });

  it("rename Esc cancels without hitting the server", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    render(<Sidebar />);
    fireEvent.contextMenu(findRowByName("README.md"), { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByTestId("context-menu-rename"));
    const input = await screen.findByTestId("rename-input");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByTestId("rename-input")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("delete shows a confirm bar, then POSTs on confirm", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    render(<Sidebar />);
    fireEvent.contextMenu(findRowByName("README.md"), { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByTestId("context-menu-delete"));
    expect(screen.getByTestId("delete-confirm")).toHaveTextContent(/README\.md/);

    fireEvent.click(screen.getByTestId("delete-confirm-yes"));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/__deletePath",
        expect.objectContaining({ method: "POST" })
      );
    });
    await waitFor(() => {
      expect(useIdeStore.getState().files["proj/README.md"]).toBeUndefined();
    });
  });

  it("delete Cancel does not call the server", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    render(<Sidebar />);
    fireEvent.contextMenu(findRowByName("README.md"), { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByTestId("context-menu-delete"));
    fireEvent.click(screen.getByTestId("delete-confirm-no"));
    expect(screen.queryByTestId("delete-confirm")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("right-click on the root folder is ignored", () => {
    render(<Sidebar />);
    const rootRow = screen.getByTitle("proj");
    fireEvent.contextMenu(rootRow, { clientX: 10, clientY: 10 });
    expect(screen.queryByTestId("context-menu")).toBeNull();
  });
});
