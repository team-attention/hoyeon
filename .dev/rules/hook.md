---
category: concern
triggers:
  - "scripts/*.sh"
  - ".claude/settings.local.json"
---

# Hook System Sync

- [ ] If a new hook script is added in `scripts/`, it must be registered in `.claude/settings.local.json` under the appropriate event type
- [ ] If a hook is removed from `settings.local.json`, the corresponding script in `scripts/` should be cleaned up (or vice versa)
- [ ] Hook scripts must be executable (`chmod +x`)
- [ ] If hook behavior changes, `CLAUDE.md` "Hook System" table is updated
