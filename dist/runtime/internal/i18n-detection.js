export function detectServerLocale(event) {
  const ctx = event?.context?.nuxtI18n;
  return ctx?.detectLocale || ctx?.vueI18nOptions?.locale;
}
export function detectClientLocale(nuxtApp) {
  const i18n = nuxtApp?.$i18n;
  return i18n?.locale?.value;
}
export function buildUseQueryCollectionKey(parts) {
  const fragments = [parts.collection];
  if (parts.conditions.length) fragments.push(...parts.conditions);
  if (parts.localeFallback) {
    fragments.push(`l:${parts.localeFallback.locale}:fb:${parts.localeFallback.fallback}`);
  } else if (parts.currentLocale && !parts.explicitLocale) {
    fragments.push(`l:${parts.currentLocale}`);
  }
  if (parts.orderBy.length) fragments.push(`o:${parts.orderBy.join(",")}`);
  if (parts.offset) fragments.push(`s:${parts.offset}`);
  if (parts.limit) fragments.push(`n:${parts.limit}`);
  if (parts.selectedFields.length) fragments.push(`f:${parts.selectedFields.join(",")}`);
  fragments.push(parts.method);
  return `content:${JSON.stringify(fragments)}`;
}
