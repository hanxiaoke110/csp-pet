/** FIFO Web Locks substitute for storage/concurrency tests. Share across simulated windows. */
export function createTestLockManager() {
  let tail: Promise<unknown> = Promise.resolve();
  return { request: (_name: string, _options: unknown, action: () => unknown) => {
    const result = tail.then(action);
    tail = result.catch(() => {});
    return result;
  } };
}
