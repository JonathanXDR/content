/**
 * Returns a new object with the specified keys
 */
export declare function pick(keys?: string[]): (obj: Record<string, unknown>) => {};
/**
 * Returns a function that yields to the main thread once `budget` ms have
 * passed since the last yield, so a long loop in the browser stays
 * responsive to input. A no-op on the server.
 */
export declare function createYielder(budget?: number): () => Promise<void>;
