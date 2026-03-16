# Statusline & Auto-Title — Spec

**Version:** 1.2
**Last updated:** 2026-03-16
**Feature location:** `~/.claude/statusline.sh`, `~/.claude/hooks/title-update.sh`, `~/.claude/hooks/usage-fetch.js`

## Purpose

A real-time information display system for Claude Code sessions. Three components work together: (1) **statusline.sh** renders a multi-line status bar showing the current topic, sync status, model/context info, and API usage limits; (2) **title-update.sh** periodically prompts Claude to set a human-readable topic for the session; (3) **usage-fetch.js** retrieves and caches API usage/rate-limit data from the Anthropic OAuth endpoint.

## User Mandates

- All statusline items, chat names, sync statuses, and menu options must use Title Case (2026-03-15)
- Auto-Title reminders must use Unix paths (`/tmp/...`) for Bash echo commands (2026-03-16, replaces 2026-03-15 Write tool mandate)
- Topic summaries must be 3–5 words in Title Case (2026-03-15)

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Per-session topic files in `/tmp/claude-topics/` | Avoids `~/.claude/` permission issues and backup noise; multiple sessions don't clobber each other | `~/.claude/` subfolder (rejected: triggers backup hooks on every topic write, permission issues) |
| Adaptive throttle on Auto-Title reminders | 2-minute interval while topic is still "New Session" (aggressive nag), 10-minute interval once titled (gentle refresh). Solves 37% miss rate from v1.0 where untitled sessions stayed untitled forever. | Fixed 10-minute for all (rejected: too patient with untitled sessions), every tool use (rejected: too noisy once titled), manual only (rejected: topics would never get set) |
| Bash echo instead of Write tool | Topic files are trivial one-liners in `/tmp/`. Write tool requires a Read-first step that adds friction and errors ("Error writing file" if skipped). Bash echo is atomic, single-step, no preconditions. | Write tool (rejected: requires Read first, causes user-visible errors, adds 2 tool calls for 1 line) |
| Usage data cached with 5-minute TTL | Keeps statusline snappy while limiting API calls; stale cache served on failure for resilience | No cache (rejected: API call on every statusline render would be slow), longer TTL (rejected: usage data becomes misleading near rate limits) |
| Node.js for JSON parsing in statusline | Already available in the environment; avoids Python startup overhead for a latency-sensitive path | Python (rejected: slower startup), jq (rejected: not reliably installed on Windows/Git Bash), pure bash (rejected: fragile JSON parsing) |
| Color thresholds: green/yellow/red at standard breakpoints | Context remaining: <50% yellow, <20% red. Usage: ≥50% yellow, ≥80% red. Intuitive traffic-light pattern. | Single color (rejected: loses at-a-glance urgency signal) |
| Prune topic/marker files older than 7 days, at most once per day | Prevents `/tmp/claude-topics/` from accumulating stale files across sessions without running cleanup on every invocation | No cleanup (rejected: unbounded growth), cleanup on every invocation (rejected: unnecessary filesystem churn) |
| `hookSpecificOutput` JSON for Auto-Title delivery | Ensures the reminder appears in Claude's context as a system-reminder, not as plain hook output that might be ignored | Plain stdout (rejected: not reliably surfaced to Claude), file-based signaling (rejected: Claude doesn't poll files) |

## Current Implementation

### Data Flow

```
[Every tool use] → title-update.sh
  ├─ Reads session_id from stdin JSON
  ├─ Checks marker file for 10-min throttle
  ├─ If due: emits hookSpecificOutput with [Auto-Title] reminder
  └─ Claude writes topic to /tmp/claude-topics/topic-{session_id}

[Statusline render] → statusline.sh
  ├─ Parses session JSON (model, context %, session_id)
  ├─ Reads ~/.claude/.sync-status for sync display
  ├─ Calls usage-fetch.js for rate-limit data
  ├─ Reads /tmp/claude-topics/topic-{session_id} for topic
  └─ Outputs 2-4 lines with ANSI coloring

[Usage fetch] → usage-fetch.js
  ├─ Checks ~/.claude/.usage-cache.json (5-min TTL)
  ├─ If stale: reads OAuth token from ~/.claude/.credentials.json
  ├─ Fetches https://api.anthropic.com/api/oauth/usage
  └─ Writes cache, outputs JSON
```

### Output Format (up to 4 lines)

1. **Topic** (bold) — only shown if topic file exists and is non-empty
2. **Sync status** — colored green/yellow/red based on prefix (OK/WARN/ERR)
3. **Model + Context** — dim model name, colored context remaining percentage
4. **Usage** — 5h and 7d utilization with reset times (only if data available)

### File Locations

| File | Purpose | Lifetime |
|------|---------|----------|
| `/tmp/claude-topics/topic-{sid}` | Session topic text | Pruned after 7 days |
| `/tmp/claude-topics/marker-{sid}` | Throttle timestamp | Pruned after 7 days |
| `/tmp/claude-topics/.prune-marker` | Last-prune timestamp | Persistent |
| `~/.claude/.usage-cache.json` | Cached API usage response | Overwritten every 5 min |
| `~/.claude/.sync-status` | Written by git-sync.sh | Updated on each backup |

## Dependencies

- Depends on: git-sync.sh (writes `.sync-status`), Node.js, Anthropic OAuth credentials (`~/.claude/.credentials.json`), Claude Code session JSON (stdin)
- Depended on by: CLAUDE.md Auto-Title instructions (define Claude's behavior when it sees the reminder)

## Known Bugs / Issues

- (Fixed in v1.2) **37% miss rate:** Claude ignored Auto-Title reminders during complex tasks. Fixed by switching to Bash (eliminates Read-first friction) and adaptive throttle (2-min nag while untitled, 10-min once titled).
- (Fixed in v1.2) **"Error writing file":** Write tool requires Read first; Claude frequently skipped the Read step. Fixed by switching to Bash echo.

## Planned Updates

- **Session cost display:** The session JSON may contain cost data — could be added as a 5th statusline row if available
- **Configurable throttle interval:** Currently hardcoded to 10 minutes; could be made configurable if sessions vary in pace

## Change Log

| Date | Version | What changed | Type | Approved by | Session |
|------|---------|-------------|------|-------------|---------|
| 2026-03-15 | 1.0 | Initial spec | New | — | 118c52ce-0a35-4287-a452-77984243491f |
| 2026-03-16 | 1.2 | Fixed 37% miss rate and Write tool errors: switched to Bash echo (eliminates Read-first requirement), added adaptive throttle (2-min nag while untitled, 10-min refresh once titled), updated CLAUDE.md instructions | Update | — | |
| 2026-03-15 | 1.1 | Fixed stale sync-to-drive.sh references to git-sync.sh | Revised | — | |
