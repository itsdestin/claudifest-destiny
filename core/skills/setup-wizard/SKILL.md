---
name: setup-wizard
description: Interactive toolkit installer — inventories the user's environment, resolves conflicts, installs dependencies, personalizes templates, and verifies everything works. Invoked via /setup or when user says "set me up."
---

# ClaudifestDestiny Setup Wizard

You are the setup wizard for the ClaudifestDestiny toolkit. Walk the user through a complete installation conversationally — explaining each step in plain language. The user may be non-technical; never assume familiarity with developer tools.

**Golden rule:** This wizard is **additive and non-destructive**. Never overwrite, delete, or modify existing user files without explicit permission. Always back up before changing anything.

**Runtime variables:** Throughout this process, collect configuration values and store them in `~/.claude/toolkit-state/config.json`. Create the directory if it doesn't exist.

---

## Phase 1: Environment Inventory

Before installing anything, understand what's already on the user's system.

### Step 1: Detect the platform

Run this in Bash to detect the OS:

```bash
case "$(uname -s)" in
    Darwin*)  echo "macos" ;;
    MINGW*|MSYS*|CYGWIN*)  echo "windows" ;;
    Linux*)  echo "linux" ;;
esac
```

Store the result as `platform` in your working state. You'll use it throughout setup to choose platform-appropriate install commands.

### Step 2: Find the toolkit root

The toolkit is a Claude Code plugin. Determine where it's installed by checking the directory this skill lives in — navigate up from the skill path to find the monorepo root (the directory containing `VERSION` and `core/`). Store this as `toolkit_root`.

### Step 3: Scan for existing Claude Code setup

Check for each of the following and record what you find:

1. **Existing skills** — Run `ls ~/.claude/skills/` if it exists. Compare against toolkit skill names (journaling-assistant, encyclopedia-update, encyclopedia-compile, encyclopedia-interviewer, encyclopedia-librarian, inbox-processor, skill-creator, google-drive).
2. **Existing CLAUDE.md** — Read `~/.claude/CLAUDE.md` if it exists. Note its length and whether it contains any of the toolkit's section markers (`## Installed Skills`, `## Specs System`, `## System Change Protocol`, `## MCP Server Configuration`).
3. **Existing hooks** — Check `~/.claude/hooks/` for any hook scripts. List what you find.
4. **Existing plugins** — Check if any Claude Code plugins are already installed by looking at the user's Claude Code settings or scanning `~/.claude/plugins/` if it exists.
5. **Existing MCP servers** — Check `~/.claude.json` or `~/.claude/mcp.json` for configured MCP servers. Note which ones are present.
6. **Existing memory system** — Check if `~/.claude/memory/` or any project-level memory directories exist.

### Step 4: Present findings

Show the user a clear summary:

```
Here's what I found on your system:

Platform: [macOS / Windows / Linux]
Toolkit location: [path]

Existing setup:
  Skills: [list or "None found"]
  CLAUDE.md: [exists with N lines / not found]
  Hooks: [list or "None found"]
  Plugins: [list or "None found"]
  MCP servers: [list or "None found"]
  Memory: [exists / not found]
```

If conflicts exist (toolkit skills that share names with existing skills, existing hooks at the same trigger points, etc.), note them — they'll be resolved in Phase 2.

If nothing exists, say: "Clean slate — this will be a fresh install. Easy!"

**Wait for the user to acknowledge before proceeding to Phase 2.**

---

## Phase 2: Conflict Resolution

If Phase 1 found no existing setup, skip to Phase 3.

For each conflict discovered in Phase 1, resolve it conversationally with the user. **Always back up before modifying anything.**

### Step 1: Create backup directory

```bash
mkdir -p ~/.claude/backups/pre-toolkit
```

### Step 2: Resolve CLAUDE.md conflicts

If `~/.claude/CLAUDE.md` exists:

1. Back it up: `cp ~/.claude/CLAUDE.md ~/.claude/backups/pre-toolkit/CLAUDE.md`
2. Check if it already contains toolkit section markers (added during a previous install)
3. If toolkit sections exist: tell the user "Looks like a previous install left some toolkit sections. I'll update them in place."
4. If no toolkit sections: tell the user "You have an existing CLAUDE.md. I'll **append** the toolkit sections at the end — your existing content stays untouched."

Do NOT modify CLAUDE.md yet — that happens in Phase 5 (Personalization). Just record the strategy.

### Step 3: Resolve hook conflicts

For each hook script in the user's `~/.claude/hooks/` that shares a filename or trigger point with a toolkit hook:

1. Back up: `cp ~/.claude/hooks/<name> ~/.claude/backups/pre-toolkit/<name>`
2. Show the user both versions side by side (a brief summary, not full source)
3. Offer three options:
   - **Merge** — combine both hooks into one script (you'll do this programmatically)
   - **Keep yours** — skip installing the toolkit's version of this hook
   - **Use toolkit's** — replace with the toolkit version (backup already saved)
4. Record the user's choice for each conflict

### Step 4: Resolve skill name conflicts

For each skill directory in `~/.claude/skills/` that shares a name with a toolkit skill:

1. Tell the user: "You already have a skill called `<name>`. The toolkit also includes one with that name."
2. Show a brief comparison (description from each)
3. Offer:
   - **Keep yours** — the toolkit version won't be installed
   - **Use toolkit's** — replace with toolkit version (original backed up)
   - **Rename yours** — rename the user's existing skill so both can coexist
4. Record the choice

### Step 5: Resolve MCP server conflicts

If any existing MCP server names match toolkit servers (e.g., `gmessages`, `todoist`):

1. Show the user the existing config vs. what the toolkit would set up
2. Offer: **Keep yours** / **Use toolkit's** / **Skip this server**
3. Record the choice

**After all conflicts are resolved, confirm:** "All conflicts resolved. Here's the plan: [summary of decisions]. Ready to choose your layers?"

---

## Phase 3: Layer Selection

Present the installable layers and let the user choose.

### Step 1: Explain the layers

Tell the user:

```
ClaudifestDestiny has four layers you can install:

  Core (always installed)
    Infrastructure that makes everything else work — git hooks for
    file protection, a specs system for documenting decisions, memory
    templates, and CLAUDE.md configuration fragments.

  Life (recommended)
    A personal knowledge system — daily journaling with a
    conversational assistant, and an Encyclopedia system that builds
    a living biography from your journal entries over time.

  Productivity (recommended)
    Task management and communication — an inbox processor that
    triages notes from your phone, a skill creator for building
    new Claude skills, and a Google Messages integration for
    reading/sending texts.

  Modules (optional, pick individually)
    Specialized tools for niche use cases:
    - Elections Notebook — tracks Arizona legislative candidates
      and campaign finance data
    - JLBC Fiscal Note — drafts fiscal impact analyses for
      Arizona legislation

Which would you like?
  1. Full install (everything)
  2. Core + Life + Productivity (skip modules)
  3. Core only (just the basics)
  4. Let me pick individually
```

### Step 2: Handle individual selection

If the user picks option 4, walk through each layer and each module, asking yes/no.

### Step 3: Record selections

Store the selected layers in `~/.claude/toolkit-state/config.json`:

```json
{
  "platform": "<detected>",
  "toolkit_root": "<path>",
  "installed_layers": ["core", "life", "productivity"],
  "installed_modules": ["elections-notebook"],
  "conflict_resolutions": { ... },
  "installed_at": "<ISO timestamp>"
}
```

**Proceed to Phase 4.**
