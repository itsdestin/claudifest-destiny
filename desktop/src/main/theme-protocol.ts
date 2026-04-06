import { protocol, net } from 'electron';
import path from 'path';
import os from 'os';

const THEMES_DIR = path.join(os.homedir(), '.claude', 'destinclaude-themes');

/**
 * Registers the theme-asset:// custom protocol.
 * Resolves theme-asset://<slug>/<relative-path> to the file on disk.
 * Must be called before any BrowserWindow is created (in app.whenReady).
 */
export function registerThemeProtocol(): void {
  protocol.handle('theme-asset', (request) => {
    const url = new URL(request.url);
    const slug = url.hostname;
    const assetPath = decodeURIComponent(url.pathname.replace(/^\//, ''));

    // Security: resolve and verify path is within the theme's directory
    const themePath = path.join(THEMES_DIR, slug);
    const resolvedPath = path.resolve(themePath, assetPath);

    if (!resolvedPath.startsWith(themePath + path.sep) && resolvedPath !== themePath) {
      return new Response('Forbidden', { status: 403 });
    }

    return net.fetch(`file://${resolvedPath}`);
  });
}
