---
description: Check for toolkit updates and install the latest version
---

Check for and install updates to the DestinClaude toolkit.

## Steps

1. **Read current version.** Check the VERSION file in the toolkit root directory (the parent of this plugin's directory). Store this as `CURRENT_VERSION`.

2. **Fetch latest release info.** Run in the toolkit root directory:
   ```bash
   git fetch --tags origin 2>/dev/null
   ```
   If this fails (e.g., offline), tell the user: "Can't check for updates — you appear to be offline. Try again when you have an internet connection."

3. **Find the latest release tag.** Run:
   ```bash
   git tag --sort=-v:refname | head -1
   ```
   Store this as `LATEST_TAG`. If no tags exist, tell the user: "No releases found. You're running a development version."

4. **Compare versions.** If `CURRENT_VERSION` matches the latest tag (strip the leading `v` for comparison), tell the user: "You're on the latest version (CURRENT_VERSION)." and stop.

5. **Show what changed.** If behind, show the changelog between versions:
   ```bash
   git log --oneline CURRENT_TAG..LATEST_TAG
   ```
   Present this in plain language: "Here's what changed since your version:" followed by a readable summary of the commits.

6. **Ask to proceed.** Ask the user: "Would you like to update to LATEST_TAG?"

7. **Merge the update.** If the user agrees:
   ```bash
   git merge LATEST_TAG --no-edit
   ```
   Use merge (not rebase) — this is safer for non-technical users and avoids interactive editor invocations.

8. **Handle merge conflicts.** If the merge has conflicts:
   - List the conflicted files
   - Explain in plain language what each conflict is about
   - Offer to help resolve them one by one
   - After resolving, complete the merge with `git add` and `git commit`

9. **Check for new dependencies.** After a successful merge, check if the setup wizard's verification phase should run (look for changes in plugin.json files or new dependency requirements). If so, suggest: "This update may have added new features. Want me to run a quick setup check?"

10. **Update VERSION.** Write the new version (without the `v` prefix) to the VERSION file in the toolkit root.

11. **Check for new MCPs.** Read `<toolkit_root>/core/mcp-manifest.json`. Detect the current platform. Load registered MCP servers from `~/.claude.json`. For each manifest entry matching the current platform that is NOT registered in `~/.claude.json`:
    - Collect it as a "new available MCP"

    If any are found, tell the user:

    ```
    New MCP servers are available in this version:

      macos-automator ........ AppleScript + JXA automation for any Mac app
      home-mcp ............... HomeKit device, scene, and automation control

    Run /health to register them — it takes about 30 seconds.
    ```

    Only show `auto: true` MCPs here. For `auto: false` MCPs that are unregistered, add a separate note:

    ```
    These MCPs require additional setup (run /setup-wizard to configure):
      imessages .............. Requires Full Disk Access for your terminal
    ```

    If nothing is new/missing, skip this step silently.

12. **Register missing marketplace plugins.** Load `~/.claude/settings.json`. Check the `enabledPlugins` key (create it if missing). For each plugin in the canonical list below that is NOT already present, add it with value `true` and write the file back. Do this silently without asking — plugins are zero-config and download automatically on first use.

    Canonical plugin list:
    ```
    superpowers@claude-plugins-official
    claude-md-management@claude-plugins-official
    code-review@claude-plugins-official
    code-simplifier@claude-plugins-official
    commit-commands@claude-plugins-official
    feature-dev@claude-plugins-official
    hookify@claude-plugins-official
    skill-creator@claude-plugins-official
    explanatory-output-style@claude-plugins-official
    learning-output-style@claude-plugins-official
    context7@claude-plugins-official
    linear@claude-plugins-official
    playwright@claude-plugins-official
    plugin-dev@claude-plugins-official
    ```

    If any were added, include a line in the final confirmation:
    ```
    Registered N new plugin(s): hookify, linear, plugin-dev
    ```
    If all were already registered, skip this line.

13. **Confirm.** Tell the user: "Updated to LATEST_TAG. You're all set."
