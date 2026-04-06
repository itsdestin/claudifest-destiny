import React, { useState, useCallback } from 'react';

interface TerminalToolbarProps {
  sessionId: string;
}

/**
 * Android-only toolbar providing special keys (Ctrl, Esc, Tab, arrows)
 * for terminal mode. Sends escape sequences directly to the PTY via sendInput.
 */
export default function TerminalToolbar({ sessionId }: TerminalToolbarProps) {
  const [ctrlActive, setCtrlActive] = useState(false);

  const send = useCallback((input: string) => {
    window.claude.session.sendInput(sessionId, input);
  }, [sessionId]);

  const handleCtrl = useCallback(() => {
    setCtrlActive(prev => !prev);
  }, []);

  const handleKey = useCallback((key: string) => {
    if (ctrlActive) {
      // Convert to control code: 'c' -> \x03, 'd' -> \x04, etc.
      const code = key.toLowerCase().charCodeAt(0) - 96;
      if (code >= 1 && code <= 26) {
        send(String.fromCharCode(code));
      }
      setCtrlActive(false);
    } else {
      send(key);
    }
  }, [ctrlActive, send]);

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-panel border-t border-edge-dim shrink-0 overflow-x-auto">
      <ToolbarButton
        label="Ctrl"
        active={ctrlActive}
        onClick={handleCtrl}
      />
      <ToolbarButton label="Esc" onClick={() => send('\x1b')} />
      <ToolbarButton label="Tab" onClick={() => send('\t')} />
      <div className="w-px h-5 bg-edge-dim mx-1" />
      <ToolbarButton label="↑" onClick={() => send('\x1b[A')} />
      <ToolbarButton label="↓" onClick={() => send('\x1b[B')} />
      <ToolbarButton label="←" onClick={() => send('\x1b[D')} />
      <ToolbarButton label="→" onClick={() => send('\x1b[C')} />
      <div className="w-px h-5 bg-edge-dim mx-1" />
      <ToolbarButton label="c" small onClick={() => handleKey('c')} title={ctrlActive ? 'Ctrl+C' : 'c'} />
      <ToolbarButton label="d" small onClick={() => handleKey('d')} title={ctrlActive ? 'Ctrl+D' : 'd'} />
      <ToolbarButton label="z" small onClick={() => handleKey('z')} title={ctrlActive ? 'Ctrl+Z' : 'z'} />
      <ToolbarButton label="l" small onClick={() => handleKey('l')} title={ctrlActive ? 'Ctrl+L (clear)' : 'l'} />
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  active = false,
  small = false,
  title,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  small?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title || label}
      className={`
        ${small ? 'min-w-[28px] px-1.5' : 'min-w-[36px] px-2'} py-1 rounded text-xs font-medium
        transition-colors select-none
        ${active
          ? 'bg-accent text-on-accent'
          : 'bg-inset text-fg-muted hover:text-fg hover:bg-well'
        }
      `}
    >
      {label}
    </button>
  );
}
