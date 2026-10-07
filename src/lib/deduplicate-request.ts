/** Share simultaneous reads only; the next completed read is always fresh. */
export function deduplicateRequest<T>(request: () => Promise<T>): (fresh?: boolean) => Promise<T> {
  let pending: Promise<T> | null = null;
  return (fresh = false) => {
    if (pending && !fresh) return pending;
    const current = Promise.resolve().then(request).then(
      (result) => {
        if (pending === current) pending = null;
        return result;
      },
      (error: unknown) => {
        if (pending === current) pending = null;
        throw error;
      },
    );
    pending = current;
    return current;
  };
}
