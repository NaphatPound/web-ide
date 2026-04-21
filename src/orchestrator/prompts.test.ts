import { describe, it, expect } from "vitest";
import { PROMPTS } from "./prompts";
import {
  DEV_DONE_MD,
  DEV_LOG_MD,
  REQUIREMENT_FILE,
  SA_PLAN,
  SA_TASK,
  SIGNAL,
  qaIterDir,
} from "./signals";

describe("PROMPTS", () => {
  it("SA prompt instructs writing plan+task and touching sa_done", () => {
    const p = PROMPTS.sa();
    expect(p).toContain(REQUIREMENT_FILE);
    expect(p).toContain(SA_PLAN);
    expect(p).toContain(SA_TASK);
    expect(p).toContain(`touch ./${SIGNAL.SA_DONE}`);
  });

  it("DEV prompt references plan+task and signals dev_done", () => {
    const p = PROMPTS.dev();
    expect(p).toContain(SA_PLAN);
    expect(p).toContain(SA_TASK);
    expect(p).toContain(DEV_DONE_MD);
    expect(p).toContain(`touch ./${SIGNAL.DEV_DONE}`);
  });

  it("DEV_FIX prompt points at the previous iteration's bug dir and log file", () => {
    const p = PROMPTS.devFix(2);
    expect(p).toContain(qaIterDir(2));
    expect(p).toContain(DEV_LOG_MD);
    expect(p).toContain(`touch ./${SIGNAL.DEV_DONE}`);
  });

  it("QA prompt creates iter dir and offers clean OR bugs signal (not both)", () => {
    const p = PROMPTS.qa(1);
    expect(p).toContain(`mkdir -p ./${qaIterDir(1)}`);
    expect(p).toContain(`touch ./${SIGNAL.QA_DONE_CLEAN}`);
    expect(p).toContain(`touch ./${SIGNAL.QA_DONE_BUGS}`);
    expect(p).toMatch(/EXACTLY ONE/i);
  });

  it("QA prompt iter number matches the directory name", () => {
    const p = PROMPTS.qa(7);
    expect(p).toContain("QA/iter7");
  });
});
