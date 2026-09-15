/** Houdt automatische en handmatige opslag in de volgorde van de gebruikersacties. */
export function createOrderedSaveQueue(): { enqueue: (write: () => Promise<void>) => Promise<void> } {
    let pending = Promise.resolve();
    return {
        enqueue(write) {
            const result = pending.catch(() => undefined).then(write);
            pending = result;
            return result;
        },
    };
}
