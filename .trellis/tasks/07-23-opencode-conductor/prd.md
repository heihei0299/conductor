# Opencode Conductor integration

## Goal

Port the Conductor protocol (context isolation, branch registry, merge gate) to opencode, replicating the Claude Code plugin's enforcement mechanisms using opencode's native plugin system (JS hooks), skills, agents, and commands.

## Requirements

1. **Skill**: Conductor protocol rules auto-discovered by opencode from `.opencode/skills/conductor/SKILL.md`
2. **Commands**: `/conductor/init`, `/conductor/branch`, `/conductor/complete`, `/conductor/merge` for the master→branch→complete→merge loop
3. **Plugin (enforcement)**: opencode JS plugin replicating Claude Code hooks:
   - Read-firewall: master session delegates broad/external reads to subagents
   - Merge-gate: master snapshot protected from unapproved merges
   - Branch-write-guard: non-master sessions cannot write Conductor master records
   - Post-write sync: registry.json → branch-map.md, state transitions
   - Staleness nudge: warn before compaction if snapshot is stale
4. **Sub-agent**: `conductor-merge-verify` for adversarial merge approval checking
5. **State directory**: `.conductor/` (compatible with Claude Code version)
6. **Install prompt**: one-shot `prompts/install-with-opencode.md`
7. **Documentation**: README badges and opencode integration paragraph

## Non-goals

- Not replicating `/cd-enter`/`/cd-bind` (opencode has no parallel TUI session model)
- Not replicating `/cd-status` (opencode's session/branch visibility differs)
- Not using npm-published plugin (local `.opencode/plugins/` only)
- Not modifying the existing Codex skill or Claude Code plugin

## Acceptance Criteria

- [ ] `.opencode/skills/conductor/SKILL.md` — loaded by `skill` tool, contains protocol rules
- [ ] `.opencode/plugins/conductor.js` — implements 4 hook handlers (tool.execute.before, tool.execute.after, session.created, experimental.session.compacting)
- [ ] `.opencode/agents/conductor-merge-verify.md` — registered agent, reads brief+report, creates `report.approved` sentinel
- [ ] `.opencode/commands/conductor/init.md` — `/conductor/init` registers current session as master
- [ ] `.opencode/commands/conductor/branch.md` — `/conductor/branch` creates branch card + brief in `.conductor/branches/<id>/`
- [ ] `.opencode/commands/conductor/complete.md` — `/conductor/complete` writes completion-report.md, triggers state→report_ready
- [ ] `.opencode/commands/conductor/merge.md` — `/conductor/merge <id>` invokes merge-verify agent, writes approved snapshot
- [ ] `prompts/install-with-opencode.md` — one-shot install prompt for opencode users
- [ ] README.md and README.zh-CN.md — opencode badges + integration instructions
- [ ] Plugin guard rules tested conceptually against Claude Code pretooluse-guard.sh logic
