import type { Collections, CollectionQueryBuilder, CollectionQueryGroup } from '@nuxt/content';
/**
 * Read the raw conditions accumulated on a group built by `collectionQueryGroup`.
 * Exposed so other modules can serialize a group (for example to build a cache key)
 * without reaching into the internal `_conditions` field via a cast.
 */
export declare const getGroupConditions: <T extends keyof Collections>(group: CollectionQueryGroup<Collections[T]>) => string[];
export declare const buildGroup: <T extends keyof Collections>(group: CollectionQueryGroup<Collections[T]>, type: "AND" | "OR") => string;
/**
 * Match any condition that filters on the `locale` column, regardless of operator,
 * value, or nesting depth. Used to detect manual locale filters so auto-locale
 * steps aside.
 *
 * The quoted column token `"locale"` is detected anywhere in a condition (so a
 * filter nested inside an `andWhere`/`orWhere` group still counts), after string
 * literals are stripped so a value that happens to contain the text `"locale"`
 * does not produce a false match. Column references are always double-quoted while
 * values are single-quoted, so the two never collide.
 */
export declare const referencesLocaleColumn: (conditions: string[]) => boolean;
export declare const collectionQueryGroup: <T extends keyof Collections>(collection: T) => CollectionQueryGroup<Collections[T]>;
export declare const collectionQueryBuilder: <T extends keyof Collections>(collection: T, fetch: (collection: T, sql: string) => Promise<Collections[T][]>, detectedLocale?: string) => CollectionQueryBuilder<Collections[T]>;
