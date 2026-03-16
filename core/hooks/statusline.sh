#!/bin/bash
# Claude Code status line script
# Line 1: Sync status (from .sync-status file)
# Line 2: Model + context remaining + session cost

STATUS_FILE="$HOME/.claude/.sync-status"

# Read session JSON from stdin and extract fields
SESSION=$(cat)

PARSED=$(echo "$SESSION" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  try{const j=JSON.parse(d);
    const m=j.model?.display_name||'unknown';
    const rem=j.context_window?.remaining_percentage!=null?Math.round(j.context_window.remaining_percentage):100;
    console.log(m+'\t'+rem);
  }catch{console.log('unknown\t100')}
})" 2>/dev/null)

IFS=$'\t' read -r MODEL REMAINING <<< "$PARSED"

# Defaults if node failed
MODEL=${MODEL:-unknown}
REMAINING=${REMAINING:-100}

# ANSI colors
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
DIM="\033[2m"
RESET="\033[0m"

# Read sync status
SYNC=""
if [ -f "$STATUS_FILE" ]; then
    SYNC=$(cat "$STATUS_FILE" 2>/dev/null)
fi

# Color the sync status
if [[ "$SYNC" == OK:* ]] || [[ "$SYNC" == "Changes Synced"* ]]; then
    SYNC_DISPLAY="${GREEN}${SYNC}${RESET}"
elif [[ "$SYNC" == WARN:* ]]; then
    SYNC_DISPLAY="${YELLOW}${SYNC}${RESET}"
elif [[ "$SYNC" == ERR:* ]]; then
    SYNC_DISPLAY="${RED}${SYNC}${RESET}"
else
    SYNC_DISPLAY="${DIM}No sync status${RESET}"
fi

# Color context remaining (inverted — low remaining = warning)
if [ "$REMAINING" -lt 20 ] 2>/dev/null; then
    CTX_COLOR="$RED"
elif [ "$REMAINING" -lt 50 ] 2>/dev/null; then
    CTX_COLOR="$YELLOW"
else
    CTX_COLOR="$GREEN"
fi

# Output
echo -e "$SYNC_DISPLAY"
echo -e "${DIM}${MODEL}${RESET}  ${CTX_COLOR}${REMAINING}% remaining context${RESET}"
