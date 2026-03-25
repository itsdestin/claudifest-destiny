# Cross-Device Live Sync — Design

**Date:** 2026-03-24
**Status:** Proposed
**Builds on:** backup-system-refactor-design (03-22-2026)

## Problem Statement

The backup system was designed for backup-and-restore, not live cross-device sync. Two files contain a mix of portable and machine-specific data that causes conflicts when syncing between Windows, macOS, Android, and Linux:

1. **`config.json`** mixes portable preferences (comfort_level, installed_layers, sync backend, tokens, inbox config) with machine-specific values (platform, toolkit_root, gmessages_binary, gcloud_installed). Syncing it to a different device overwrites platform detection with wrong values.

2. **`mcp-config.json`** contains platform-specific MCP server definitions (windows-control, absolute binary paths). Syncing it injects broken server definitions onto devices where those servers don't exist.

Everything else in the sync scope is already portable: memory files, CLAUDE.md, encyclopedia cache, user-created skills.

## Design Principles

**Only sync data that is portable by nature. Rebuild everything else locally.**

A file is "portable" if its content works identically on any platform without modification. A file is "machine-specific" if it contains absolute paths, platform names, binary locations, or capability flags tied to the local environment.

## Design Decisions

### D1: Split config.json into portable + local

**Decision:** Split `toolkit-state/config.json` into two files:
- **`config.json`** — portable keys only (synced across devices)
- **`config.local.json`** — machine-specific keys only (never synced, rebuilt locally)

**Portable keys** (stay in `config.json`):
```
comfort_level, installed_layers, installed_modules, conflict_resolutions,
installed_at, messaging_choice, todoist_api_token, setup_completed,
setup_completed_at, PERSONAL_SYNC_BACKEND, inbox_providers,
inbox_provider_config, variables.USER_NAME, variables.DRIVE_ROOT,
variables.TODOIST_PROJECT, variables.GIT_REMOTE, variables.JOURNAL_DIR,
variables.ENCYCLOPEDIA_DIR, variables.PERSONAL_SYNC_BACKEND,
variables.PERSONAL_SYNC_REPO
```

**Machine-specific keys** (move to `config.local.json`):
```
platform, toolkit_root, gmessages_binary, gcloud_installed
```

**Rationale:** The `config.local.json` pattern mirrors `.gitconfig`/`.gitconfig.local`. It cleanly separates user intent ("I want these layers and this backend") from machine reality ("my toolkit lives at this path on Windows"). The portable file can sync freely; the local file is rebuilt at session start.

**Merge behavior:** `config_get()` in `backup-common.sh` reads from both files, with `config.local.json` values taking precedence for any overlapping keys. This is a single function change in one file — all existing callers of `config_get()` get the behavior automatically.

**Alternatives rejected:**
- Key-level merge during sync (complex, error-prone merge logic in bash)
- Environment variables for machine-specific values (not persistent across sessions)
- Template with placeholders (adds a build step, fragile)

### D2: Rebuild config.local.json at session start

**Decision:** `session-start.sh` generates `config.local.json` by detecting the local environment:
- `platform` — from `uname -s` (MINGW*/MSYS* → windows, Darwin → macos, Linux with Android markers → android, Linux → linux)
- `toolkit_root` — already resolved via the existing walk-up-to-VERSION logic
- `gmessages_binary` — `command -v gmessages` or check known paths
- `gcloud_installed` — `command -v gcloud` succeeds

**Rationale:** All four machine-specific values are trivially detectable. No user input needed. Runs every session start (idempotent, fast). If a value can be deterministically derived from the environment, it should be derived, not synced.

**Timing:** Runs early in session-start, before any config reads. Existing toolkit_root resolution already does most of this work — this formalizes it into a file.

### D3: Stop syncing mcp-config.json

