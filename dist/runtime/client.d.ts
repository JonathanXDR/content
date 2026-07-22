import type { GenerateSearchSectionsOptions, SearchCollectionOptions, SearchResult, Section } from './internal/search.js';
import type { Collections, ContentLocaleEntry, ContentNavigationItem, CollectionQueryBuilder, PageCollections, QueryGroupFunction, SQLOperator, SurroundOptions } from '@nuxt/content';
import type { AsyncData, AsyncDataOptions, NuxtError } from '#app';
import type { MaybeRefOrGetter, Ref } from 'vue';
export type { GenerateSearchSectionsOptions, SearchCollectionOptions, SearchResult, Section } from './internal/search.js';
interface ChainablePromise<T extends keyof PageCollections, R> extends Promise<R> {
    where(field: keyof PageCollections[T] | string, operator: SQLOperator, value?: unknown): ChainablePromise<T, R>;
    andWhere(groupFactory: QueryGroupFunction<PageCollections[T]>): ChainablePromise<T, R>;
    orWhere(groupFactory: QueryGroupFunction<PageCollections[T]>): ChainablePromise<T, R>;
    order(field: keyof PageCollections[T], direction: 'ASC' | 'DESC'): ChainablePromise<T, R>;
}
export declare const queryCollection: <T extends keyof Collections>(collection: T) => CollectionQueryBuilder<Collections[T]>;
export declare function queryCollectionNavigation<T extends keyof PageCollections>(collection: T, fields?: Array<keyof PageCollections[T]>): ChainablePromise<T, ContentNavigationItem[]>;
export declare function queryCollectionItemSurroundings<T extends keyof PageCollections>(collection: T, path: string, opts?: SurroundOptions<keyof PageCollections[T]>): ChainablePromise<T, ContentNavigationItem[]>;
export declare function queryCollectionSearchSections<T extends keyof PageCollections, const K extends keyof PageCollections[T]>(collection: T, opts: Omit<GenerateSearchSectionsOptions, 'extraFields'> & {
    extraFields: K[];
}): ChainablePromise<T, Array<Section & Pick<PageCollections[T], K>>>;
export declare function queryCollectionSearchSections<T extends keyof PageCollections>(collection: T, opts?: GenerateSearchSectionsOptions): ChainablePromise<T, Section[]>;
export declare function queryCollectionLocales<T extends keyof Collections>(collection: T, stem: string): Promise<ContentLocaleEntry[]>;
/**
 * `useAsyncData` wrapper for `queryCollection`. Provides a chainable API that
 * wraps execution in `useAsyncData` with an auto-generated cache key. The locale
 * is auto-detected from `@nuxtjs/i18n` and content automatically refetches when
 * the locale changes.
 *
 * Must be called in a Vue component setup context, like `useAsyncData` and
 * `useFetch`.
 *
 * Each terminal method (`all`, `first`, `count`) accepts an optional
 * `AsyncDataOptions` argument that is forwarded to `useAsyncData`. Use it for
 * `lazy`, `server`, `default`, `immediate`, `watch`, `transform`, `pick`, and
 * other forwarded options.
 *
 * @example
 * const { data } = await useQueryCollection('technologies').all()
 * const { data } = await useQueryCollection('navigation').stem('navbar').first()
 * const { data } = await useQueryCollection('docs').all({ lazy: true, default: () => [] })
 */
export declare function useQueryCollection<R = never, T extends keyof Collections = keyof Collections>(collection: T): {
    where(field: string, operator: SQLOperator, value?: unknown): /*elided*/ any;
    andWhere(groupFactory: QueryGroupFunction<Collections>): /*elided*/ any;
    orWhere(groupFactory: QueryGroupFunction<Collections>): /*elided*/ any;
    order(field: string | number | symbol, direction: "ASC" | "DESC"): /*elided*/ any;
    select<K extends string | number | symbol>(...fields: K[]): /*elided*/ any;
    skip(skip: number): /*elided*/ any;
    limit(limit: number): /*elided*/ any;
    path(path: string): /*elided*/ any;
    stem(stem: string): /*elided*/ any;
    locale(locale: string, opts?: {
        fallback?: string;
    }): /*elided*/ any;
    all(options?: AsyncDataOptions<([R] extends [never] ? Collections : R)[]>): AsyncData<([R] extends [never] ? Collections : R)[] | undefined, NuxtError | undefined>;
    first(options?: AsyncDataOptions<([R] extends [never] ? Collections : R) | null>): AsyncData<([R] extends [never] ? Collections : R) | null | undefined, NuxtError | undefined>;
    count(field?: (string | number | symbol) | "*", distinct?: boolean, options?: AsyncDataOptions<number>): AsyncData<number | undefined, NuxtError | undefined>;
};
export declare function useSearchCollection<T extends keyof PageCollections>(collection: MaybeRefOrGetter<T | T[]>, opts?: GenerateSearchSectionsOptions & {
    immediate?: boolean;
}): {
    status: Ref<"error" | "ready" | "idle" | "loading", "error" | "ready" | "idle" | "loading">;
    search: (query: string, searchOpts?: SearchCollectionOptions) => Promise<SearchResult[]>;
    init: () => Promise<any>;
};
