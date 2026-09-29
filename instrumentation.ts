export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startMutationScheduler } = await import('./lib/scheduler');
    startMutationScheduler();
  }
}
