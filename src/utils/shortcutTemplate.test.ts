import { describe, it, expect } from "vitest";
import {
  extractTemplateVars,
  fillTemplate,
  hasTemplateVars,
} from "./shortcutTemplate";

describe("extractTemplateVars", () => {
  it("returns an empty array when there are no placeholders", () => {
    expect(extractTemplateVars("echo hi")).toEqual([]);
  });

  it("extracts unique variable names in first-seen order", () => {
    expect(
      extractTemplateVars("kubectl {{verb}} pod {{name}} --context {{verb}}")
    ).toEqual(["verb", "name"]);
  });

  it("allows whitespace inside the braces", () => {
    expect(extractTemplateVars("{{ name }}, {{name}}, {{  verb  }}")).toEqual([
      "name",
      "verb",
    ]);
  });

  it("ignores malformed placeholders", () => {
    expect(extractTemplateVars("{{}} {{1bad}} {{ok}}")).toEqual(["ok"]);
  });
});

describe("fillTemplate", () => {
  it("substitutes all placeholder occurrences", () => {
    expect(
      fillTemplate("kubectl {{verb}} pod {{name}} {{verb}}", {
        verb: "delete",
        name: "api-7",
      })
    ).toBe("kubectl delete pod api-7 delete");
  });

  it("uses an empty string for missing values", () => {
    expect(fillTemplate("echo {{missing}}", {})).toBe("echo ");
  });

  it("is stable across successive calls", () => {
    const cmd = "{{a}}-{{b}}";
    expect(fillTemplate(cmd, { a: "1", b: "2" })).toBe("1-2");
    expect(fillTemplate(cmd, { a: "x", b: "y" })).toBe("x-y");
  });
});

describe("hasTemplateVars", () => {
  it("detects a single placeholder", () => {
    expect(hasTemplateVars("hello {{name}}")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(hasTemplateVars("echo hello")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(hasTemplateVars("")).toBe(false);
  });
});
