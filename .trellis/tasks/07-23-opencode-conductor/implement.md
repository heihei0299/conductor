# Implementation Plan: opencode Conductor integration

## Order

1. `.opencode/skills/conductor/SKILL.md` — skill first (no dependencies)
2. `.opencode/agents/conductor-merge-verify.md` — agent definition (no dependencies)
3. `.opencode/commands/conductor/init.md` — init command
4. `.opencode/commands/conductor/branch.md` — branch command
5. `.opencode/commands/conductor/complete.md` — complete command
6. `.opencode/commands/conductor/merge.md` — merge command
7. `.opencode/plugins/conductor.js` — plugin (depends on understanding the skill+commands)
8. `prompts/install-with-opencode.md` — install prompt
9. README.md + README.zh-CN.md — documentation updates
10. Full verification

## Validation

```bash
# 1. Verify skill frontmatter
head -5 .opencode/skills/conductor/SKILL.md | grep -q '^name: conductor$'

# 2. Verify agent frontmatter
head -5 .opencode/agents/conductor-merge-verify.md | grep -q '^mode:'

# 3. Verify commands load (opencode flag)
# Check that command files exist and have valid frontmatter
for cmd in init branch complete merge; do
  head -5 ".opencode/commands/conductor/$cmd.md" | grep -q '^description:'
done

# 4. Verify plugin syntax
node -c .opencode/plugins/conductor.js

# 5. Verify install prompt
test -f prompts/install-with-opencode.md

# 6. Verify README badges
grep -q 'opencode' README.md
grep -q 'opencode' README.zh-CN.md
```

## Rollback

```bash
git checkout -- \ 
  .opencode/skills/conductor/ \
  .opencode/agents/conductor-merge-verify.md \
  .opencode/commands/conductor/ \
  .opencode/plugins/conductor.js \
  prompts/install-with-opencode.md
git checkout -- README.md README.zh-CN.md
```
