export interface AiTerminalSpec {
  title: string;
  cmd: string;
  tty?: boolean;
  autoEnter?: { count: number; intervalMs: number };
}

export const AI_STARTUP_TERMINALS: AiTerminalSpec[] = [
  { title: "gemini", cmd: "gemini -y", tty: true },
  { title: "claude", cmd: "claude --dangerously-skip-permissions", tty: true },
  {
    title: "codex",
    cmd: "codex",
    tty: true,
    autoEnter: { count: 40, intervalMs: 300 },
  },
];
