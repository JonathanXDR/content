/**
 * `@nuxtjs/i18n` resolves `$i18n.locale` per request during SSR and keeps it reactive on
 * the client. It is a ref, or a string with vue-i18n in legacy mode.
 */
export declare function detectClientLocale(nuxtApp: unknown): string | undefined;