**Decision:** Remove `mcp-config.json` from personal-sync scope. Instead:
1. Store a **portable MCP server intent list** in `config.json` under a new `mcp_servers` key — just the server names the user wants, not their platform-specific connection details.
2. Each device's `session-start.sh` already extracts MCP config from `.claude.json` (the local, machine-specific file). This extraction is the canonical source of truth.
3. On restore to a new device, the setup wizard or `/restore` command walks the user through re-adding their MCP servers (most are configured via the Claude Code UI or `claude mcp add`, not manually).

**Portable intent list example:**
```json
{
  "mcp_servers": ["todoist", "gmessages", "windows-control"]
}
```

This tells a new device "the user wants these servers" without prescribing how to connect to them. The setup wizard can use this to prompt: "You had gmessages configured on your previous device. Would you like to set it up here?"

**Rationale:** MCP server definitions are inherently machine-specific — they reference local binaries, platform-specific tools, and absolute paths. The extract-from-`.claude.json` pattern already works correctly per-device. Syncing the extracted config is what causes the cross-device breakage.

**Alternatives rejected:**
- Path variable substitution in mcp-config.json (fragile, doesn't handle platform-only servers like windows-control)
- Per-platform mcp-config files (config proliferation, hard to maintain)

### D4: personal-sync excludes config.local.json and mcp-config.json

**Decision:** Update `personal-sync.sh` path filter:
- **Include:** `config.json` (portable config)
- **Exclude:** `config.local.json` (machine-specific, rebuilt locally)
- **Exclude:** `mcp-config.json` (machine-specific, extracted from `.claude.json`)

Also update session-start.sh pull logic to NOT pull `config.local.json` from any backend.

### D5: Migration from current single config.json

**Decision:** On first session start after this change:
1. If `config.json` exists and `config.local.json` does not, run a one-time split:
   - Read current `config.json`
   - Extract machine-specific keys → write `config.local.json`
   - Remove machine-specific keys from `config.json` → rewrite it
2. If both files exist, do nothing (already migrated).
3. If neither exists, session-start creates both fresh (existing self-healing behavior).

**Rationale:** Seamless upgrade. No user action needed. The migration is idempotent — running it twice is a no-op.

## Architecture

### File Changes

| File | Change |
|------|--------|
| `core/hooks/lib/backup-common.sh` | `config_get()` reads both files, local takes precedence. Add `config_get_local()` for local-only reads. |
| `core/hooks/session-start.sh` | Add `rebuild_local_config()` early in flow. Remove mcp-config.json from pull scope. Add one-time migration. |
| `core/hooks/personal-sync.sh` | Exclude `config.local.json` from sync scope. Exclude `mcp-config.json`. |
| `core/hooks/statusline.sh` | Change `toolkit_root` read to use `config_get` (which now checks both files). |
| `scripts/post-update.sh` | Same — use `config_get` pattern for toolkit_root. |

### New Files

| File | Purpose |
|------|---------|
| `toolkit-state/config.local.json` | Machine-specific config (never synced) |

### Data Flow

**Session start (after this change):**
```
session-start.sh → SessionStart
  → rebuild_local_config()    ← NEW: detect platform, toolkit_root, binaries
  → Conditional git pull on ~/.claude
  → Pull portable personal data (memory, CLAUDE.md, config.json, encyclopedia)
  → Do NOT pull config.local.json or mcp-config.json
  → MCP config extraction from .claude.json (already exists, unchanged)
  → Project slug rewriting
  → Migration check
  → Sync health + statusline
```

**Config read (after this change):**
```
config_get("toolkit_root")
  → Check config.local.json first (has it? return it)
  → Fall back to config.json
  → Fall back to default
```

## Dependencies

- **Modifies:** backup-common.sh, session-start.sh, personal-sync.sh, statusline.sh, post-update.sh
- **Creates:** config.local.json (generated, not checked in)
- **Spec updates needed:** backup-system-spec.md (v4.0 → v4.1), personal-sync-spec.md (v2.0 → v2.1)
