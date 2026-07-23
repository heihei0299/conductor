---
description: "Register the current session as the Conductor master. Sets up .conductor/registry.json and writes the initial master-snapshot.md."
agent: general
subtask: true
---

Register this opencode session as the Conductor master session.

Follow the Conductor protocol in @.opencode/skills/conductor/SKILL.md.

Actions:
1. Create or read `.conductor/registry.json` in the project root.
2. Set `master.session_id` to the current opencode session ID.
   (If unavailable, use a stable placeholder — the plugin binds it later.)
3. Set `master.current_wave` to 1.
4. Ensure `branches: {}` and `waves: []` exist.
5. Write or update `.conductor/master-snapshot.md` with the project's current
   goal and constraints (ask the user if unclear).
6. Write or update `.conductor/branch-map.md` (initial empty state).

If `.conductor/` already has a master bound to a different session, warn the user
and ask before taking over.

The plugin's `tool.execute.before` hook will enforce the read-firewall, write-guard,
and merge-gate from now on.
