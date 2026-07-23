# One-Shot Install Prompt For Opencode

Copy this whole prompt into an opencode session.

```text
Install the Conductor skill from this GitHub repository:

https://github.com/Jinghao67/conductor

Goal:
- Install the repository's opencode-compatible integration into my project's `.opencode/` directory:
  - `.opencode/skills/conductor/SKILL.md` — protocol rules
  - `.opencode/plugins/conductor.js` — enforcement hooks (read-firewall, merge-gate, write-guard, sync)
  - `.opencode/agents/conductor-merge-verify.md` — merge verification subagent
  - `.opencode/commands/conductor/init.md` — `/conductor/init` command
  - `.opencode/commands/conductor/branch.md` — `/conductor/branch` command
  - `.opencode/commands/conductor/complete.md` — `/conductor/complete` command
  - `.opencode/commands/conductor/merge.md` — `/conductor/merge` command
- If an existing `.opencode/skills/conductor/` or `.opencode/plugins/conductor.js` already exists, back them up with a timestamp.
- Verify these files exist after installation:
  - `.opencode/skills/conductor/SKILL.md`
  - `.opencode/plugins/conductor.js`
  - `.opencode/agents/conductor-merge-verify.md`
  - `.opencode/commands/conductor/init.md`
  - `.opencode/commands/conductor/branch.md`
  - `.opencode/commands/conductor/complete.md`
  - `.opencode/commands/conductor/merge.md`
- Do not edit unrelated files.
- Do not commit or push anything.

Steps:
1. Clone the repository to a temporary or user-approved local directory.
2. Copy the required files from the repo to the project's `.opencode/` tree.
3. Report:
   - install path
   - backup path, if any
   - verification result
4. Explain that the user should restart opencode for the plugin to load.

Trigger phrase for a new opencode session:
Use the conductor skill to keep this as the clean master session, create named branch cards before opening branches, use /conductor/init, /conductor/branch, /conductor/complete, and /conductor/merge.
```
