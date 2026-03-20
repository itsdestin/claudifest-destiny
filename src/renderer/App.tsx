import React, { useState, useEffect, useRef } from 'react';
import TerminalView from './components/TerminalView';

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const sessionCounter = useRef(0);

  useEffect(() => {
    const createdHandler = window.claude.on.sessionCreated((info) => {
      setSessions((prev) => [...prev, info]);
      setSessionId(info.id);
    });

    const destroyedHandler = window.claude.on.sessionDestroyed((id) => {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setSessionId((curr) => (curr === id ? null : curr));
    });

    const hookHandler = window.claude.on.hookEvent((event) => {
      console.log('[Hook Event]', event.type, event);
    });

    return () => {
      window.claude.off('session:created', createdHandler);
      window.claude.off('session:destroyed', destroyedHandler);
      window.claude.off('hook:event', hookHandler);
    };
  }, []);

  const createSession = async () => {
    sessionCounter.current += 1;
    await window.claude.session.create({
      name: 'session-' + sessionCounter.current,
      cwd: 'C:\\Users\\desti',
      skipPermissions: false,
    });
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', background: '#030712', color: '#e5e7eb' }}>
      {/* Sidebar */}
      <div style={{ width: 56, background: '#111827', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 12, borderRight: '1px solid #1f2937', flexShrink: 0 }}>
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => setSessionId(s.id)}
            style={{
              width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 'bold', border: 'none', cursor: 'pointer',
              background: sessionId === s.id ? '#4f46e5' : '#1f2937',
              color: sessionId === s.id ? '#fff' : '#9ca3af',
            }}
            title={s.name}
          >
            {s.name.charAt(0).toUpperCase()}
          </button>
        ))}
        <button
          onClick={createSession}
          style={{
            width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, border: 'none', cursor: 'pointer', background: '#1f2937', color: '#9ca3af',
          }}
          title="New Session"
        >
          +
        </button>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {sessions.length > 0 && sessionId ? (
          <>
            <div style={{ height: 40, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 14, color: '#9ca3af', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
              {sessions.find((s) => s.id === sessionId)?.name || 'Session'}
            </div>
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              {sessions.map((s) => (
                <TerminalView
                  key={s.id}
                  sessionId={s.id}
                  visible={s.id === sessionId}
                />
              ))}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
            Click + to start a new Claude session
          </div>
        )}
      </div>
    </div>
  );
}
