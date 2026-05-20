// Global registry that keeps background jobs alive across Next.js route lifetimes
// Using globalThis prevents the registry from being garbage collected

declare global {
  var __jobRegistry: Map<string, Promise<void>>;
}

if (!globalThis.__jobRegistry) {
  globalThis.__jobRegistry = new Map();
}

export function registerJob(jobId: string, job: Promise<void>): void {
  globalThis.__jobRegistry.set(jobId, job);
  console.log('[job-registry] Registered job:', jobId, '— active jobs:', globalThis.__jobRegistry.size);

  // Clean up completed jobs
  job.finally(() => {
    globalThis.__jobRegistry.delete(jobId);
    console.log('[job-registry] Job completed/removed:', jobId, '— active jobs:', globalThis.__jobRegistry.size);
  });
}

export function getActiveJobs(): string[] {
  return Array.from(globalThis.__jobRegistry.keys());
}
