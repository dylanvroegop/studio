/** Alleen gewijzigde velden opsturen; een oude editor mag nieuwe materialen niet terugzetten. */
export function quoteDataRoot(value: unknown): Record<string, unknown> {
    const root = Array.isArray(value) ? value[0] : value;
    return root && typeof root === 'object' ? root as Record<string, unknown> : {};
}

export function createQuoteDataPatch(previous: unknown, next: unknown): Record<string, unknown> {
    const before = quoteDataRoot(previous);
    return Object.fromEntries(Object.entries(quoteDataRoot(next)).filter(
        ([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key]),
    ));
}
