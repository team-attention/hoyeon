---
category: domain
triggers:
  - "agents/*.md"
---

# Agent Changes

- [ ] If a new agent is added, any SKILL.md that uses it references the correct agent name
- [ ] `validate_prompt` frontmatter field is present for output validation (PostToolUse hook)
- [ ] If agent is renamed or removed, all SKILL.md files referencing it are updated
