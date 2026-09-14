/** Shared shape for every server action that a form reports errors from. */
export type ActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string; field?: string }
  | {
      /** A soft block the user may override — e.g. an overlapping shift. */
      status: 'conflict';
      message: string;
      payload?: Record<string, string>;
    }
  | { status: 'success'; message?: string };

export const idle: ActionState = { status: 'idle' };

export function fail(message: string, field?: string): ActionState {
  return { status: 'error', message, field };
}

export function ok(message?: string): ActionState {
  return { status: 'success', message };
}
