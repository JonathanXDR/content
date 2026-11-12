import { unref } from "vue";
export function detectClientLocale(nuxtApp) {
  const locale = unref(nuxtApp?.$i18n?.locale);
  return typeof locale === "string" ? locale : void 0;
}
