#!/usr/bin/env node
/**
 * Patches node-pty's unixTerminal.js to fix a double-replacement bug that
 * causes `posix_spawn failed: No such file or directory` when spawning a PTY
 * from system Node.js (as opposed to Electron's Node.js).
 *
 * Root cause: node-pty does `.replace('app.asar', 'app.asar.unpacked')` to
 * redirect spawn-helper to the unpacked path. When loaded by Electron, paths
 * are virtual (e.g. `app.asar/...`) so the replacement works correctly. But
 * when loaded by system Node.js (which is how pty-worker.js runs), the path
 * already resolves to `app.asar.unpacked/...` on disk, so the replacement
 * double-fires and produces `app.asar.unpacked.unpacked/...`, which doesn't exist.
 *
 * Fix: use a negative lookahead so the replacement only applies when the path
 * does NOT already contain `app.asar.unpacked`.
 */

const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '../node_modules/node-pty/lib/unixTerminal.js');

if (!fs.existsSync(target)) {
  console.log('patch-node-pty: file not found, skipping');
  process.exit(0);
}

const original = "helperPath.replace('app.asar', 'app.asar.unpacked')";
const patched = "helperPath.replace(/app\\.asar(?!\\.unpacked)/, 'app.asar.unpacked')";

let content = fs.readFileSync(target, 'utf8');
if (content.includes(patched)) {
  console.log('patch-node-pty: already patched, skipping');
  process.exit(0);
}

if (!content.includes(original)) {
  console.log('patch-node-pty: pattern not found (may be a newer node-pty version), skipping');
  process.exit(0);
}

content = content.replace(original, patched);
fs.writeFileSync(target, content);
console.log('patch-node-pty: patched unixTerminal.js — spawn-helper path resolution fixed');
