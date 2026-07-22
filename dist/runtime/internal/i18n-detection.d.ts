import type { H3Event } from 'h3';
/**
 * Resolve the active locale on the server from `@nuxtjs/i18n`'s event context.
 *
 * Priority is `detectLocale` (set only during server-side localized redirects),
 * then `vueI18nOptions.locale` (the configured default). Returns `undefined`
 * when `@nuxtjs/i18n` is not installed or its context has not been initialised.
 *
 * Because `detectLocale` is unset for the common case of a normal non-redirected
 * request, this often returns the configured default locale rather than the
 * user's per-request locale. In event handlers where the active locale matters,
 * call `.locale()` explicitly.
 */
export declare function detectServerLocale(event: H3Event | undefined): string | undefined;
/**
 * Resolve the active locale on the client from `nuxtApp.$i18n.locale` (a Vue ref).
 * Returns `undefined` when `@nuxtjs/i18n` is not installed.
 *
 * The parameter is typed as `unknown` because Nuxt's `NuxtApp` does not declare
 * `$i18n` natively (it is a runtime plugin injection). A narrower type would have
 * no overlap with `NuxtApp` and force callers into an awkward cast.
 */
export declare function detectClientLocale(nuxtApp: unknown): string | undefined;
/**
 * Pure builder for `useQueryCollection`'s cache key. Extracted so it can be
 * unit-tested without spinning up a Nuxt app instance. The output shape must
 * stay stable, since Nuxt reuses `useAsyncData` entries by key and any change
 * here invalidates user caches on upgrade.
 *
 * `localeFallback` wins over `currentLocale`. When the consumer set
 * `.locale(x, { fallback })` explicitly, the auto-detected locale is
 * irrelevant. `currentLocale` is only added when no explicit `.locale()` (or
 * `.where('locale', ...)`) was used.
 */
export interface UseQueryCollectionKeyParts {
    collection: string;
    conditions: string[];
    orderBy: string[];
    offset: number;
    limit: number;
    selectedFields: string[];
    localeFallback?: {
        locale: string;
        fallback: string;
    };
    currentLocale?: string;
    explicitLocale: boolean;
    method: string;
}
export declare function buildUseQueryCollectionKey(parts: UseQueryCollectionKeyParts): string;
