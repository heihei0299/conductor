---
description: "Verify a Conductor branch's completion-report and merge into the master snapshot if approved."
agent: general
subtask: true
---

You are merging a Conductor branch. Follow the Conductor protocol in
@.opencode/skills/conductor/SKILL.md.

Arguments: $ARGUMENTS (first positional is branch ID, e.g., CD-001)

Actions:
1. Read the branch's brief from `.conductor/branches/<id>/brief.md`.
2. Read the branch's completion report from `.conductor/branches/<id>/completion-report.md`.
3. Invoke the `@conductor-merge-verify` subagent with the branch ID, brief path,
   and report path. Wait for the VERDICT output.
4. If VERDICT is APPROVE:
   - Create lock: `touch .conductor/.merge-lock` and write the branch ID into it.
   - Update `.conductor/master-snapshot.md` with the approved summary from the
     completion report. Compress to ≤150 words. Flag any proposed global decisions
     for user confirmation.
   - The plugin's post-write sync will detect the snapshot change + merge-lock +
     report.approved and automatically flip the branch to `merged`.
5. If VERDICT is REJECT:
   - Present the check failures to the user.
   - Do NOT update master-snapshot.md.
   - Suggest fixes or re-opening the branch.
