#!/bin/bash
# Hook: UserPromptSubmit — intercept /todo messages and capture to Todoist
# without interrupting Claude's current task flow.
set -euo pipefail

input=$(cat)
prompt=$(echo "$input" | jq -r '.user_prompt // ""')

# Only act on messages starting with /todo (case-insensitive first match)
if [[ ! "$prompt" =~ ^/todo[[:space:]] ]]; then
  exit 0
fi

# Extract the note (everything after "/todo ")
note="${prompt#/todo }"
note=$(echo "$note" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

if [[ -z "$note" ]]; then
  echo '{"systemMessage": "The user typed /todo with no note. Ask what they want to capture, then continue your previous task."}' >&2
  exit 2
fi

# Call Todoist REST API v1 to create task in Claude's Inbox
response=$(curl -s -w "\n%{http_code}" -X POST \
  "https://api.todoist.com/api/v1/tasks" \
  -H "Authorization: Bearer $TODOIST_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg content "$note" --arg project "6g99cPHJ5cX2cRxC" \
    '{content: $content, project_id: $project}')" 2>/dev/null)

http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | head -n -1)

if [[ "$http_code" =~ ^2 ]]; then
  # Success — tell Claude it's handled, resume previous work
  echo "{\"systemMessage\": \"[Todo Hook] Captured to inbox: \\\"$note\\\". Briefly confirm (e.g. 'Captured: \\\"$note\\\"') then seamlessly continue your previous task. Do NOT invoke the todo skill.\"}"
else
  # API failed — fall back to telling Claude to use MCP
  echo "{\"systemMessage\": \"[Todo Hook] Todoist API call failed (HTTP $http_code). Use the Todoist MCP add-tasks tool to add this note to Claude's Inbox (project 6g99cPHJ5cX2cRxC): \\\"$note\\\". Then continue your previous task.\"}"
fi
