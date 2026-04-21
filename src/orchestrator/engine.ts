import { useIdeStore, type AutoDevPhase } from "../store/useIdeStore";
import {
  deleteFileFromHost,
  listDirOnHost,
  statPathOnHost,
  writeFileToHost,
} from "../utils/devHostApi";
import { hasTerminalSender, sendToTerminal } from "../utils/terminalBus";
import {
  ALL_SIGNALS,
  DEV_DONE_MD,
  REQUIREMENT_FILE,
  SA_PLAN,
  SA_TASK,
  SIGNAL,
  qaIterDir,
} from "./signals";
import { PROMPTS } from "./prompts";

const POLL_MS = 2000;
const SENDER_WAIT_TIMEOUT_MS = 10_000;
const SENDER_WAIT_INTERVAL_MS = 250;
const CLI_BOOT_GRACE_MS = 3000;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let stopping = false;
let tickInFlight = false;

function store() {
  return useIdeStore.getState();
}

function log(level: "info" | "warn" | "error", message: string): void {
  store().pushAutoDevLog(level, message);
}

function setPhase(phase: AutoDevPhase, patch: Partial<{ iter: number; error: string | null }> = {}): void {
  store().setAutoDev({ phase, ...patch });
}

function findRoleIds(): { sa: string | null; dev: string | null; qa: string | null } {
  const terminals = store().terminals;
  const byTitle = (key: string): string | null =>
    terminals.find((t) => t.title.toLowerCase().includes(key))?.id ?? null;
  return {
    sa: byTitle("gemini"),
    dev: byTitle("claude"),
    qa: byTitle("codex"),
  };
}

async function waitForSender(id: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (hasTerminalSender(id)) return true;
    await sleep(SENDER_WAIT_INTERVAL_MS);
  }
  return hasTerminalSender(id);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PASTE_TO_SUBMIT_DELAY_MS = 200;

async function sendPrompt(terminalId: string, prompt: string): Promise<boolean> {
  const pasteOk = sendToTerminal(terminalId, `\x1b[200~${prompt}\x1b[201~`);
  if (!pasteOk) return false;
  await sleep(PASTE_TO_SUBMIT_DELAY_MS);
  return sendToTerminal(terminalId, "\r");
}

async function wipeSignals(rootPath: string): Promise<void> {
  for (const rel of ALL_SIGNALS) {
    try {
      await deleteFileFromHost(rootPath, rel);
    } catch {
      // ignore — stat will treat as absent
    }
  }
}

async function signalExists(rootPath: string, rel: string): Promise<boolean> {
  try {
    const st = await statPathOnHost(rootPath, rel);
    return !!st.exists;
  } catch {
    return false;
  }
}

async function fileExists(rootPath: string, rel: string): Promise<boolean> {
  try {
    const st = await statPathOnHost(rootPath, rel);
    return !!(st.exists && st.isFile);
  } catch {
    return false;
  }
}

async function dirHasFiles(rootPath: string, rel: string): Promise<boolean> {
  try {
    const entries = await listDirOnHost(rootPath, rel);
    return entries.some((e) => e.isFile);
  } catch {
    return false;
  }
}

async function ensureRequirement(rootPath: string): Promise<boolean> {
  const st = await statPathOnHost(rootPath, REQUIREMENT_FILE).catch(() => null);
  if (st && st.exists && st.isFile) return true;
  // Seed an empty file so the user can fill it in and retry.
  try {
    await writeFileToHost(
      rootPath,
      REQUIREMENT_FILE,
      "# Requirement\n\nDescribe what you want built. Save this file, then click Start.\n"
    );
  } catch {
    // ignore
  }
  return false;
}

export async function startAutoDev(): Promise<void> {
  const s = store();
  if (s.autoDev.running) return;

  const rootPath = s.rootPath;
  if (!rootPath) {
    s.setAutoDev({ error: "Open a folder first." });
    log("error", "No folder open. Use the sidebar to open a workspace.");
    return;
  }

  s.resetAutoDevLog();
  s.setAutoDev({
    running: true,
    phase: "idle",
    iter: 0,
    error: null,
    roleIds: { sa: null, dev: null, qa: null },
  });
  stopping = false;

  log("info", `Auto-Dev starting (maxIter=${s.autoDev.maxIter}).`);

  const hasReq = await ensureRequirement(rootPath);
  if (!hasReq) {
    log(
      "error",
      `Missing ./${REQUIREMENT_FILE}. A template was created — fill it in and click Start again.`
    );
    store().setAutoDev({ running: false, phase: "error", error: "requirement missing" });
    return;
  }

  let roles = findRoleIds();
  if (!roles.sa || !roles.dev || !roles.qa) {
    log("info", "Spawning AI terminals (gemini / claude / codex)…");
    store().startAiTerminals();
    await sleep(500);
    roles = findRoleIds();
  }
  if (!roles.sa || !roles.dev || !roles.qa) {
    const missing = [
      !roles.sa && "gemini",
      !roles.dev && "claude",
      !roles.qa && "codex",
    ]
      .filter(Boolean)
      .join(", ");
    log("error", `Could not find terminals for: ${missing}`);
    store().setAutoDev({ running: false, phase: "error", error: `missing terminals: ${missing}` });
    return;
  }
  store().setAutoDev({ roleIds: roles });

  log("info", "Waiting for terminal streams to attach…");
  for (const [role, id] of Object.entries(roles) as [keyof typeof roles, string][]) {
    const ok = await waitForSender(id, SENDER_WAIT_TIMEOUT_MS);
    if (!ok) {
      log("error", `Terminal for ${role} never became ready.`);
      store().setAutoDev({ running: false, phase: "error", error: `terminal not ready: ${role}` });
      return;
    }
  }

  log("info", `Giving CLIs ${CLI_BOOT_GRACE_MS / 1000}s to reach input prompt…`);
  await sleep(CLI_BOOT_GRACE_MS);
  if (stopping) return;

  log("info", "Clearing stale signal files…");
  await wipeSignals(rootPath);

  // Kick off SA phase
  setPhase("sa");
  log("info", "Phase: SA — sending plan+task prompt to gemini.");
  const sent = await sendPrompt(roles.sa, PROMPTS.sa());
  if (!sent) {
    log("error", "Failed to send prompt to SA terminal.");
    store().setAutoDev({ running: false, phase: "error", error: "send failed: sa" });
    return;
  }

  startPolling();
}

