# Conductor for Opencode

An opencode-native integration of [Conductor](../README.md). Same protocol — one
clean master session, dependency-aware interactive branches, a dirty explainer
sidecar, an explicit merge gate — enforced through opencode's plugin hook system.

| Conductor need | Opencode mechanism |
| --- | --- |
| Protocol rules | Skill at `skills/conductor.md` — auto-discovered by opencode |
| Read-firewall, merge-gate, write-guard | Plugin at `plugins/conductor.js` — `tool.execute.before` hook |
| Registry → branch-map sync | Plugin — `tool.execute.after` hook |
| Staleness nudge | Plugin — `experimental.session.compacting` hook |
| Master→branch→complete→merge loop | Slash commands under `commands/conductor/` |
| Merge verification | Subagent at `agents/conductor-merge-verify.md` |

## Install

Copy the integration files into your project's `.opencode/` directory:

```bash
# From the Conductor repository root
cp -R opencode/skills .opencode/skills/conductor
cp opencode/agents/conductor-merge-verify.md .opencode/agents/
cp -R opencode/commands/conductor .opencode/commands/
cp opencode/plugins/conductor.js .opencode/plugins/
```

Or copy the directory as a reference and symlink:

```bash
ln -sf $(pwd)/opencode .opencode/conductor
```

Then restart opencode for the plugin to load.

## Usage

Start a new opencode session and run:

| Command | Action |
|---------|--------|
| `/conductor/init` | Register this session as the Conductor master |
| `/conductor/branch "title" --role <r> --wave <n>` | Create a branch card + brief |
| `/conductor/complete` | Write completion report for the current branch |
| `/conductor/merge <id>` | Verify and merge a branch's report |

## Files

| File | Purpose |
|------|---------|
| `skills/conductor.md` | Skill definition — protocol rules |
| `plugins/conductor.js` | Enforcement hooks (guard, sync, compact) |
| `agents/conductor-merge-verify.md` | Subagent: adversarially verify merge readiness |
| `commands/conductor/init.md` | `/conductor/init` |
| `commands/conductor/branch.md` | `/conductor/branch` |
| `commands/conductor/complete.md` | `/conductor/complete` |
| `commands/conductor/merge.md` | `/conductor/merge` |
