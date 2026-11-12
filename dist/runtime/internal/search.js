import { toHast } from "minimark/hast";
import { createYielder, pick } from "./utils.js";
const HEADING = /^h([1-6])$/;
const headingLevel = (tag) => Number(tag.match(HEADING)?.[1] ?? 0);
export async function generateSearchSections(queryBuilder, opts) {
  const { ignoredTags = [], extraFields = [], minHeading = "h1", maxHeading = "h6" } = opts || {};
  const minLevel = headingLevel(minHeading);
  const maxLevel = headingLevel(maxHeading);
  const documents = await queryBuilder.where("extension", "=", "md").select("path", "body", "description", "title", ...extraFields || []).all();
  const yieldToMain = createYielder();
  const sections = [];
  for (const doc of documents) {
    await yieldToMain();
    for (const section of splitPageIntoSections(doc, { ignoredTags, extraFields, minLevel, maxLevel })) {
      sections.push(section);
    }
  }
  return sections;
}
function splitPageIntoSections(page, { ignoredTags, extraFields, minLevel, maxLevel }) {
  const body = !page.body || page.body?.type === "root" ? page.body : toHast(page.body);
  const path = page.path ?? "";
  const extraFieldsData = pick(extraFields)(page);
  const sections = [{
    ...extraFieldsData,
    id: path,
    title: page.title || "",
    titles: [],
    content: (page.description || "").trim(),
    level: 1
  }];
  if (!body?.children) {
    return sections;
  }
  let section = 1;
  let previousHeadingLevel = 0;
  const titles = [page.title ?? ""];
  for (const item of body.children) {
    const tag = item.tag || "";
    const level = headingLevel(tag);
    if (level >= minLevel && level <= maxLevel) {
      const title = extractTextFromAst(item).trim();
      if (level === 1) {
        titles.splice(0, titles.length);
      } else if (level < previousHeadingLevel) {
        titles.splice(level - 1, titles.length - 1);
      } else if (level === previousHeadingLevel) {
        titles.pop();
      }
      sections.push({
        ...extraFieldsData,
        id: `${path}#${item.props?.id}`,
        title,
        titles: [...titles],
        content: "",
        level
      });
      titles.push(title);
      previousHeadingLevel = level;
      section += 1;
    } else {
      const content = extractTextFromAst(item, ignoredTags).trim();
      if (section === 1 && sections[section - 1]?.content === content) {
        continue;
      }
      sections[section - 1].content = `${sections[section - 1].content} ${content}`.trim();
    }
  }
  return sections;
}
const INLINE_TAGS = /* @__PURE__ */ new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "cite",
  "code",
  "data",
  "del",
  "dfn",
  "em",
  "i",
  "img",
  "ins",
  "kbd",
  "mark",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "var",
  "wbr"
]);
function extractTextFromAst(node, ignoredTags = []) {
  let text = "";
  let boundary = false;
  const visit = (node2) => {
    if (node2.type === "text") {
      const value = node2.value || "";
      if (!value) {
        return;
      }
      if (boundary && text && !/\s$/.test(text) && !/^\s/.test(value)) {
        text += " ";
      }
      text += value;
      boundary = false;
      return;
    }
    const tag = node2.tag ?? "";
    const isBlock = !INLINE_TAGS.has(tag);
    if (ignoredTags.includes(tag)) {
      boundary ||= isBlock;
      return;
    }
    boundary ||= isBlock;
    for (const child of node2.children || []) {
      visit(child);
    }
    boundary ||= isBlock;
  };
  visit(node);
  return text;
}
const FTS_TABLE = "_fts_search";
const indexedCollections = /* @__PURE__ */ new Map();
const indexingCollections = /* @__PURE__ */ new Map();
let ftsTableCreated = false;
let ftsGeneration = 0;
export const getFTSGeneration = () => ftsGeneration;
export function _resetFTSState() {
  indexedCollections.clear();
  indexingCollections.clear();
  ftsTableCreated = false;
}
export async function resetFTSIndex(db) {
  ftsGeneration++;
  indexedCollections.clear();
  indexingCollections.clear();
  ftsTableCreated = false;
  await db.exec(`DROP TABLE IF EXISTS ${FTS_TABLE}`);
}
export async function buildFTSIndex(db, collection, queryBuilder, opts, locale) {
  if (indexedCollections.has(collection) && indexedCollections.get(collection) === locale) {
    return;
  }
  const inFlight = indexingCollections.get(collection);
  if (inFlight && inFlight.locale === locale) {
    return inFlight.promise;
  }
  const replace = indexedCollections.delete(collection) || inFlight !== void 0;
  const build = { locale };
  const isCurrent = () => indexingCollections.get(collection) === build;
  build.promise = indexCollection(db, collection, queryBuilder, opts, { locale, replace, isCurrent }).finally(() => {
    if (isCurrent()) {
      indexingCollections.delete(collection);
    }
  });
  indexingCollections.set(collection, build);
  return build.promise;
}
async function indexCollection(db, collection, queryBuilder, opts, { locale, replace, isCurrent }) {
  if (!ftsTableCreated) {
    await db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS ${FTS_TABLE} USING fts5(collection UNINDEXED, id UNINDEXED, title, title_normalized, titles UNINDEXED, content, level UNINDEXED)`);
    if (!isCurrent()) {
      return;
    }
    ftsTableCreated = true;
  }
  if (replace) {
    await db.exec(`DELETE FROM ${FTS_TABLE} WHERE collection = ?`, [collection]);
  }
  const sections = await generateSearchSections(queryBuilder, opts);
  const yieldToMain = createYielder();
  for (const section of sections) {
    await yieldToMain();
    if (!isCurrent()) {
      return;
    }
    const titleNormalized = section.title.replace(/([a-z])([A-Z])/g, "$1 $2");
    await db.exec(
      `INSERT INTO ${FTS_TABLE} (collection, id, title, title_normalized, titles, content, level) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [collection, section.id, section.title, titleNormalized, JSON.stringify(section.titles), section.content, section.level]
    );
  }
  if (isCurrent()) {
    indexedCollections.set(collection, locale);
  }
}
export async function queryFTS(db, collections, query, opts) {
  const { limit = 20, snippet, fields, minTermLength = 1, weights } = opts || {};
  const titleWeight = weights?.title ?? 20;
  const contentWeight = weights?.content ?? 5;
  const headingExponent = weights?.heading ?? 0.5;
  const tag = (snippet?.tag ?? "mark").replace(/[^a-z0-9]/gi, "");
  const pre = `<${tag}>`;
  const post = `</${tag}>`;
  const placeholders = collections.map(() => "?").join(", ");
  const collectionFilter = `collection IN (${placeholders})`;
  const bm25Expr = `bm25(${FTS_TABLE}, 0, 0, ${titleWeight}, ${titleWeight}, 0, ${contentWeight}, 0)`;
  const rankExpr = headingExponent > 0 ? `(${bm25Expr} / pow(level, ${headingExponent}))` : bm25Expr;
  let selectClause = `collection, id, title, titles, content, level, ${rankExpr} as rank`;
  const snippetColumns = snippet?.columns ?? (snippet ? ["content"] : []);
  const around = Number(snippet?.around) || 30;
  const wantContentSnippet = snippetColumns.includes("content");
  if (wantContentSnippet) {
    selectClause += `, snippet(${FTS_TABLE}, 5, '${pre}', '${post}', '...', ${around}) as snippet_content`;
  }
  const terms = query.split(/\s+/).filter((t) => t.length >= minTermLength);
  if (!terms.length) return [];
  const ftsQuery = terms.map((term) => {
    const escaped = term.replace(/"/g, '""');
    if (fields?.length) {
      return fields.map((f) => `${f} : "${escaped}"*`).join(" OR ");
    }
    return `"${escaped}"*`;
  }).join(" ");
  const sql = `SELECT ${selectClause} FROM ${FTS_TABLE} WHERE ${FTS_TABLE} MATCH ? AND ${collectionFilter} ORDER BY rank LIMIT ?`;
  const params = [ftsQuery, ...collections, limit];
  let rows;
  try {
    rows = await db.all(sql, params);
  } catch (err) {
    if (import.meta.dev) {
      console.warn("[nuxt-content] FTS query failed:", err);
    }
    return [];
  }
  const wantTitleSnippet = snippetColumns.includes("title");
  const titleRegex = wantTitleSnippet ? new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi") : null;
  return rows.map((row) => ({
    collection: row.collection,
    id: row.id,
    title: row.title,
    titles: JSON.parse(row.titles || "[]"),
    level: row.level,
    content: row.content,
    rank: row.rank,
    ...snippetColumns.length && {
      snippets: {
        ...wantTitleSnippet && { title: row.title.replace(titleRegex, `${pre}$1${post}`) },
        ...wantContentSnippet && { content: row.snippet_content }
      }
    }
  }));
}
