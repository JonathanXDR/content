import type { CollectionQueryBuilder, ContentLocaleEntry } from '@nuxt/content';
export declare function generateCollectionLocales<T = Record<string, unknown>>(queryBuilder: CollectionQueryBuilder<T>, collection: string, stem: string): Promise<ContentLocaleEntry[]>;
