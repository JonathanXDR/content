import { withoutTrailingSlash } from "ufo";
import manifestMeta, { tables } from "#content/manifest";
const getGroupConditions = (group) => {
  return group._conditions;
};
const buildGroup = (group, type) => {
  const conditions = getGroupConditions(group);
  return conditions.length > 0 ? `(${conditions.join(` ${type} `)})` : "";
};
const referencesLocaleColumn = (conditions) => conditions.some((c) => c.replace(/'(?:[^']|'')*'/g, "").includes('"locale"'));
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
const LOCALE_KEY_FIELDS = ["id", "stem", "locale"];
const KEY_WINDOW_SIZE = 256;
const unknownLocaleWarnings = /* @__PURE__ */ new Set();
const IN_LIST_MAX_BYTES = 4e4;
const utf8 = new TextEncoder();
export const collectionQueryBuilder = (collection, fetch, detectedLocale) => {
  const collectionMeta = manifestMeta[String(collection)];
  const i18nConfig = collectionMeta?.i18n;
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
    locale: void 0,
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
      let start = 0;
      let end = stem.length;
      while (start < end && stem.charCodeAt(start) === 47) start++;
      while (end > start && stem.charCodeAt(end - 1) === 47) end--;
      return query.where("stem", "=", stem.slice(start, end));
    },
    locale(locale, opts) {
      if (import.meta.dev && !i18nConfig) {
        console.warn(
          `[@nuxt/content] queryCollection("${String(collection)}").locale(${JSON.stringify(locale)}): collection "${String(collection)}" has no i18n locales, so the query will fail at the database. Set \`i18n: { locales, defaultLocale }\` on the collection, or \`i18n: true\` with \`@nuxtjs/i18n\` configured.`
        );
      }
      params.localeExplicitlySet = true;
      params.locale = opts?.fallback ? { locale, fallback: opts.fallback } : { locale };
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
      const { condition, fallback } = resolveLocale();
      if (fallback) {
        return fetchWithLocaleFallback(fallback, params.limit);
      }
      return fetch(collection, buildQuery({ extraCondition: condition })).then((res) => res || []);
    },
    async first() {
      const { condition, fallback } = resolveLocale();
      if (fallback) {
        return fetchWithLocaleFallback(fallback, 1).then((res) => res[0] || null);
      }
      return fetch(collection, buildQuery({ limit: 1, extraCondition: condition })).then((res) => res[0] || null);
    },
    async count(field = "*", distinct = false) {
      const { condition, fallback } = resolveLocale();
      if (fallback) {
        if (field === "*" && params.conditions.length === 0) {
          return fetch(collection, buildQuery({
            count: { field: "stem", distinct: true },
            extraCondition: localeInCondition(fallback),
            noLimitOffset: true
          })).then((m) => m[0].count);
        }
        if (field === "*") {
          return (await resolveLocaleRows(fallback, [])).rows.length;
        }
        const [{ rows }, values] = await Promise.all([
          resolveLocaleRows(fallback, []),
          fetch(collection, buildQuery({
            selectedFields: ["id", field],
            conditions: [...params.conditions, localeInCondition(fallback), `("${String(field)}" IS NOT NULL)`],
            noLimitOffset: true
          }))
        ]);
        const served = new Set(rows.map((row) => row.id));
        const counted = values.filter((row) => served.has(row.id));
        return distinct ? new Set(counted.map((row) => JSON.stringify(row[String(field)]))).size : counted.length;
      }
      return fetch(collection, buildQuery({
        count: { field: String(field), distinct },
        extraCondition: condition,
        noLimitOffset: true
      })).then((m) => m[0].count);
    }
  };
  function resolveLocale() {
    if (params.locale) {
      const { locale, fallback } = params.locale;
      return fallback ? { fallback: { locale, fallback } } : { condition: `("locale" = ${singleQuote(locale)})` };
    }
    if (params.localeExplicitlySet || !i18nConfig || !detectedLocale) {
      return {};
    }
    if (!i18nConfig.locales.includes(detectedLocale)) {
      const warning = `${String(collection)}:${detectedLocale}`;
      if (import.meta.dev && !unknownLocaleWarnings.has(warning)) {
        unknownLocaleWarnings.add(warning);
        console.warn(
          `[@nuxt/content] queryCollection("${String(collection)}"): the active locale ${JSON.stringify(detectedLocale)} is not one of the collection locales [${i18nConfig.locales.map((l) => `"${l}"`).join(", ")}], so results use the default locale "${i18nConfig.defaultLocale}".`
        );
      }
      return { condition: `("locale" = ${singleQuote(i18nConfig.defaultLocale)})` };
    }
    if (detectedLocale === i18nConfig.defaultLocale) {
      return { condition: `("locale" = ${singleQuote(detectedLocale)})` };
    }
    return { fallback: { locale: detectedLocale, fallback: i18nConfig.defaultLocale } };
  }
  async function resolveLocaleRows(localeFallback, fields, window) {
    const { locale } = localeFallback;
    const conditions = window?.conditions ?? params.conditions;
    const rows = await fetch(collection, buildQuery({
      selectedFields: fields === "*" ? [] : [...fields, ...LOCALE_KEY_FIELDS],
      conditions: [...conditions, localeInCondition(localeFallback)],
      ...window ? { window } : { noLimitOffset: true }
    })) ?? [];
    const complete = !window || rows.length < window.limit;
    const translated = window?.translated ?? /* @__PURE__ */ new Set();
    for (const row of rows) {
      if (row.locale === locale) {
        translated.add(row.stem);
      }
    }
    if (conditions.length > 0 || !complete) {
      const candidates = [...new Set(rows.filter((row) => row.locale !== locale && !translated.has(row.stem)).map((row) => row.stem))];
      const existing = await fetchInChunks(candidates, (chunk) => buildQuery({
        selectedFields: ["stem"],
        conditions: [`("locale" = ${singleQuote(locale)})`, `("stem" IN (${chunk.map(singleQuote).join(", ")}))`],
        noLimitOffset: true
      }));
      for (const row of existing) {
        translated.add(row.stem);
      }
    }
    return { rows: rows.filter((row) => row.locale === locale || !translated.has(row.stem)), complete };
  }
  async function fetchWithLocaleFallback(localeFallback, limit) {
    const selected = [...params.selectedFields];
    const offset = params.offset > 0 ? Number(params.offset) : 0;
    const pick = (row) => selected.length ? Object.fromEntries(selected.map((field) => [field, row[String(field)]])) : row;
    if (!(limit > 0)) {
      const { rows: rows2 } = await resolveLocaleRows(localeFallback, selected.length ? selected : "*");
      return rows2.map(pick);
    }
    const end = offset + Number(limit);
    const keys = [];
    const state = { conditions: [...params.conditions], orderBy: [...params.orderBy], translated: /* @__PURE__ */ new Set() };
    for (let start = 0, size = Math.max(2 * end, KEY_WINDOW_SIZE); keys.length < end; start += size, size *= 4) {
      const window = await resolveLocaleRows(localeFallback, [], { ...state, offset: start, limit: size });
      keys.push(...window.rows);
      if (window.complete) {
        break;
      }
    }
    const ids = keys.slice(offset, end).map((row) => row.id);
    const rows = await fetchInChunks(ids, (chunk) => buildQuery({
      selectedFields: selected.length ? [...selected, "id"] : [],
      conditions: [`("id" IN (${chunk.map(singleQuote).join(", ")}))`],
      noLimitOffset: true
    }));
    const position = new Map(ids.map((id, index) => [id, index]));
    return rows.sort((a, b) => position.get(a.id) - position.get(b.id)).map(pick);
  }
  async function fetchInChunks(values, build) {
    const chunks = [];
    let bytes = 0;
    for (const value of values) {
      const size = utf8.encode(singleQuote(value)).length + 2;
      if (!chunks.length || bytes + size > IN_LIST_MAX_BYTES) {
        chunks.push([]);
        bytes = 0;
      }
      chunks.at(-1).push(value);
      bytes += size;
    }
    const results = await Promise.all(chunks.map((chunk) => fetch(collection, build(chunk))));
    return results.flatMap((res) => res || []);
  }
  function buildQuery(opts = {}) {
    let query2 = "SELECT ";
    if (opts?.count) {
      query2 += `COUNT(${opts.count.distinct ? "DISTINCT " : ""}${opts.count.field}) as count`;
    } else {
      const fields = Array.from(new Set(opts.selectedFields ?? params.selectedFields));
      query2 += fields.length > 0 ? fields.map((f) => `"${String(f)}"`).join(", ") : "*";
    }
    query2 += ` FROM ${tables[String(collection)]}`;
    const conditions = [...opts.conditions ?? params.conditions];
    if (opts.extraCondition) {
      conditions.push(opts.extraCondition);
    }
    if (conditions.length > 0) {
      query2 += ` WHERE ${conditions.join(" AND ")}`;
    }
    const orderBy = opts.window?.orderBy ?? params.orderBy;
    if (orderBy.length > 0) {
      query2 += ` ORDER BY ${orderBy.join(", ")}`;
    } else {
      query2 += ` ORDER BY stem ASC`;
    }
    if (opts.window) {
      const { offset, limit: limit2 } = opts.window;
      return `${query2}, "id" ASC LIMIT ${limit2}${offset > 0 ? ` OFFSET ${offset}` : ""}`;
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
function localeInCondition({ locale, fallback }) {
  return `("locale" IN (${singleQuote(locale)}, ${singleQuote(fallback)}))`;
}
function singleQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
