---
name: restore
description: Restore personal data from your backup
---

# /restore — Restore Personal Data

Run the backup engine in restore mode to pull personal data from your configured backup backend. This is safe to run anytime — it will never overwrite toolkit files.

## Steps

1. Run the backup engine in restore mode:
   ```bash
   bash "$TOOLKIT_ROOT/core/hooks/backup-engine.sh" --restore
   ```
   Parse the JSON output to see what's available.

2. If status is "no_backend": tell the user no backup is configured and suggest `/setup-wizard`.

3. If status is "unreachable": tell the user the backend can't be reached and suggest checking their connection.

4. If status is "ok": present what was found:
   - Memory files: restore automatically
   - Conversation history: restore automatically
   - Keybindings: restore automatically
   - CLAUDE.md: ask the user:
     > "I found your previous personal instructions from your backup. Would you like me to:
     > 1. **Merge them** — Keep your personal notes and preferences, but update the toolkit sections to match what's installed now *(recommended)*
     > 2. **Use your backup** — Restore exactly what you had before, as-is
     > 3. **Start fresh** — Keep only the current version"
   - For merge: use the marker system. Content between `<!-- BEGIN:fragment-name -->` and `<!-- END:fragment-name -->` markers comes from the current install. Everything else comes from the backup.
   - Encyclopedia: copy files to `~/.claude/encyclopedia/`. If the backup has docs that don't match current expected types, note this and suggest running encyclopedia-update.
   - Custom skills: for each skill in the `custom_skills` array, ask:
     > "I found a custom skill called '{name}' in your backup. This isn't part of the DestinClaude toolkit. Restore it?"
   - User-choice config: merge keys from `user-choices.json` into current config.json (only keys that aren't already set).

5. After restoring, verify toolkit integrity by checking that no toolkit-owned files were overwritten:
   Read `plugin-manifest.json` and verify all listed skills/hooks still exist.

6. Clean up the temp directory from the restore output.

7. Report results to the user.
