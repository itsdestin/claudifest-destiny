import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../src/main/session-manager';

// Captured callbacks for each spawned PTY
let capturedOnData: ((data: string) => void) | null = null;
let capturedOnExit: ((event: { exitCode: number }) => void) | null = null;

// Mock node-pty
vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    pid: 12345,
    onData: vi.fn((cb: (data: string) => void) => {
      capturedOnData = cb;
    }),
    onExit: vi.fn((cb: (event: { exitCode: number }) => void) => {
      capturedOnExit = cb;
    }),
    write: vi.fn(),
    kill: vi.fn(),
    resize: vi.fn(),
  })),
}));

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnData = null;
    capturedOnExit = null;
    manager = new SessionManager();
  });

  afterEach(() => {
    manager.destroyAll();
  });

  it('creates a session and returns session info', () => {
    const info = manager.createSession({
      name: 'test-session',
      cwd: '/tmp',
      skipPermissions: false,
    });

    expect(info.id).toBeDefined();
    expect(info.name).toBe('test-session');
    expect(info.cwd).toBe('/tmp');
    expect(info.status).toBe('active');
  });

  it('lists all active sessions', () => {
    manager.createSession({ name: 's1', cwd: '/tmp', skipPermissions: false });
    manager.createSession({ name: 's2', cwd: '/tmp', skipPermissions: false });

    const sessions = manager.listSessions();
    expect(sessions).toHaveLength(2);
  });

  it('destroys a session by id', () => {
    const info = manager.createSession({ name: 'test', cwd: '/tmp', skipPermissions: false });
    manager.destroySession(info.id);

    const sessions = manager.listSessions();
    expect(sessions).toHaveLength(0);
  });

  it('spawns claude with --dangerously-skip-permissions when requested', async () => {
    const pty = await import('node-pty');
    manager.createSession({ name: 'skip', cwd: '/tmp', skipPermissions: true });

    const spawnCall = (pty.spawn as any).mock.calls[0];
    const args: string[] = spawnCall[1];
    expect(args).toContain('--dangerously-skip-permissions');
  });

  it('emits pty-output event when PTY produces data', () => {
    const info = manager.createSession({ name: 'test', cwd: '/tmp', skipPermissions: false });

    const listener = vi.fn();
    manager.on('pty-output', listener);

    // Invoke the captured onData callback to simulate PTY output
    expect(capturedOnData).not.toBeNull();
    capturedOnData!('hello world');

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(info.id, 'hello world');
  });

  it('emits session-exit event when PTY exits', () => {
    const info = manager.createSession({ name: 'test', cwd: '/tmp', skipPermissions: false });

    const listener = vi.fn();
    manager.on('session-exit', listener);

    // Invoke the captured onExit callback to simulate PTY exit
    expect(capturedOnExit).not.toBeNull();
    capturedOnExit!({ exitCode: 0 });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(info.id, 0);

    // Session should have been removed from the map
    expect(manager.listSessions()).toHaveLength(0);
  });

  it('does not emit session-exit if session was already destroyed', () => {
    const info = manager.createSession({ name: 'test', cwd: '/tmp', skipPermissions: false });

    const listener = vi.fn();
    manager.on('session-exit', listener);

    // Explicitly destroy first
    manager.destroySession(info.id);

    // Now fire the PTY exit callback — guard should prevent double-emit
    expect(capturedOnExit).not.toBeNull();
    capturedOnExit!({ exitCode: 0 });

    expect(listener).not.toHaveBeenCalled();
  });
});
