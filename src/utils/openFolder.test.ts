import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isOpenFolderSupported,
  openFolderFromBrowser,
  openFolderFromTauri,
} from "./openFolder";
import { invoke } from "@tauri-apps/api/core";

function fileHandle(name: string, content: string) {
  return {
    kind: "file" as const,
    name,
    getFile: async () =>
      ({
        size: content.length,
        text: async () => content,
      }) as unknown as File,
  };
}

function dirHandle(name: string, entries: Array<[string, unknown]>) {
  return {
    kind: "directory" as const,
    name,
    entries: () => {
      let i = 0;
      return {
        [Symbol.asyncIterator]() {
          return this;
        },
        async next() {
          if (i >= entries.length) return { value: undefined, done: true };
          return { value: entries[i++], done: false };
        },
      };
    },
  };
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
});

describe("openFolder", () => {
  it("reports unsupported when picker is missing", () => {
    expect(isOpenFolderSupported()).toBe(false);
  });

  it("walks a mocked directory into FileEntry records", async () => {
    const root = dirHandle("proj", [
      ["index.ts", fileHandle("index.ts", "export const x = 1\n")],
      ["node_modules", dirHandle("node_modules", [])],
      [
        "src",
        dirHandle("src", [
          ["main.tsx", fileHandle("main.tsx", "// main")],
        ]),
      ],
      ["photo.png", fileHandle("photo.png", "binary")],
    ]);
    (window as unknown as {
      showDirectoryPicker: () => Promise<unknown>;
    }).showDirectoryPicker = vi.fn().mockResolvedValue(root);

    const result = await openFolderFromBrowser();
    expect(result).not.toBeNull();
    expect(result!.rootName).toBe("proj");
    expect(Object.keys(result!.files).sort()).toEqual([
      "proj/index.ts",
      "proj/src/main.tsx",
    ]);
    expect(result!.files["proj/index.ts"].language).toBe("typescript");
  });

  it("returns null when the user cancels", async () => {
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
    (window as unknown as {
      showDirectoryPicker: () => Promise<unknown>;
    }).showDirectoryPicker = vi.fn().mockRejectedValue(abort);
    const result = await openFolderFromBrowser();
    expect(result).toBeNull();
  });
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("openFolderFromTauri", () => {
  it("invokes pick_and_load_folder and normalizes the payload", async () => {
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rootName: "proj",
      rootPath: "/Users/me/proj",
      files: {
        "proj/README.md": { path: "proj/README.md", language: "markdown", content: "# p" },
      },
    });
    const result = await openFolderFromTauri();
    expect(invoke).toHaveBeenCalledWith("pick_and_load_folder");
    expect(result).toEqual({
      rootName: "proj",
      rootPath: "/Users/me/proj",
      files: {
        "proj/README.md": { path: "proj/README.md", language: "markdown", content: "# p" },
      },
    });
  });

  it("returns null when the picker is cancelled", async () => {
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    expect(await openFolderFromTauri()).toBeNull();
  });
});
