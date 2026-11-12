import type { ContentEvent } from './internal/event.js';
import { type GenerateSearchSectionsOptions, type Section } from './internal/search.js';
import type { Collections, CollectionQueryBuilder, ContentLocaleEntry, PageCollections, SurroundOptions, SQLOperator, QueryGroupFunction } from '@nuxt/content';
export type { GenerateSearchSectionsOptions, Section } from './internal/search.js';
export type { ContentEvent, RequestEvent } from './internal/event.js';
interface ChainablePromise<T extends keyof PageCollections, R> extends Promise<R> {
    where(field: keyof PageCollections[T] | string, operator: SQLOperator, value?: unknown): ChainablePromise<T, R>;
    andWhere(groupFactory: QueryGroupFunction<PageCollections[T]>): ChainablePromise<T, R>;
    orWhere(groupFactory: QueryGroupFunction<PageCollections[T]>): ChainablePromise<T, R>;
    order(field: keyof PageCollections[T], direction: 'ASC' | 'DESC'): ChainablePromise<T, R>;
    locale(locale: string, opts?: {
        fallback?: string;
    }): ChainablePromise<T, R>;
}
export declare const queryCollection: <T extends keyof Collections>(event: ContentEvent, collection: T) => CollectionQueryBuilder<Collections[T]>;
export declare function queryCollectionNavigation<T extends keyof PageCollections>(event: ContentEvent, collection: T, fields?: Array<keyof PageCollections[T]>): ChainablePromise<T, ContentNavigationItem[]>;
export declare function queryCollectionItemSurroundings<T extends keyof PageCollections>(event: ContentEvent, collection: T, path: string, opts?: SurroundOptions<keyof PageCollections[T]>): ChainablePromise<T, ContentNavigationItem[]>;
export declare function queryCollectionSearchSections<T extends keyof PageCollections, const K extends keyof PageCollections[T]>(event: ContentEvent, collection: T, opts: Omit<GenerateSearchSectionsOptions, 'extraFields'> & {
    extraFields: K[];
}): ChainablePromise<T, Array<Section & Pick<PageCollections[T], K>>>;
export declare function queryCollectionSearchSections<T extends keyof PageCollections>(event: ContentEvent, collection: T, opts?: GenerateSearchSectionsOptions): ChainablePromise<T, Section[]>;
export declare function queryCollectionLocales<T extends keyof PageCollections>(event: ContentEvent, collection: T, stem: string): Promise<Array<Required<ContentLocaleEntry>>>;
export declare function queryCollectionLocales<T extends keyof Collections>(event: ContentEvent, collection: T, stem: string): Promise<ContentLocaleEntry[]>;
