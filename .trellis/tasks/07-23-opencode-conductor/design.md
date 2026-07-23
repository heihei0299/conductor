# Design: opencode Conductor integration

## Distribution Layout (repo root)

```
opencode/                          ← distribution directory (like claude-code/)
├── README.md                      ← opencode-specific docs
├── skills/conductor.md            ← skill (opencode expects .md extension)
├── plugins/conductor.js           ← enforcement hooks
├── agents/conductor-merge-verify.md  ← merge verification subagent
└── commands/conductor/            ← slash commands
    ├── init.md
    ├── branch.md
    ├── complete.md
    └── merge.md
```

Users copy these files into their own project's `.opencode/` directory:
- `opencode/skills/conductor.md` → `.opencode/skills/conductor/SKILL.md`
- `opencode/plugins/conductor.js` → `.opencode/plugins/conductor.js`
- `opencode/agents/conductor-merge-verify.md` → `.opencode/agents/conductor-merge-verify.md`
- `opencode/commands/conductor/*` → `.opencode/commands/conductor/*`

## Runtime Architecture (in the user's project)

```
user project/.opencode/
│
├─ skills/conductor/SKILL.md       ← protocol rules (auto-discovered)
│      → protocol rules for AI routing judgment
│
├─ plugin (auto-loaded)
│   └─ .opencode/plugins/conductor.js
│      ├─ tool.execute.before  → guard rules
│      ├─ tool.execute.after   → post-write sync
│      ├─ session.created      → role injection
│      └─ experimental.session.compacting → staleness nudge
│
├─ commands (TUI slash commands)
│   ├─ /conductor/init
│   ├─ /conductor/branch
│   ├─ /conductor/complete
│   └─ /conductor/merge
│
├─ agents (subagents)
│   └─ conductor-merge-verify
│
└─ state (.conductor/)
    ├─ registry.json
    ├─ branch-map.md
    ├─ master-snapshot.md
    ├─ branches/<id>/{brief,completion-report}.md
    └─ bindings/<session-id>.json
```

## Plugin: conductor.js

### Role Resolution

Same algorithm as `claude-code/scripts/lib.sh`:

1. Find `.conductor/` by walking up from cwd
2. Check `.conductor/bindings/<session-id>.json` for role + branch_id
3. If no binding, check `.conductor/registry.json#master.session_id`:
   - If empty → `master_candidate`
   - If matches current session_id → `master`
   - Otherwise → `unbound`

### Guard Rules (tool.execute.before)

#### A. Read-firewall (master only)

Block broad/external reads in master session:

| Tool | Condition | Action |
|------|-----------|--------|
| `Grep`, `Glob` | any | `deny` |
| `Read` | limit > 80 lines AND path not in `.conductor/` | `deny` |
| `WebFetch` | any | `deny` |
| `Bash` | command matches `rg\|grep\|find\|curl\|wget` | `deny` |

#### B. Merge-gate (master only)

If `.conductor/.merge-lock` exists AND file is `master-snapshot.md` AND <branch>/report.approved does not exist → `deny`.

#### C. Branch-write-guard (branch/explainer/dispatch)

Block writes to `.conductor/` outside own branch directory (`branches/$BRANCH_ID/`) or own binding file.

### Post-write Sync (tool.execute.after)

After Edit/Write/MultiEdit on paths under `.conductor/`:

| Changed file | Action |
|-------------|--------|
| `registry.json` | Re-render `branch-map.md` via `registry.py render-branch-map` |
| `master-snapshot.md` (master, merge-lock exists, report.approved exists) | Flip branch→merged, remove merge-lock, re-render |
| `branches/*/completion-report.md` | Set branch→report_ready, re-render |

### Session Created

Detect role and append guidance via available mechanisms. Since opencode lacks `additionalContext`, use `experimental.session.compacting` on first compaction to inject role context.

### Compact Staleness

Check if `master-snapshot.md` is older than `registry.json` or contains TODO/empty markers → inject warning.

## Commands

All commands use `agent: general` + `subtask: true` for isolation.

### `/conductor/init`

- Template: register current session as Conductor master
- Actions: set `master.session_id` in `registry.json`, write initial `master-snapshot.md`
- No arguments needed

### `/conductor/branch`

- Template: create branch card with `$ARGUMENTS`
- Actions: create entry in `registry.json#branches`, write `branches/<id>/brief.md`
- Parameters: title, --role, --wave, --depends-on

### `/conductor/complete`

- Template: write completion report for current branch
- Actions: write `branches/<id>/completion-report.md`
- Note: post-write sync plugin detects this and flips status→report_ready

### `/conductor/merge <id>`

- Template: verify and merge branch `<id>`
- Actions: invoke `conductor-merge-verify` agent, if APPROVED→update master-snapshot.md
- Note: post-write sync detects master-snapshot.md + merge-lock + approved→flip merged

## Agent: conductor-merge-verify

Same specification as `claude-code/agents/cd-merge-verify.md`:
- Read brief + completion-report
- Check completion criteria, artifact existence, global decisions, scope creep, merge note length
- Write `report.approved` sentinel on APPROVE
- Return structured VERDICT

## State Directory (.conductor/)

Identical structure to Claude Code version:
```
.conductor/
├── registry.json           # source of truth
├── branch-map.md           # rendered human view
├── master-snapshot.md      # master's distilled state
├── .merge-lock             # lock file during merge
├── .firewall-off           # escape hatch
├── bindings/
│   └── <session-id>.json   # role binding
├── branches/
│   └── <id>/
│       ├── brief.md
│       ├── completion-report.md
│       └── report.approved
└── snapshots/
    └── snap-<date>-<n>.md
```

## Compatibility

- `registry.py` from `claude-code/scripts/` reused as-is for `render-branch-map`
- Same JSON schema as Claude Code version for cross-platform state compatibility
