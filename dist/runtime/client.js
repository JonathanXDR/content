import { buildGroup, collectionQueryBuilder, collectionQueryGroup, getGroupConditions, referencesLocaleColumn } from "./internal/query.js";
import { generateNavigationTree } from "./internal/navigation.js";
import { generateItemSurround } from "./internal/surround.js";
import { buildFTSIndex, generateSearchSections, queryFTS, resetFTSIndex } from "./internal/search.js";
import { generateCollectionLocales } from "./internal/locales.js";
import { buildUseQueryCollectionKey, detectClientLocale, detectServerLocale } from "./internal/i18n-detection.js";
import { fetchQuery } from "./internal/api.js";
import { withoutTrailingSlash } from "ufo";
import manifestMeta from "#content/manifest";
import { computed, ref, toValue, tryUseNuxtApp, useAsyncData, watch } from "#imports";
export const queryCollection = (collection) => {
  const nuxtApp = tryUseNuxtApp();
  const event = nuxtApp?.ssrContext?.event;
  const detectedLocale = detectClientLocale(nuxtApp) || detectServerLocale(event);
  return collectionQueryBuilder(collection, (collection2, sql) => executeContentQuery(event, collection2, sql), detectedLocale);
};
export function queryCollectionNavigation(collection, fields) {
  return chainablePromise(collection, (qb) => generateNavigationTree(qb, fields));
}
export function queryCollectionItemSurroundings(collection, path, opts) {
  return chainablePromise(collection, (qb) => generateItemSurround(qb, path, opts));
}
export function queryCollectionSearchSections(collection, opts) {
  return chainablePromise(collection, (qb) => generateSearchSections(qb, opts));
}
export function queryCollectionLocales(collection, stem) {
  const event = tryUseNuxtApp()?.ssrContext?.event;
  const qb = collectionQueryBuilder(collection, (collection2, sql) => executeContentQuery(event, collection2, sql));
  return generateCollectionLocales(qb, String(collection), stem);
}
export function useQueryCollection(collection) {
  const nuxtApp = tryUseNuxtApp();
  if (!nuxtApp) {
    throw new Error(
      "[@nuxt/content] `useQueryCollection` must be called inside a Vue component setup (or other Nuxt-aware) context, like `useAsyncData` and `useFetch`. It cannot run in event handlers, watchers, lifecycle hooks, or outside the Nuxt app."
    );
  }
  const collectionI18n = manifestMeta[String(collection)]?.i18n;
  const i18nLocaleRef = nuxtApp?.$i18n?.locale;
  const ssrLocale = detectServerLocale(nuxtApp?.ssrContext?.event);
  const localeValue = computed(() => i18nLocaleRef?.value || ssrLocale || "");
  const ops = [];
  let explicitLocale = false;
  const keyParts = {
    conditions: [],
    orderBy: [],
    offset: 0,
    limit: 0,
    selectedFields: [],
    localeFallback: void 0
  };
  const builder = {
    where(field, operator, value) {
      if (field === "locale") explicitLocale = true;
      keyParts.conditions.push(`${field}|${operator}|${String(value)}`);
      ops.push((qb) => qb.where(field, operator, value));
      return builder;
    },
    andWhere(groupFactory) {
      const group = groupFactory(collectionQueryGroup(collection));
      const groupConditions = getGroupConditions(group);
      if (referencesLocaleColumn(groupConditions)) explicitLocale = true;
      keyParts.conditions.push(`and${buildGroup(group, "AND")}`);
      ops.push((qb) => qb.andWhere(groupFactory));
      return builder;
    },
    orWhere(groupFactory) {
      const group = groupFactory(collectionQueryGroup(collection));
      const groupConditions = getGroupConditions(group);
      if (referencesLocaleColumn(groupConditions)) explicitLocale = true;
      keyParts.conditions.push(`or${buildGroup(group, "OR")}`);
      ops.push((qb) => qb.orWhere(groupFactory));
      return builder;
    },
    order(field, direction) {
      keyParts.orderBy.push(`${String(field)}:${direction}`);
      ops.push((qb) => qb.order(field, direction));
      return builder;
    },
    select(...fields) {
      keyParts.selectedFields.push(...fields.map(String));
      ops.push((qb) => qb.select(...fields));
      return builder;
    },
    skip(skip) {
      keyParts.offset = skip;
      ops.push((qb) => qb.skip(skip));
      return builder;
    },
    limit(limit) {
      keyParts.limit = limit;
      ops.push((qb) => qb.limit(limit));
      return builder;
    },
    path(path) {
      keyParts.conditions.push(`path=${withoutTrailingSlash(path)}`);
      ops.push((qb) => qb.path(path));
      return builder;
    },
    stem(stem) {
      keyParts.conditions.push(`stem=${stem}`);
      ops.push((qb) => qb.stem(stem));
      return builder;
    },
    locale(locale, opts) {
      explicitLocale = true;
      if (opts?.fallback) {
        keyParts.localeFallback = { locale, fallback: opts.fallback };
      } else {
        keyParts.conditions.push(`locale=${locale}`);
      }
      ops.push((qb) => qb.locale(locale, opts));
      return builder;
    },
    all(options) {
      return useAsyncData(() => buildKey("all"), () => buildQuery().all(), options);
    },
    first(options) {
      return useAsyncData(() => buildKey("first"), () => buildQuery().first(), options);
    },
    count(field, distinct, options) {
      const countKey = `count:${String(field ?? "*")}:${distinct ? "d" : ""}`;
      return useAsyncData(() => buildKey(countKey), () => buildQuery().count(field, distinct), options);
    }
  };
  function buildQuery() {
    const qb = queryCollection(collection);
    for (const op of ops) op(qb);
    return qb;
  }
  function buildKey(method) {
    const locale = localeValue.value;
    const localeIsActive = !!collectionI18n && collectionI18n.locales.includes(locale);
    return buildUseQueryCollectionKey({
      collection: String(collection),
      conditions: keyParts.conditions,
      orderBy: keyParts.orderBy,
      offset: keyParts.offset,
      limit: keyParts.limit,
      selectedFields: keyParts.selectedFields,
      localeFallback: keyParts.localeFallback,
      currentLocale: localeIsActive ? locale : void 0,
      explicitLocale,
      method
    });
  }
  return builder;
}
export function useSearchCollection(collection, opts) {
  const { immediate = true, ...indexOpts } = opts || {};
  const status = ref(immediate ? "loading" : "idle");
  let db;
  let initPromise;
  let indexedFor = [];
  function resolveCollections() {
    const val = toValue(collection);
    return (Array.isArray(val) ? val : [val]).map(String);
  }
  async function init() {
    const collections = resolveCollections();
    if (!collections.length) return initPromise ?? (db ? Promise.resolve(db) : Promise.reject(new Error("No collections to search")));
    const hasRemovedCollections = indexedFor.some((c) => !collections.includes(c));
    const newCollections = collections.filter((c) => !indexedFor.includes(c));
    if (!newCollections.length && !hasRemovedCollections && initPromise) return initPromise;
    status.value = "loading";
    initPromise = import("./internal/database.client.js").then((m) => m.loadDatabaseAdapter(collections[0])).then(async (_db) => {
      db = _db;
      if (hasRemovedCollections) {
        await resetFTSIndex(_db);
      }
      const toIndex = hasRemovedCollections ? collections : newCollections;
      await Promise.all(toIndex.map((col) => {
        const qb = queryCollection(col);
        return buildFTSIndex(_db, col, qb, indexOpts);
      }));
      indexedFor = [...collections];
      status.value = "ready";
      return _db;
    }).catch((err) => {
      status.value = "error";
      throw err;
    });
    return initPromise;
  }
  if (import.meta.client) {
    watch(() => toValue(collection), () => init(), { immediate });
  }
  async function search(query, searchOpts) {
    if (!db) {
      await init();
    }
    return queryFTS(db, indexedFor, query, searchOpts);
  }
  return { status, search, init };
}
async function executeContentQuery(event, collection, sql) {
  if (import.meta.client && window.WebAssembly) {
    return queryContentSqlClientWasm(collection, sql);
  } else {
    return fetchQuery(event, String(collection), sql);
  }
}
async function queryContentSqlClientWasm(collection, sql) {
  const rows = await import("./internal/database.client.js").then((m) => m.loadDatabaseAdapter(collection)).then((db) => db.all(sql));
  return rows;
}
function chainablePromise(collection, fn) {
  const queryBuilder = queryCollection(collection);
  const chainable = {
    where(field, operator, value) {
      queryBuilder.where(String(field), operator, value);
      return chainable;
    },
    andWhere(groupFactory) {
      queryBuilder.andWhere(groupFactory);
      return chainable;
    },
    orWhere(groupFactory) {
      queryBuilder.orWhere(groupFactory);
      return chainable;
    },
    order(field, direction) {
      queryBuilder.order(String(field), direction);
      return chainable;
    },
    then(onfulfilled, onrejected) {
      return fn(queryBuilder).then(onfulfilled, onrejected);
    },
    catch(onrejected) {
      return this.then(void 0, onrejected);
    },
    finally(onfinally) {
      return this.then(void 0, void 0).finally(onfinally);
    },
    get [Symbol.toStringTag]() {
      return "Promise";
    }
  };
  return chainable;
}
