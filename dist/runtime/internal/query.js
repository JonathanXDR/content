import { withoutTrailingSlash } from "ufo";
import manifestMeta, { tables } from "#content/manifest";
export const getGroupConditions = (group) => {
  return group._conditions;
};
export const buildGroup = (group, type) => {
  const conditions = getGroupConditions(group);
  return conditions.length > 0 ? `(${conditions.join(` ${type} `)})` : "";
};
export const referencesLocaleColumn = (conditions) => conditions.some((c) => stripSingleQuoted(c).includes('"locale"'));
const stripSingleQuoted = (condition) => condition.replace(/'(?:[^']|'')*'/g, "");
export const collectionQueryGroup = (collection) => {
  const conditions = [];
  const query = {
    // @ts-expect-error -- internal
    _conditions: conditions,
    where(field, operator, value) {
      let condition;
      switch (operator.toUpperCase()) {
        case "IN":
        case "NOT IN":
          if (Array.isArray(value)) {
            const values = value.map((val) => singleQuote(val)).join(", ");
            condition = `"${String(field)}" ${operator.toUpperCase()} (${values})`;
          } else {
            throw new TypeError(`Value for ${operator} must be an array`);
          }
          break;
        case "BETWEEN":
        case "NOT BETWEEN":
          if (Array.isArray(value) && value.length === 2) {
            condition = `"${String(field)}" ${operator.toUpperCase()} ${singleQuote(value[0])} AND ${singleQuote(value[1])}`;
          } else {
            throw new Error(`Value for ${operator} must be an array with two elements`);
          }
          break;
        case "IS NULL":
        case "IS NOT NULL":
          condition = `"${String(field)}" ${operator.toUpperCase()}`;
          break;
        case "LIKE":
        case "NOT LIKE":
          condition = `"${String(field)}" ${operator.toUpperCase()} ${singleQuote(value)}`;
          break;
        default:
          condition = `"${String(field)}" ${operator} ${singleQuote(typeof value === "boolean" ? Number(value) : value)}`;
      }
      conditions.push(`${condition}`);
      return query;
    },
    andWhere(groupFactory) {
      const group = groupFactory(collectionQueryGroup(collection));
      conditions.push(buildGroup(group, "AND"));
      return query;
    },
    orWhere(groupFactory) {
      const group = groupFactory(collectionQueryGroup(collection));
      conditions.push(buildGroup(group, "OR"));
      return query;
    }
  };
  return query;
};
export const collectionQueryBuilder = (collection, fetch, detectedLocale) => {
  const collectionMeta = manifestMeta[String(collection)];
  const i18nConfig = collectionMeta?.i18n;
  const stemPrefix = collectionMeta?.stemPrefix || "";
  const params = {
    conditions: [],
    selectedFields: [],
    offset: 0,
    limit: 0,
    orderBy: [],
    count: {
      field: "",
      distinct: false
    },
    // Locale fallback runs as two queries merged in JS (see `fetchWithLocaleFallback`).
    localeFallback: void 0,
    // Tracks whether `.locale()` was called explicitly. Surfaced to the cache key.
    localeExplicitlySet: false
  };
  const query = {
    // @ts-expect-error -- internal
    __params: params,
    andWhere(groupFactory) {
      const group = groupFactory(collectionQueryGroup(collection));
      if (referencesLocaleColumn(getGroupConditions(group))) {
        params.localeExplicitlySet = true;
      }
      params.conditions.push(buildGroup(group, "AND"));
      return query;
    },
    orWhere(groupFactory) {
      const group = groupFactory(collectionQueryGroup(collection));
      if (referencesLocaleColumn(getGroupConditions(group))) {
        params.localeExplicitlySet = true;
      }
      params.conditions.push(buildGroup(group, "OR"));
      return query;
    },
    path(path) {
      return query.where("path", "=", withoutTrailingSlash(path));
    },
    stem(stem) {
      const normalized = stem.replace(/^\/+|\/+$/g, "");
      const fullStem = stemPrefix && !(normalized === stemPrefix || normalized.startsWith(stemPrefix + "/")) ? `${stemPrefix}/${normalized}` : normalized;
      return query.where("stem", "=", fullStem);
    },
    locale(locale, opts) {
      if (import.meta.dev && !i18nConfig) {
        console.warn(
          `[@nuxt/content] queryCollection("${String(collection)}").locale(${JSON.stringify(locale)}): collection "${String(collection)}" has no \`i18n\` configured. The query will fail at the database. Add \`i18n: true\` (or an explicit \`i18n: { locales, defaultLocale }\`) to the collection definition.`
        );
      }
      params.localeExplicitlySet = true;
      if (opts?.fallback) {
        params.localeFallback = { locale, fallback: opts.fallback };
      } else {
        query.where("locale", "=", locale);
      }
      return query;
    },
    skip(skip) {
      params.offset = skip;
      return query;
    },
    where(field, operator, value) {
      query.andWhere((group) => group.where(String(field), operator, value));
      return query;
    },
    limit(limit) {
      params.limit = limit;
      return query;
    },
    select(...fields) {
      if (fields.length) {
        params.selectedFields.push(...fields);
      }
      return query;
    },
    order(field, direction) {
      params.orderBy.push(`"${String(field)}" ${direction}`);
      return query;
    },
    async all() {
      const autoLocale = resolveAutoLocale();
      if (params.localeFallback || autoLocale.fallback) {
        return fetchWithLocaleFallback({ autoLocale });
      }
      return fetch(collection, buildQuery({ autoLocale })).then((res) => res || []);
    },
    async first() {
      const autoLocale = resolveAutoLocale();
      if (params.localeFallback || autoLocale.fallback) {
        return fetchWithLocaleFallback({ limit: 1, autoLocale }).then((res) => res[0] || null);
      }
      return fetch(collection, buildQuery({ limit: 1, autoLocale })).then((res) => res[0] || null);
    },
    async count(field = "*", distinct = false) {
      const autoLocale = resolveAutoLocale();
      if (params.localeFallback || autoLocale.fallback) {
        const countField = field !== "*" ? String(field) : void 0;
        const fieldsOverride = countField && params.selectedFields.length > 0 && !params.selectedFields.includes(field) ? [...params.selectedFields, field] : void 0;
        const res = await fetchWithLocaleFallback({
          preserveField: countField,
          autoLocale,
          fieldsOverride,
          bypassPagination: true
        });
        if (field === "*") return res.length;
        const values = res.map((r) => r[String(field)]).filter((v) => v !== null && v !== void 0);
        if (!distinct) return values.length;
        const keys = values.map((v) => typeof v === "object" ? JSON.stringify(v) : v);
        return new Set(keys).size;
      }
      return fetch(collection, buildQuery({
        count: { field: String(field), distinct },
        autoLocale,
        noLimitOffset: true
      })).then((m) => m[0].count);
    }
  };
  function resolveAutoLocale() {
    if (params.localeExplicitlySet || !i18nConfig || !detectedLocale) return {};
    if (!i18nConfig.locales.includes(detectedLocale)) {
      if (import.meta.dev) {
        console.warn(
          `[@nuxt/content] queryCollection("${String(collection)}"): detected locale "${detectedLocale}" is not in this collection's locales [${i18nConfig.locales.map((l) => `"${l}"`).join(", ")}]. Auto-locale filter skipped, so the query will return rows from every locale. If you use BCP-47 tags like "en-US", either declare them in the collection's \`i18n.locales\` or strip the region subtag before passing it to @nuxtjs/i18n.`
        );
      }
      return {};
    }
    if (detectedLocale === i18nConfig.defaultLocale) {
      return { condition: `("locale" = ${singleQuote(detectedLocale)})` };
    }
    return { fallback: { locale: detectedLocale, fallback: i18nConfig.defaultLocale } };
  }
  async function fetchWithLocaleFallback(opts = {}) {
    const fb = params.localeFallback || opts.autoLocale?.fallback;
    const { locale, fallback } = fb;
    const baseFields = opts.fieldsOverride ?? params.selectedFields;
    const stemInjected = baseFields.length > 0 && !baseFields.includes("stem");
    const fieldsForQuery = stemInjected ? [...baseFields, "stem"] : baseFields;
    const localeQuery = buildQuery({
      extraCondition: `("locale" = ${singleQuote(locale)})`,
      noLimitOffset: true,
      selectedFields: fieldsForQuery
    });
    const fallbackQuery = buildQuery({
      extraCondition: `("locale" = ${singleQuote(fallback)})`,
      noLimitOffset: true,
      selectedFields: fieldsForQuery
    });
    const [localeResults, fallbackResults] = await Promise.all([
      fetch(collection, localeQuery).then((res) => res || []),
      fetch(collection, fallbackQuery).then((res) => res || [])
    ]);
    const getStem = (r) => r.stem;
    const localeStemSet = new Set(localeResults.map(getStem));
    const fallbackOnly = fallbackResults.filter((item) => !localeStemSet.has(getStem(item)));
    const isDefaultStemOrder = params.orderBy.length === 0 || params.orderBy.length === 1 && params.orderBy[0] === '"stem" ASC';
    const combined = [...localeResults, ...fallbackOnly];
    const merged = isDefaultStemOrder ? combined.sort((a, b) => {
      const sa = getStem(a);
      const sb = getStem(b);
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    }) : combined;
    let result = merged;
    if (!opts.bypassPagination) {
      if (params.offset > 0) {
        result = result.slice(params.offset);
      }
      const limit = opts.limit ?? (params.limit > 0 ? params.limit : 0);
      if (limit > 0) {
        result = result.slice(0, limit);
      }
    }
    if (stemInjected && opts.preserveField !== "stem") {
      return result.map((item) => {
        const { stem: _, ...rest } = item;
        return rest;
      });
    }
    return result;
  }
  function buildQuery(opts = {}) {
    let query2 = "SELECT ";
    if (opts?.count) {
      const countField = opts.count.field === "*" ? "*" : `"${opts.count.field.replace(/"/g, "")}"`;
      query2 += `COUNT(${opts.count.distinct ? "DISTINCT " : ""}${countField}) as count`;
    } else {
      const fields = Array.from(new Set(opts.selectedFields ?? params.selectedFields));
      query2 += fields.length > 0 ? fields.map((f) => `"${String(f)}"`).join(", ") : "*";
    }
    query2 += ` FROM ${tables[String(collection)]}`;
    const conditions = [...params.conditions];
    if (opts.autoLocale?.condition && !opts.extraCondition) {
      conditions.push(opts.autoLocale.condition);
    }
    if (opts.extraCondition) {
      conditions.push(opts.extraCondition);
    }
    if (conditions.length > 0) {
      query2 += ` WHERE ${conditions.join(" AND ")}`;
    }
    if (!opts?.count) {
      if (params.orderBy.length > 0) {
        query2 += ` ORDER BY ${params.orderBy.join(", ")}`;
      } else {
        query2 += ` ORDER BY stem ASC`;
      }
    }
    const limit = opts?.limit || params.limit;
    if (!opts?.noLimitOffset && limit > 0) {
      if (params.offset > 0) {
        query2 += ` LIMIT ${limit} OFFSET ${params.offset}`;
      } else {
        query2 += ` LIMIT ${limit}`;
      }
    }
    return query2;
  }
  return query;
};
function singleQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
