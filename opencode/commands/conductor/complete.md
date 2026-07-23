---
description: "Mark the current Conductor branch as complete and write its completion report."
agent: general
subtask: true
---

You are completing a Conductor branch. Follow the Conductor protocol in
@.opencode/skills/conductor/SKILL.md.

Actions:
1. Determine which branch the user is completing (ask if unclear).
2. Read the branch's brief from `.conductor/branches/<id>/brief.md`.
3. Ask the user to confirm the branch is truly done.
4. After user confirms, write `.conductor/branches/<id>/completion-report.md` with:
   - Branch ID and title
   - Summary of what was done (≤300 words)
   - Artifacts produced (file paths)
   - Completion criteria met
   - Proposed global decisions (if any, flagged for master confirmation)
   - Suggested Merge Note (≤150 words)
5. Update the branch status in `.conductor/registry.json` to `report_ready`.
   (The plugin's post-write sync also handles this automatically when it detects
   the completion-report.md file.)

The merge is a separate step: `/conductor/merge <id>`.
