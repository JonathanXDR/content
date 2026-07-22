import manifestMeta from "#content/manifest";
const LOCALE_ENTRY_FIELDS = ["locale", "stem", "path", "title"];
export async function generateCollectionLocales(queryBuilder, collection, stem) {
  const collectionFields = manifestMeta[collection]?.fields ?? {};
  if (!("locale" in collectionFields)) {
    if (import.meta.dev) {
      console.warn(
        `[@nuxt/content] queryCollectionLocales: collection "${collection}" has no \`locale\` column. Add \`i18n: true\` (or an explicit \`i18n: { locales, defaultLocale }\`) to the collection definition.`
      );
    }
    return [];
  }
  const selectFields = LOCALE_ENTRY_FIELDS.filter((f) => f in collectionFields);
  const items = await queryBuilder.select(...selectFields).stem(stem).all();
  return items.map((item) => {
    const row = item;
    return {
      locale: row.locale,
      stem: row.stem,
      path: row.path,
      title: row.title
    };
  });
}
