# LLM Wiki — Web AI IDE

A reference for the Large-Language-Model side of the Web-based AI IDE.
Covers (1) what an LLM is and the vocabulary you'll meet in this codebase,
(2) the IDE's LLM-facing surfaces, and (3) how each supported agent plugs in.

---

## Table of contents

1. [Core LLM concepts](#1-core-llm-concepts)
2. [Tokens, context windows, and pricing](#2-tokens-context-windows-and-pricing)
3. [Prompting techniques](#3-prompting-techniques)
4. [Tool use / function calling](#4-tool-use--function-calling)
5. [Agentic loops](#5-agentic-loops)
6. [The IDE's LLM surfaces](#6-the-ides-llm-surfaces)
7. [Supported agents](#7-supported-agents)
8. [Wiring a new agent](#8-wiring-a-new-agent)
9. [Glossary](#9-glossary)
10. [References](#10-references)

---

## 1. Core LLM concepts

| Term | Meaning |
|------|---------|
| **LLM** | Large Language Model — a transformer trained to predict the next token given prior tokens. Modern coding LLMs: Claude (Anthropic), GPT-x/CodeX (OpenAI), Gemini (Google), Llama (Meta), Qwen (Alibaba), DeepSeek. |
| **Token** | A subword unit (~3.5 chars of English; whitespace-aware). Both input *and* output cost tokens. |
| **Context window** | Max tokens the model can see in one call (input + output). Today: Claude 1M, GPT-4o 128k, Gemini 2M. |
| **Temperature** | Sampling randomness (0 = deterministic, 1 = creative). Coding usually 0–0.3. |
| **System prompt** | Persistent instruction prepended to every turn — defines the model's role/persona. |
| **Completion** | The text the model returns. |
| **Embedding** | A fixed-length vector representing semantic meaning of text — used for RAG / semantic search. |

## 2. Tokens, context windows, and pricing

LLM economics revolve around **input tokens** (what you send) and **output tokens** (what comes back). Output is typically 3–5× more expensive than input.

**Rule of thumb for this IDE:**
- 1 source file ≈ 200–2 000 tokens.
- The IDE context snapshot (`buildContextPrompt`) is ~50 tokens of metadata + a 40-line excerpt (~400 tokens).
- A focused "fix this function" turn: 1–4 k input, 0.3–1.5 k output.
- A whole-repo audit turn: easily 100 k+ — prefer caching + chunking.

**Cost-saver patterns the IDE uses or should use:**
- Prompt caching (Anthropic): cache the system prompt + project preamble; only the diff is billed at full rate.
- RTK (Rust Token Killer) wraps shell tools to compress build/test/git output 60–90 % before it ever enters the agent's context. See `CLAUDE.md`.
- 40-line excerpt cap in `src/utils/contextApi.ts` (constant `EXCERPT_LINES`) — bumping this scales linearly with cost.

## 3. Prompting techniques

| Technique | When to use |
|-----------|-------------|
| **Zero-shot** | Direct instruction, no examples. Default for simple tasks. |
| **Few-shot** | Provide 2–5 input/output examples. Use when the format is non-obvious. |
| **Chain of Thought (CoT)** | "Think step by step before answering." Strong for math/debugging. |
| **ReAct** | Interleave reasoning with tool calls (think → act → observe → think). The basis of every coding agent. |
| **Self-critique** | Ask the model to review/repair its own output. Adds 1 round-trip but catches silly bugs. |
| **Structured output** | JSON schema or XML tags. Required when feeding output into another tool. |

In this IDE, the agent receives the IDE-context block (active file, language, excerpt) **before** the user's prompt — a form of in-context grounding. See `buildContextPrompt`.

## 4. Tool use / function calling

Modern LLMs can call tools the host exposes. The pattern:

```
1. Host sends: prompt + tool schemas (JSON)
2. Model returns: tool_use { name, args } OR final text
3. Host executes the tool and returns the result
4. Loop until model returns final text
```

Tools the IDE plans to expose to agents (see `plan.md` Phase 3):

| Tool | Purpose |
|------|---------|
| `read_file(path)` | Load a file into the agent's context. |
| `write_file(path, content)` | Smart Apply target — produces a Diff View before commit. |
| `list_files(glob)` | Project structure. |
| `run_terminal(cmd, terminalId?)` | Execute a shell command in a tab. |
| `get_active_context()` | Wraps `snapshotContext()` — current file + excerpt + open tabs. |

## 5. Agentic loops

An "agent" is just an LLM in a loop with tools. The "Ralph Wiggum" pattern (single goal + completion promise + max iterations, popularised by Geoffrey Huntley) is what built *this very project* — see `logs.md`. The shape:

```
while iter < max_iter and not promise_met(state):
    state = llm_step(state, tools)
    iter += 1
```

Failure modes to watch for:
- **Loop drift** — model stops making progress; mitigate with periodic re-grounding (re-inject the goal + IDE context).
- **Context bloat** — every iteration appends; cap at K turns or summarise.
- **Tool thrashing** — model repeatedly retries the same failing tool; surface the error verbatim.
- **Premature claim of success** — always verify the completion promise programmatically (in the IDE, e.g. `curl localhost:5173`).

## 6. The IDE's LLM surfaces

| Surface | File | Purpose |
|---------|------|---------|
| Context API | `src/utils/contextApi.ts` | Pure function `snapshotContext(state)` + prompt builder. Anything that talks to an LLM should pull through here. |
| Multi-Agent Terminal | `src/components/Terminal/TerminalTab.tsx` | xterm host. Built-in `context` command writes the prompt to the terminal so AI CLIs running there can read it. |
| Mode store | `src/store/useIdeStore.ts` | Holds files / active file / open terminals — the sources of truth that feed the context API. |
| Startup runner | `src/utils/startup.ts` | `.ide-startup.yaml` can spawn agent CLIs as named terminals on boot (`run_terminal` action). |

### What to do when adding an LLM-aware feature

1. Read state via `useIdeStore` selectors — never reach into globals.
2. Build prompts via `buildContextPrompt(state)` — keep grounding consistent.
3. Cap any new excerpt or list at a constant (currently `EXCERPT_LINES = 40`) so token usage stays predictable.
4. Add a vitest case asserting the prompt's structure — drift here is invisible until token bills arrive.

## 7. Supported agents

These are the AI CLIs the IDE expects to host as terminal tabs (see `ideas.md` §2.2). The IDE itself is agent-agnostic — each below is a CLI you launch in a terminal tab.

| Agent | Vendor | Strengths | Notes |
|-------|--------|-----------|-------|
| **Claude Code** | Anthropic | Best long-context (1M tok), strong on planning/refactors, robust tool use. | This very document was authored by it. |
| **Cline** | Open source (VS Code extension origin) | Brings-your-own-key, broad model support (Claude / GPT / local), file diffs. | Run as `cline` in a tab. |
| **CodeX (OpenAI)** | OpenAI | Tight GPT-5 integration, fast. | `codex` CLI. |
| **Copilot CLI** | GitHub | Shell-command suggestions, good for ops. | `gh copilot` subcommands. |
| **Aider** | Open source | Git-native (every change a commit), repo-map context. | `aider` in a tab. |
| **Continue.dev** | Open source | Local + cloud models, custom slash commands. | Headless mode usable. |

## 8. Wiring a new agent

To make a new agent first-class in the IDE:

1. **Spawn it as a terminal tab.** Add to `.ide-startup.yaml`:
   ```yaml
   startup:
     - action: run_terminal
       commands:
         - title: "MyAgent"
           cmd: "myagent --interactive"
   ```
2. **Feed it context.** From its tab, the user (or its system prompt) types `context` to get the IDE snapshot. Or — for tighter integration — extend `TerminalTab` to auto-inject the prompt on first focus.
3. **Expose Smart Apply.** When the agent prints a diff or fenced code block, parse it client-side and offer the "Apply" button. Hook target: `src/components/Terminal/TerminalTab.tsx` `runCommand`.
4. **Add a context API consumer.** If the agent runs in-process (not a CLI), import `buildContextPrompt` and pass it to your SDK call.

## 9. Glossary

- **Agent** — LLM + tools + loop.
- **Cache hit** — Reusing a cached prefix (Anthropic prompt cache); 90 % cheaper input.
- **Diff View** — UI that shows proposed file changes before applying them.
- **Grounding** — Giving the model the facts it needs (active file, error message, schema) in-context.
- **Hallucination** — Model output that's confident but false. Mitigate with grounding + verification.
- **MCP** — Model Context Protocol; standard way for hosts to expose tools to LLMs (used by Claude Desktop, Claude Code, Cursor).
- **PTY** — Pseudo-terminal; a real shell behind xterm. Tauri exposes one; WebContainers simulates one in-browser.
- **RAG** — Retrieval-Augmented Generation; vector-search relevant docs and stuff them in the prompt.
- **System prompt** — Persistent instruction defining the agent's role.
- **Tool use / function calling** — Model emits a structured request to call a host-defined function.

## 10. References

- Anthropic prompt-engineering docs — https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview
- OpenAI cookbook — https://cookbook.openai.com/
- ReAct paper — https://arxiv.org/abs/2210.03629
- Model Context Protocol — https://modelcontextprotocol.io/
- Geoffrey Huntley, "The Ralph Wiggum loop" — https://ghuntley.com/ralph/
- This project's blueprint — see `plan.md`, `ideas.md`, `logs.md` in repo root.
