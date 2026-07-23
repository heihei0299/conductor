---
description: "Create a new Conductor branch card and its brief in .conductor/branches/<id>/."
agent: general
subtask: true
---

You are creating a Conductor branch. Arguments: $ARGUMENTS

Follow the Conductor protocol in @.opencode/skills/conductor/SKILL.md.

Parse `$ARGUMENTS` as a branch title (first positional) plus optional flags:
- `--role <type>` — e.g., task, research, review, implement
- `--wave <n>` — execution wave number (default: 1)
- `--depends-on <ids>` — comma-separated branch IDs this depends on

Actions:
1. Determine the next branch ID from `.conductor/registry.json` (e.g., CD-001, CD-002).
2. Create `.conductor/branches/<id>/brief.md` with:
   - Stable title (e.g., `[CD-001][W1][task] <title>`)
   - Purpose (one sentence)
   - Role, wave, dependencies
   - Expected artifact
   - Completion criteria
   - Return condition
3. Register the branch in `.conductor/registry.json` under `branches[<id>]`:
   - title, role, type: branch, status: planned, execution_wave, depends_on, unblocks: []
4. Update `.conductor/branch-map.md` (the plugin syncs this automatically
   when registry.json is written, but write it anyway).
5. Present the branch card to the user and ask for confirmation to activate it.
   Only flip to `brief_ready` after user confirms.

Do NOT open a new session. The branch lives in `.conductor/` until the user
uses `/conductor/complete` and `/conductor/merge`.
