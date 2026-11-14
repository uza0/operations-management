/**
 * Runs once when a server instance starts, before it serves anything: the
 * schema upgrade lives here so no release can reach a database older than
 * itself. See src/db/upgrade.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { ensureSchema } = await import('./db/upgrade');
  await ensureSchema();
}
