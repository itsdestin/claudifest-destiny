export type ClientMessage =
  | { type: 'authenticate'; username: string; password: string }
  | { type: 'create' }
  | { type: 'join'; code: string }
  | { type: 'move'; column: number }
  | { type: 'chat'; text: string }
  | { type: 'rematch' }
  | { type: 'leave' }
  | { type: 'challenge'; target: string }
  | { type: 'challenge:respond'; from: string; accept: boolean };

export type ServerMessage =
  | { type: 'authenticated'; success: boolean }
  | { type: 'presence'; online: { username: string; status: 'idle' | 'in-game' }[] }
  | { type: 'room:created'; code: string; color: 'red' | 'yellow' }
  | { type: 'game:start'; board: number[][]; you: 'red' | 'yellow'; opponent: string }
  | { type: 'game:state'; board: number[][]; turn: 'red' | 'yellow'; lastMove: { col: number; row: number } }
  | { type: 'game:over'; winner: 'red' | 'yellow' | 'draw'; line?: [number, number][] }
  | { type: 'chat:message'; from: string; text: string }
  | { type: 'error'; message: string }
  | { type: 'opponent:disconnected' }
  | { type: 'challenge:received'; from: string }
  | { type: 'challenge:declined'; by: string };

export interface ConnectedUser {
  username: string;
  status: 'idle' | 'in-game';
  roomCode: string | null;
}
