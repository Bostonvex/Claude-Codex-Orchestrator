# tools

## `codex-json-viewer.html` — JSON trajectory viewer

The local worker runs Codex as an observable background process:

```sh
codex exec --json -C <worktree> -s workspace-write -o codex-<NN>.result "<frozen contract>" > codex-<NN>.jsonl 2>&1
```

so every local run leaves a **`codex-<NN>.jsonl`** — one JSON event per line — next to its
worktree. This viewer renders that log so you can see exactly what the run did.

### Use it

Open `codex-json-viewer.html` in any browser (double-click it, or `open tools/codex-json-viewer.html`
on macOS). Then load a log by any of:

- **drag-and-drop** a `codex-<NN>.jsonl` onto the page,
- click **Open .jsonl…** and pick the file, or
- **paste** the log text into the box.

Everything runs locally in the browser — no build step, no server, nothing is uploaded.

### What it shows

- **Summary bar** — event count, shell commands (and how many failed), file edits, messages,
  token usage (from the `turn.completed` event), and the thread id.
- **Timeline** — one row per Codex action, in order, merging each item's `item.started` +
  `item.completed`:
  - 💬 `agent_message` — the agent's reasoning,
  - ▸ `command_execution` — the shell command, an exit-code badge (green 0 / red non-zero), and
    the captured output (click to expand),
  - ✎ `file_change` — the paths it added / updated / deleted,
  - unknown event types render as raw JSON.
- **Filters** — toggle messages / commands / edits / other, and free-text search across commands,
  messages, and paths.

Stray non-JSON lines (stderr merged in by `2>&1`) are tolerated and shown as `stderr` rows rather
than breaking the render.

### Event schema (reference)

`codex exec --json` emits a JSONL stream of envelope events — `thread.started`, `turn.started`,
`item.started`, `item.completed`, `turn.completed` — where `item.*` events carry a typed `item`
(`agent_message` · `command_execution` · `file_change`). The final `-o codex-<NN>.result` is a
plain-text summary, separate from the JSONL.
