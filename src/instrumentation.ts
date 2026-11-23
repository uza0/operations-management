/**
 * Runs once when a server instance starts, before it serves anything: the
 * schema upgrade lives here so no release can reach a database older than
 * itself. See src/db/upgrade.ts.
 */
export async function register() {
  /*
   * Written as a block, not an early return: the build replaces NEXT_RUNTIME
   * and drops the block from the edge copy of this file (made since the
   * middleware exists), which cannot load the database's Node modules.
   */
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureSchema } = await import('./db/upgrade');
    await ensureSchema();
  }
}
