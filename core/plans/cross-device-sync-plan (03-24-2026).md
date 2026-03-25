# Cross-Device Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the backup system work as a live cross-device sync system by splitting config.json into portable + local, stopping mcp-config.json sync, and rebuilding machine-specific config at session start.

**Architecture:** Split `toolkit-state/config.json` into a portable `config.json` (synced) and a `config.local.json` (rebuilt per-device). Upgrade `config_get()` to read both files with local-takes-precedence merge. Add `rebuild_local_config()` to session-start. Remove `mcp-config.json` from personal-sync scope.

**Tech Stack:** Bash (hooks), Node.js (config parsing/writing)

**Design doc:** `core/plans/cross-device-sync-design (03-24-2026).md`

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `toolkit-state/config.local.json` | Machine-specific config (generated at session start, never synced) |

### Modified Files
| File | Changes |
|------|---------|
| `core/hooks/lib/backup-common.sh` | `config_get()` reads both files (local precedence). Add `LOCAL_CONFIG_FILE` constant. |
| `core/hooks/session-start.sh` | Add `rebuild_local_config()`. Add one-time migration. Remove mcp-config.json git commit. Stop pulling config.local.json. |
| `core/hooks/personal-sync.sh` | Exclude `config.local.json` from sync. Remove mcp-config.json from sync scope. |
| `core/hooks/statusline.sh` | Read `toolkit_root` from config.local.json first via two-file loop (lightweight, no library sourcing). |
| `~/.claude/.gitignore` | Add `mcp-servers/mcp-config.json` (machine-specific, rebuilt from .claude.json). |

### Deferred (not in this plan)
| Item | Reason |
|------|--------|
| `config_get_local()` function | Design doc mentions it but no caller currently needs it. Will add when a consumer appears. |
| MCP server intent list (`mcp_servers` key) | Design doc D3 proposes a portable "desired servers" list. Deferred because the current setup-wizard already guides MCP setup per-device, and the intent list adds complexity with no immediate consumer. Can be added later if cross-device MCP restoration proves painful. |

---

### Task 1: Upgrade `config_get()` to support dual config files

**Files:**
- Modify: `core/hooks/lib/backup-common.sh`

This is the foundation — once `config_get()` knows about both files, all existing callers automatically get the right behavior.

- [ ] **Step 1: Add LOCAL_CONFIG_FILE constant and upgrade config_get()**

In `core/hooks/lib/backup-common.sh`, add `LOCAL_CONFIG_FILE` alongside existing `CONFIG_FILE`, and update `config_get()` to check local first:

```bash
# --- Constants ---
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
TOOLKIT_ROOT="${TOOLKIT_ROOT:-}"
BACKUP_LOG="$CLAUDE_DIR/backup.log"
CONFIG_FILE="$CLAUDE_DIR/toolkit-state/config.json"
LOCAL_CONFIG_FILE="$CLAUDE_DIR/toolkit-state/config.local.json"
```

Update `config_get()` to try `LOCAL_CONFIG_FILE` first, then fall back to `CONFIG_FILE`:

```bash
config_get() {
    local key="$1" default="${2:-}"
    local val=""
    # Check local config first (machine-specific, takes precedence)
    if [[ -f "$LOCAL_CONFIG_FILE" ]] && command -v node &>/dev/null; then
        val=$(node -e "
            try {
                const c = JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
                const v = c[process.argv[2]];
                if (v !== undefined && v !== null) process.stdout.write(String(v));
            } catch(e) {}
        " "$LOCAL_CONFIG_FILE" "$key" 2>/dev/null) || true
        if [[ -n "$val" ]]; then
            echo "$val"
            return
        fi
    fi
    # Then check portable config
    if command -v node &>/dev/null && [[ -f "$CONFIG_FILE" ]]; then
        val=$(node -e "
            try {
                const c = JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
                const v = c[process.argv[2]];
                if (v !== undefined && v !== null) process.stdout.write(String(v));
            } catch(e) {}
        " "$CONFIG_FILE" "$key" 2>/dev/null) || true
        if [[ -n "$val" ]]; then
            echo "$val"
            return
        fi
    fi
    # Grep fallback (portable config only — local is always JSON)
    if [[ -f "$CONFIG_FILE" ]]; then
        val=$(sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$CONFIG_FILE" 2>/dev/null | head -1)
        if [[ -n "$val" ]]; then
            echo "$val"
            return
        fi
    fi
    echo "$default"
}
```

