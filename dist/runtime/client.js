import { collectionQueryBuilder } from "./internal/query.js";
import { generateNavigationTree } from "./internal/navigation.js";
import { generateItemSurround } from "./internal/surround.js";
import { generateSearchSections, buildFTSIndex, getFTSGeneration, queryFTS, resetFTSIndex } from "./internal/search.js";
import { generateCollectionLocales } from "./internal/locales.js";
import { detectClientLocale } from "./internal/i18n-detection.js";
import { fetchQuery } from "./internal/api.js";
import manifestMeta from "#content/manifest";
import { ref, toValue, watch, tryUseNuxtApp } from "#imports";
export const queryCollection = (collection) => {
  const nuxtApp = tryUseNuxtApp();
  const event = nuxtApp?.ssrContext?.event;
  return collectionQueryBuilder(collection, (collection2, sql) => executeContentQuery(event, collection2, sql), detectClientLocale(nuxtApp));
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
  return generateCollectionLocales(queryCollection(collection), String(collection), stem);
}
export function useSearchCollection(collection, opts) {
  const { immediate = true, ...indexOpts } = opts || {};
  const nuxtApp = tryUseNuxtApp();
  const status = ref(immediate ? "loading" : "idle");
  let db;
  let initPromise;
  let indexedFor = [];
  let indexedLocale;
  let initRun = 0;
  function resolveCollections() {
    const val = toValue(collection);
    return (Array.isArray(val) ? val : [val]).map(String);
  }
  const localeOf = (name) => manifestMeta[name]?.i18n ? detectClientLocale(nuxtApp) : void 0;
  const activeLocale = () => resolveCollections().map(localeOf).find(Boolean);
  async function init() {
    const collections = resolveCollections();
    if (!collections.length) return initPromise ?? (db ? Promise.resolve(db) : Promise.reject(new Error("No collections to search")));
    const hasRemovedCollections = indexedFor.some((c) => !collections.includes(c));
    const newCollections = collections.filter((c) => !indexedFor.includes(c));
    const locale = activeLocale();
    if (!newCollections.length && !hasRemovedCollections && locale === indexedLocale && initPromise) return initPromise;
    indexedLocale = locale;
    status.value = "loading";
    const run = ++initRun;
    initPromise = import("./internal/database.client.js").then((m) => m.loadDatabaseAdapter(collections[0])).then(async (_db) => {
      db = _db;
      if (hasRemovedCollections) {
        await resetFTSIndex(_db);
      }
      let generation;
      do {
        generation = getFTSGeneration();
        await Promise.all(collections.map((col) => buildFTSIndex(_db, col, queryCollection(col), indexOpts, localeOf(col))));
      } while (generation !== getFTSGeneration() && run === initRun);
      if (run === initRun) {
        indexedFor = [...collections];
        status.value = "ready";
      }
      return _db;
    }).catch((err) => {
      if (run === initRun) {
        status.value = "error";
      }
      throw err;
    });
    return initPromise;
  }
  if (import.meta.client) {
    watch(() => toValue(collection), () => init(), { immediate });
    watch(activeLocale, () => initPromise && init());
  }
  async function search(query, searchOpts) {
    if (!db || activeLocale() !== indexedLocale) {
      await init();
    } else if (status.value === "loading") {
      await initPromise;
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
    locale(locale, opts) {
      queryBuilder.locale(locale, opts);
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
