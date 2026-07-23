---
name: conductor
description: "Context isolation and branch orchestration for long-running AI work. Keeps the master session clean while messy exploration, implementation, and research happen in separate branches with dependency-aware waves and explicit merge gates."
---
# Conductor (opencode)

## Purpose

Conductor is a context isolation and branch registry protocol. It keeps one master
session as the project control room (goals, constraints, branch map, approved summaries)
while messy exploration, implementation, research, and learning happen in separate
branch sessions, governed by dependency-aware waves and an explicit merge gate.

Enforcement hooks in `.opencode/plugins/conductor.js` handle:
- **Read-firewall**: master session delegates broad/external reads to subagents
- **Merge-gate**: master snapshot protected from unapproved merges
- **Branch-write-guard**: non-master sessions cannot write Conductor master records
- **Post-write sync**: derived state stays consistent
- **Staleness nudge**: warns before compaction if the master snapshot is stale

This skill carries the **judgment** the hooks cannot automate.

## Core Rules

- The master session holds only: goal, constraints, branch map, global decisions,
  approved summaries, risks, and next steps.
- Create visible branch cards before creating branches. Every branch must have a
  stable ID, title, purpose, expected output, and return condition.
- Never put mutable status (active/done/blocked) in a branch title. Status belongs
  in the registry and Today View.
- Branch sessions receive only their brief. They cannot see master/sibling history.
- A branch's raw history never returns to the master by default. Only a completion
  report, after user-confirmed completion.
- The master only merges through an approved completion report. Decisions made in
  branches are not globally binding until confirmed in the master.

## Routing — Where Does a Request Belong?

| Destination | When |
|------------|------|
| **Master** | Changes to goals, scope, constraints, branch map, merges, snapshots, global decisions |
| **Branch** | Exploratory, implementation, research, or review work with many intermediate details |
| **Explainer** | Long explanations, tutorials, "I don't fully understand this yet" |

When a read is denied by the firewall in master, that is by design: use a subagent
(Explore) for codebase questions, or WebFetch for web content, and absorb only the
returned conclusion. Do not fight the firewall.

## Commands

| Command | Action |
|---------|--------|
| `/conductor/init` | Register this session as the Conductor master |
| `/conductor/branch "title" --role <r> --wave <n>` | Create a branch card + brief |
| `/conductor/complete` | Write completion report for the current branch |
| `/conductor/merge <id>` | Verify and merge a branch's report |

## Session Names

| Role | Pattern |
|------|---------|
| Master | `[CD-MAIN][master] <project>` |
| Branch | `[CD-001][W1][<role>] <purpose>` |
| Explainer | `[CD-E01][sidecar][explainer] Dirty questions` |

## Branch Lifecycle

```
planned → brief_ready → active → (completion_suggested) → report_ready
→ merge_pending → merged | rejected → archived
```

(plus `blocked` at any point)

State is in `.conductor/registry.json`. The human-readable `branch-map.md` is
rendered from it automatically.

## Wave Planning

Before creating or opening branches, classify each:

| Class | Meaning |
|-------|---------|
| `ready_parallel` | Can start now from the current snapshot |
| `dependent` | Needs another branch's output or decision first |
| `gate` | Review/merge/decision required before next wave |
| `optional` | Useful but not critical path |
| `explainer` | Sidecar, never blocks |

Rules:
- Only current-wave branches should become active.
- Later-wave branches stay `planned` or `blocked`.
- Keep at most 2 active interactive branches.
- Parallel means "safe from the same snapshot without needing each other's output."