- [ ] **Step 2: Verify backup-common.sh parses without errors**

Run: `bash -n ~/.claude/plugins/destinclaude/core/hooks/lib/backup-common.sh`
Expected: No output (clean parse)

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/lib/backup-common.sh
git commit -m "feat: config_get() reads config.local.json with precedence over config.json"
```

---

### Task 2: Add `rebuild_local_config()` to session-start

**Files:**
- Modify: `core/hooks/session-start.sh`

This function detects the local platform, toolkit root, and binary availability, then writes `config.local.json`. It runs early in session-start, before anything reads config values.

- [ ] **Step 1: Add rebuild_local_config() function**

Add this function near the top of `session-start.sh`, after the `TOOLKIT_ROOT` resolution block (which already does the walk-up-to-VERSION logic). Place it after line 44 (the auto-create config.json block):

```bash
# --- Rebuild machine-specific config (Design ref: cross-device-sync D2) ---
# Detects platform, toolkit root, and binary availability.
# Writes config.local.json — never synced, rebuilt every session start.
rebuild_local_config() {
    local local_config="$CLAUDE_DIR/toolkit-state/config.local.json"

    # Detect platform
    local platform="linux"
    case "$(uname -s)" in
        MINGW*|MSYS*) platform="windows" ;;
        Darwin) platform="macos" ;;
        Linux)
            if [[ -d "/data/data/com.termux" || -d "/data/data/com.destin.code" ]]; then
                platform="android"
            fi
            ;;
    esac

    # toolkit_root already resolved above
    local tk_root="${TOOLKIT_ROOT:-}"

    # Detect gmessages binary
    local gmessages_bin=""
    if command -v gmessages &>/dev/null; then
        gmessages_bin=$(command -v gmessages)
    elif [[ -f "$CLAUDE_DIR/mcp-servers/gmessages/gmessages.exe" ]]; then
        gmessages_bin="$CLAUDE_DIR/mcp-servers/gmessages/gmessages.exe"
    elif [[ -f "$CLAUDE_DIR/mcp-servers/gmessages/gmessages" ]]; then
        gmessages_bin="$CLAUDE_DIR/mcp-servers/gmessages/gmessages"
    fi

    # Detect gcloud
    local gcloud_installed=false
    command -v gcloud &>/dev/null && gcloud_installed=true

    # Write config.local.json
    mkdir -p "$CLAUDE_DIR/toolkit-state"
    if command -v node &>/dev/null; then
        node -e "
            const fs = require('fs');
            const data = {
                platform: process.argv[1],
                toolkit_root: process.argv[2] || null,
                gmessages_binary: process.argv[3] || null,
                gcloud_installed: process.argv[4] === 'true'
            };
            fs.writeFileSync(process.argv[5], JSON.stringify(data, null, 2) + '\n');
        " "$platform" "$tk_root" "$gmessages_bin" "$gcloud_installed" "$local_config" 2>/dev/null
    else
        # Fallback: write JSON manually
        cat > "$local_config" << LOCALEOF
{
  "platform": "$platform",
  "toolkit_root": ${tk_root:+\"$tk_root\"}${tk_root:-null},
  "gmessages_binary": ${gmessages_bin:+\"$gmessages_bin\"}${gmessages_bin:-null},
  "gcloud_installed": $gcloud_installed
}
LOCALEOF
    fi
}
rebuild_local_config
```

- [ ] **Step 2: Verify session-start.sh parses without errors**

Run: `bash -n ~/.claude/plugins/destinclaude/core/hooks/session-start.sh`
Expected: No output (clean parse)

- [ ] **Step 3: Test rebuild_local_config generates correct output on this machine**

Run: `CLAUDE_DIR=~/.claude TOOLKIT_ROOT=~/.claude/plugins/destinclaude bash -c 'source ~/.claude/plugins/destinclaude/core/hooks/lib/backup-common.sh; eval "$(sed -n "/^rebuild_local_config/,/^}/p" ~/.claude/plugins/destinclaude/core/hooks/session-start.sh)"; rebuild_local_config; cat ~/.claude/toolkit-state/config.local.json'`

Expected: JSON with `platform: "windows"`, correct `toolkit_root`, detected binaries.

- [ ] **Step 4: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/session-start.sh
git commit -m "feat: rebuild_local_config() generates config.local.json at session start"
```

---

### Task 3: One-time migration — strip machine-specific keys from config.json

**Files:**
- Modify: `core/hooks/session-start.sh`

On first run after this change, strip machine-specific keys from `config.json` so only portable data remains. Note: this migration **regenerates** local values from the environment (via `rebuild_local_config()` in Task 2) rather than copying them from config.json. This is safe because all four machine-specific values (platform, toolkit_root, gmessages_binary, gcloud_installed) are trivially detectable — there's no user-authored content in these fields that would be lost. `rebuild_local_config()` runs before this migration in session-start's execution order.

- [ ] **Step 1: Add migration logic after rebuild_local_config()**

Add this block right after the `rebuild_local_config` call:

```bash
# --- One-time migration: strip machine-specific keys from config.json ---
# If config.json still has machine-specific keys (platform, toolkit_root, etc.),
# remove them so only portable data remains. config.local.json now owns these.
if [[ -f "$CONFIG_FILE" ]] && command -v node &>/dev/null; then
    node -e "
        const fs = require('fs');
        const path = process.argv[1];
        try {
            const c = JSON.parse(fs.readFileSync(path, 'utf8'));
            const localKeys = ['platform', 'toolkit_root', 'gmessages_binary', 'gcloud_installed'];
            let changed = false;
            for (const k of localKeys) {
                if (k in c) { delete c[k]; changed = true; }
            }
            if (changed) {
                fs.writeFileSync(path, JSON.stringify(c, null, 2) + '\n');
            }
        } catch {}
    " "$CONFIG_FILE" 2>/dev/null || true
fi
```

- [ ] **Step 2: Verify session-start.sh still parses**

Run: `bash -n ~/.claude/plugins/destinclaude/core/hooks/session-start.sh`
Expected: No output

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/session-start.sh
git commit -m "feat: one-time migration strips machine-specific keys from config.json"
```

---

### Task 4: Update personal-sync.sh to exclude local config and mcp-config

**Files:**
- Modify: `core/hooks/personal-sync.sh`

Two changes: (1) skip `config.local.json` in the sync scope, (2) don't sync `mcp-config.json`.

- [ ] **Step 1: Add config.local.json exclusion to path filter**

In the `case` statement (around line 30), add a filter that exits early for `config.local.json`:

```bash
case "$FILE_PATH" in
    */toolkit-state/config.local.json) exit 0 ;;   # Machine-specific, never sync
    */mcp-servers/mcp-config.json) exit 0 ;;        # Machine-specific, never sync
    */projects/*/memory/*) ;;
    */CLAUDE.md) ;;
    */toolkit-state/config.json) ;;
    */encyclopedia/*) ;;
    */skills/*)
        if type is_toolkit_owned &>/dev/null && is_toolkit_owned "$FILE_PATH"; then
            exit 0
        fi
        ;;
    *) exit 0 ;;
esac
```

- [ ] **Step 2: Verify personal-sync.sh parses without errors**

Run: `bash -n ~/.claude/plugins/destinclaude/core/hooks/personal-sync.sh`
Expected: No output

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/personal-sync.sh
git commit -m "feat: exclude config.local.json and mcp-config.json from personal sync"
```

---

### Task 5: Update session-start.sh pull to skip local config

**Files:**
- Modify: `core/hooks/session-start.sh`

The session-start pull from Drive/GitHub/iCloud currently pulls `toolkit-state/config.json`. We need to ensure it does NOT pull `config.local.json` (which shouldn't exist on the remote, but belt-and-suspenders).

- [ ] **Step 1: Add exclusion to Drive pull**

In the `drive)` case of the personal data pull section, the `rclone copy` for config already targets `config.json` specifically — no change needed there. But add an explicit exclusion comment and ensure no wildcard pull could grab `config.local.json`:

The current code at the Drive pull section already does:
```bash
rclone copy "$DRIVE_SOURCE/toolkit-state/config.json" "$CLAUDE_DIR/toolkit-state/" --update
```

This is file-specific, not a directory sync, so `config.local.json` won't be pulled. Same for GitHub and iCloud — they each target `config.json` specifically. **No code change needed** — just verify.

- [ ] **Step 2: Verify no pull path would overwrite config.local.json**

Grep session-start.sh for any `toolkit-state/` directory-level sync:

Run: `grep -n 'toolkit-state' ~/.claude/plugins/destinclaude/core/hooks/session-start.sh`

Expected: Only references to `config.json` specifically, no directory-level syncs of `toolkit-state/`.

- [ ] **Step 3: Commit (skip if no changes needed)**

If verification passes with no changes, skip this commit.

---

### Task 6: Update statusline.sh to use config_get pattern

**Files:**
- Modify: `core/hooks/statusline.sh`

The statusline currently reads `toolkit_root` directly from `config.json` with inline Node.js. It should use the shared `config_get` (via sourcing `backup-common.sh`) which now checks `config.local.json` first.

- [ ] **Step 1: Read current statusline.sh toolkit_root logic**

Read the relevant lines (around line 128-129 based on grep results).

- [ ] **Step 2: Replace inline config read to check config.local.json first**

The current code at lines 128-131 reads `toolkit_root` only from `config.json`:
```bash
if command -v node &>/dev/null && [[ -f "$HOME/.claude/toolkit-state/config.json" ]]; then
    _TK=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));if(c.toolkit_root)console.log(c.toolkit_root)}catch{}" "$HOME/.claude/toolkit-state/config.json" 2>/dev/null)
```

Replace with a loop that checks config.local.json first (where `toolkit_root` now lives after migration):
```bash
_TK=""
if command -v node &>/dev/null; then
    for _cfg in "$HOME/.claude/toolkit-state/config.local.json" "$HOME/.claude/toolkit-state/config.json"; do
        [[ ! -f "$_cfg" ]] && continue
        _TK=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));if(c.toolkit_root)console.log(c.toolkit_root)}catch{}" "$_cfg" 2>/dev/null)
        [[ -n "$_TK" ]] && break
    done
fi
```

**Why not source backup-common.sh here:** Statusline runs on every prompt keystroke. Sourcing a full library adds overhead. A simple two-file loop is lightweight and self-contained.

- [ ] **Step 3: Verify statusline.sh parses**

Run: `bash -n ~/.claude/hooks/statusline.sh`
Expected: No output

- [ ] **Step 4: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/statusline.sh
git commit -m "feat: statusline reads toolkit_root from config.local.json first"
```

---

### Task 7: Update post-update.sh to read from both config files

**Files:**
- Modify: `scripts/post-update.sh`

Similar to statusline — this reads `toolkit_root` directly from `config.json`. After the split, it needs to check `config.local.json` first.

- [ ] **Step 1: Read current post-update.sh toolkit_root logic**

Read the relevant lines (around line 134 based on grep).

- [ ] **Step 2: Add config.local.json check before config.json fallback**

Replace the single `json_read "$CONFIG_FILE" "toolkit_root"` with a check that tries the local file first:

```bash
LOCAL_CONFIG_FILE="$CLAUDE_HOME/toolkit-state/config.local.json"
TOOLKIT_ROOT=""
if [[ -f "$LOCAL_CONFIG_FILE" ]]; then
    TOOLKIT_ROOT="$(json_read "$LOCAL_CONFIG_FILE" "toolkit_root" 2>/dev/null)" || true
fi
if [[ -z "$TOOLKIT_ROOT" ]]; then
    TOOLKIT_ROOT="$(json_read "$CONFIG_FILE" "toolkit_root")"
fi
```

- [ ] **Step 3: Verify post-update.sh parses**

Run: `bash -n ~/.claude/plugins/destinclaude/scripts/post-update.sh`
Expected: No output

- [ ] **Step 4: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add scripts/post-update.sh
git commit -m "feat: post-update.sh reads toolkit_root from config.local.json first"
```

---

### Task 8: Update session-start.sh direct config reads

**Files:**
- Modify: `core/hooks/session-start.sh`

Session-start has several places where it reads config values with inline Node.js rather than using `config_get()`. After backup-common.sh is sourced (it already is, line 14-16), these should use `config_get()` which now handles the two-file merge.

**Note on TOOLKIT_ROOT (lines 24-26):** The inline `toolkit_root` read intentionally stays as-is. It runs BEFORE `rebuild_local_config()` (which needs `TOOLKIT_ROOT` already resolved). The existing flow is: (1) resolve TOOLKIT_ROOT via config.json + walk-up fallback, (2) `rebuild_local_config()` captures it into config.local.json. Converting this to `config_get()` would create a chicken-and-egg problem since config.local.json doesn't exist yet. After migration strips `toolkit_root` from config.json, the walk-up fallback (lines 28-39) becomes the primary resolver, which is correct.

- [ ] **Step 1: Replace inline PERSONAL_SYNC_BACKEND read (sync health check section)**

Current:
```bash
_PS_BACKEND=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(c.PERSONAL_SYNC_BACKEND||'none')}catch{console.log('none')}" "$CONFIG_FILE" 2>/dev/null) || _PS_BACKEND="none"
```

Replace with:
```bash
if type config_get &>/dev/null; then
    _PS_BACKEND=$(config_get "PERSONAL_SYNC_BACKEND" "none")
else
    _PS_BACKEND=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(c.PERSONAL_SYNC_BACKEND||'none')}catch{console.log('none')}" "$CONFIG_FILE" 2>/dev/null) || _PS_BACKEND="none"
fi
```

- [ ] **Step 2: Verify session-start.sh parses**

Run: `bash -n ~/.claude/plugins/destinclaude/core/hooks/session-start.sh`
Expected: No output

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/session-start.sh
git commit -m "refactor: session-start uses config_get() for PERSONAL_SYNC_BACKEND read"
```

---

### Task 9: Stop git-committing mcp-config.json in session-start

**Files:**
- Modify: `core/hooks/session-start.sh`
- Modify: `~/.claude/.gitignore`

Critical gap: session-start.sh extracts MCP config from `.claude.json` and **git-commits** `mcp-config.json` (lines 54-79). Even though personal-sync no longer syncs it (Task 4), the `~/.claude` git repo still pushes it to GitHub, which means it syncs to other devices via `git pull`. This undermines the entire point of D3.

Two fixes: (1) remove the `git add/commit` of mcp-config.json from session-start, (2) add it to `.gitignore`.

We keep the extraction itself — `mcp-config.json` is still useful locally as a readable snapshot of MCP server config. We just stop syncing it.

- [ ] **Step 1: Remove git commit of mcp-config.json from session-start.sh**

Find the block (around lines 54-79) that extracts and commits mcp-config.json. Remove the `git add`/`git commit` lines but keep the extraction/write:

Current (lines 73-78):
```bash
        if [[ "$EXTRACTED" != "$EXISTING" ]]; then
            echo "$EXTRACTED" > "$MCP_CONFIG"
            # Stage and commit so git-pull doesn't conflict
            cd "$CLAUDE_DIR"
            git add "$MCP_CONFIG" 2>/dev/null && \
                git commit -m "auto: mcp-config.json" --no-gpg-sign 2>/dev/null || true
        fi
```

Replace with:
```bash
        if [[ "$EXTRACTED" != "$EXISTING" ]]; then
            echo "$EXTRACTED" > "$MCP_CONFIG"
            # Note: mcp-config.json is machine-specific (contains absolute paths,
            # platform-specific servers). NOT git-committed. See cross-device-sync design D3.
        fi
```

- [ ] **Step 2: Add mcp-config.json to ~/.claude/.gitignore**

Add under the "Machine-specific" section:
```
mcp-servers/mcp-config.json
```

Also add `config.local.json` here (belt-and-suspenders even though `toolkit-state/` is already gitignored):
```
toolkit-state/config.local.json
```

- [ ] **Step 3: Remove mcp-config.json from git tracking**

Since it's already tracked, adding it to .gitignore alone won't stop it. Remove it from the index:

```bash
cd ~/.claude
git rm --cached mcp-servers/mcp-config.json 2>/dev/null || true
```

- [ ] **Step 4: Commit**

```bash
cd ~/.claude
git add .gitignore
git commit -m "chore: stop tracking mcp-config.json (machine-specific, rebuilt per-device)"
```

Also commit the session-start change:
```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/session-start.sh
git commit -m "fix: stop git-committing mcp-config.json (cross-device sync conflict source)"
```

---

### Task 10: End-to-end verification

- [ ] **Step 1: Run the full session-start hook manually**

Run: `bash ~/.claude/hooks/session-start.sh 2>&1 | head -20`

Expected: No errors. `config.local.json` generated. `config.json` has machine-specific keys stripped.

- [ ] **Step 2: Verify config.local.json was created with correct values**

Run: `cat ~/.claude/toolkit-state/config.local.json`
Expected: `platform: "windows"`, valid `toolkit_root`, detected binaries.

- [ ] **Step 3: Verify config.json no longer has machine-specific keys**

Run: `node -e "const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); console.log('platform' in c, 'toolkit_root' in c, 'gcloud_installed' in c)" ~/.claude/toolkit-state/config.json`
Expected: `false false false`

- [ ] **Step 4: Verify config_get reads from config.local.json for toolkit_root**

Run: `source ~/.claude/plugins/destinclaude/core/hooks/lib/backup-common.sh && config_get toolkit_root`
Expected: The toolkit root path (e.g., `/c/Users/desti/.claude/plugins/destinclaude`)

- [ ] **Step 5: Verify personal-sync skips config.local.json**

Run: `echo '{"tool_input":{"file_path":"C:\\Users\\desti\\.claude\\toolkit-state\\config.local.json"}}' | bash ~/.claude/hooks/personal-sync.sh 2>&1`
Expected: Immediate exit (no output, no sync attempt)

- [ ] **Step 6: Verify mcp-config.json is no longer git-tracked**

Run: `cd ~/.claude && git ls-files mcp-servers/mcp-config.json`
Expected: No output (file is not tracked)

- [ ] **Step 7: Spec updates (deferred to System Change Protocol)**

After implementation, update specs per the System Change Checklist:
- `backup-system-spec.md` v4.0 → v4.1: add config.local.json, mcp-config.json exclusion
- `personal-sync-spec.md` v2.0 → v2.1: document config.local.json exclusion, mcp-config.json exclusion
- Update design doc D3 to note that `mcp_servers` intent list is deferred
