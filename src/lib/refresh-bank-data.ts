interface RefreshBankDataOptions {
  readInitial?: () => Promise<unknown>;
  synchronize: () => Promise<unknown>;
  readUpdated: () => Promise<unknown>;
}

/** Read stored data while the bank synchronizes, then read its final state. */
export async function refreshBankData(options: RefreshBankDataOptions): Promise<void> {
  // Waiting for both prevents an older initial response from overwriting the
  // post-sync result. Initial read failures can be recovered by the final read.
  const [, synchronization] = await Promise.allSettled([
    options.readInitial?.(),
    options.synchronize(),
  ]);
  if (synchronization.status === 'rejected') throw synchronization.reason;
  await options.readUpdated();
}