export function stopAutoDev(): void {
  stopping = true;
  stopPolling();
  const s = store();
  if (s.autoDev.running) {
    log("warn", "Auto-Dev stopped by user.");
    s.setAutoDev({ running: false });
  }
}

function startPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (tickInFlight) return;
    tickInFlight = true;
    void tick()
      .catch((err) => log("error", `Poll error: ${(err as Error).message}`))
      .finally(() => {
        tickInFlight = false;
      });
  }, POLL_MS);
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function tick(): Promise<void> {
  if (stopping) return;
  const s = store();
  if (!s.autoDev.running) return;
  const rootPath = s.rootPath;
  if (!rootPath) return;

  const phase = s.autoDev.phase;
  const roles = s.autoDev.roleIds;

  if (phase === "sa") {
    if (!(await signalExists(rootPath, SIGNAL.SA_DONE))) return;
    await deleteFileFromHost(rootPath, SIGNAL.SA_DONE).catch(() => {});
    const okPlan = await fileExists(rootPath, SA_PLAN);
    const okTask = await fileExists(rootPath, SA_TASK);
    if (!okPlan || !okTask) {
      log(
        "warn",
        `SA signalled done but missing ${!okPlan ? SA_PLAN : ""}${!okPlan && !okTask ? " and " : ""}${!okTask ? SA_TASK : ""}. Continuing anyway.`
      );
    }
    log("info", "SA done — starting DEV.");
    setPhase("dev");
    if (roles.dev) await sendPrompt(roles.dev, PROMPTS.dev());
    return;
  }

  if (phase === "dev" || phase === "dev_fix") {
    if (!(await signalExists(rootPath, SIGNAL.DEV_DONE))) return;
    await deleteFileFromHost(rootPath, SIGNAL.DEV_DONE).catch(() => {});
    if (phase === "dev" && !(await fileExists(rootPath, DEV_DONE_MD))) {
      log("warn", `DEV signalled done but ${DEV_DONE_MD} missing. Continuing anyway.`);
    }
    const nextIter = s.autoDev.iter + 1;
    log("info", `DEV done — starting QA iter${nextIter}.`);
    setPhase("qa", { iter: nextIter });
    if (roles.qa) await sendPrompt(roles.qa, PROMPTS.qa(nextIter));
    return;
  }

  if (phase === "qa") {
    const clean = await signalExists(rootPath, SIGNAL.QA_DONE_CLEAN);
    if (clean) {
      await deleteFileFromHost(rootPath, SIGNAL.QA_DONE_CLEAN).catch(() => {});
      log("info", "QA passed clean — all tasks complete.");
      setPhase("done");
      store().setAutoDev({ running: false });
      stopPolling();
      return;
    }
    const bugs = await signalExists(rootPath, SIGNAL.QA_DONE_BUGS);
    if (!bugs) return;
    await deleteFileFromHost(rootPath, SIGNAL.QA_DONE_BUGS).catch(() => {});
    const currentIter = s.autoDev.iter;
    const hasBugFiles = await dirHasFiles(rootPath, qaIterDir(currentIter));
    if (!hasBugFiles) {
      log(
        "warn",
        `QA signalled bugs but ${qaIterDir(currentIter)}/ is empty. Treating as clean.`
      );
      setPhase("done");
      store().setAutoDev({ running: false });
      stopPolling();
      return;
    }
    if (currentIter >= s.autoDev.maxIter) {
      log(
        "warn",
        `QA found bugs in iter${currentIter} and maxIter=${s.autoDev.maxIter} reached. Stopping for human review.`
      );
      setPhase("stopped_max");
      store().setAutoDev({ running: false });
      stopPolling();
      return;
    }
    log("info", `QA found bugs in iter${currentIter} — DEV fix pass.`);
    setPhase("dev_fix");
    if (roles.dev) await sendPrompt(roles.dev, PROMPTS.devFix(currentIter));
    return;
  }
}
