import type { CollectionQueryBuilder, ContentLocaleEntry } from '@nuxt/content';
/**
 * Query all locale variants for a given content stem within an i18n-enabled
 * collection. Returns one entry per locale, useful for building language switchers
 * and hreflang tags.
 *
 * Selects only the columns that map to `ContentLocaleEntry` and that the
 * collection actually has. `path` and `title` only exist on `page` collections,
 * so they are filtered out for `data` collections. This keeps the payload small
 * for data collections with large fields.
 *
 * Returns an empty array (with a dev-only warning) when called on a collection
 * that has no `locale` column, that is, one without `i18n` configured. Without
 * this guard the query would still run, but every entry's `locale` would be
 * `undefined` cast to `string`, a type lie that surfaces deep in consumer code
 * instead of at the call site.
 */
export declare function generateCollectionLocales<T = Record<string, unknown>>(queryBuilder: CollectionQueryBuilder<T>, collection: string, stem: string): Promise<ContentLocaleEntry[]>;
