import type { LLMsSection } from 'nuxt-llms';
import type { PageCollectionItemBase, SQLOperator } from '@nuxt/content';
export interface ContentLLMSCollectionSection extends LLMsSection {
    __nuxt_content_auto_generate?: boolean;
    contentCollection?: string;
    contentFilters?: Array<{
        field: string;
        operator: SQLOperator;
        value?: string;
    }>;
}
export declare function getDefaultLocale(collection: string): string | undefined;
/**
 * Translations share the path of the default locale, so their links start with the locale.
 * The raw Markdown route reads a leading locale code as a translation, so `raw` links also
 * prefix default-locale paths that start with a locale code.
 */
export declare function localizePath(path: string, collection: string, locale?: string, raw?: boolean): string;
export declare function createDocumentGenerator(): Promise<(doc: PageCollectionItemBase, options: {
    domain: string;
}) => Promise<string | null>>;
export declare function prepareContentSections(sections: LLMsSection[]): void;
