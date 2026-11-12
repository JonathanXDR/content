const SQL_COUNT_REGEX = /^COUNT\((DISTINCT )?([a-z_]\w+|\*)\) as count$/i;
export const MAX_SQL_QUERY_LENGTH = 1e5;
function isWordChar(code) {
  return code >= 48 && code <= 57 || code >= 65 && code <= 90 || code >= 97 && code <= 122 || code === 95;
}
function parseSelectQuery(sql) {
  if (!sql.startsWith("SELECT ")) {
    return null;
  }
  let rest = sql;
  let offset;
  let limit;
  let order;
  {
    const m = / OFFSET \d+$/.exec(rest);
    if (m) {
      offset = m[0];
      rest = rest.slice(0, -offset.length);
    }
  }
  {
    const m = / LIMIT \d+$/.exec(rest);
    if (m) {
      limit = m[0];
      rest = rest.slice(0, -limit.length);
    }
  }
  if (rest.endsWith(" ASC")) {
    order = "ASC";
    rest = rest.slice(0, -4);
  } else if (rest.endsWith(" DESC")) {
    order = "DESC";
    rest = rest.slice(0, -5);
  } else {
    return null;
  }
  const orderByMarker = " ORDER BY ";
  const orderByIdx = rest.lastIndexOf(orderByMarker);
  if (orderByIdx === -1) {
    return null;
  }
  const orderBy = rest.slice(orderByIdx + orderByMarker.length);
  if (!orderBy.length) {
    return null;
  }
  rest = rest.slice(0, orderByIdx);
  const afterSelect = rest.slice("SELECT ".length);
  const fromMarker = " FROM ";
  const fromIdx = afterSelect.indexOf(fromMarker);
  if (fromIdx === -1) {
    return null;
  }
  const select = afterSelect.slice(0, fromIdx);
  const afterFrom = afterSelect.slice(fromIdx + fromMarker.length);
  let tableEnd = 0;
  while (tableEnd < afterFrom.length && isWordChar(afterFrom.charCodeAt(tableEnd))) {
    tableEnd += 1;
  }
  if (tableEnd === 0) {
    return null;
  }
  const from = afterFrom.slice(0, tableEnd);
  const afterTable = afterFrom.slice(tableEnd);
  let where;
  if (afterTable.length) {
    if (!afterTable.startsWith(" WHERE ")) {
      return null;
    }
    where = afterTable;
  }
  return { select, from, where, orderBy, order, limit, offset };
}
export function assertSafeQuery(sql, collection) {
  if (!sql) {
    throw new Error("Invalid query: Query cannot be empty");
  }
  if (sql.length > MAX_SQL_QUERY_LENGTH) {
    throw new Error("Invalid query: Query exceeds maximum allowed length");
  }
  const cleanedupQuery = cleanupQuery(sql);
  if (cleanedupQuery !== sql) {
    throw new Error("Invalid query: SQL comments are not allowed");
  }
  const parsed = parseSelectQuery(sql);
  if (!parsed) {
    throw new Error("Invalid query: Query must be a valid SELECT statement with proper syntax");
  }
  const { select, from, where, orderBy, order, limit, offset } = parsed;
  const columns = select?.trim().split(", ") || [];
  if (columns.length === 1) {
    if (columns[0] !== "*" && !columns[0]?.match(SQL_COUNT_REGEX) && !columns[0]?.match(/^"[a-z_]\w+"$/i)) {
      throw new Error(`Invalid query: Column '${columns[0]}' has invalid format. Expected *, COUNT(), or a quoted column name`);
    }
  } else if (!columns.every((column) => column.match(/^"[a-z_]\w+"$/i))) {
    throw new Error("Invalid query: Multiple columns must be properly quoted and alphanumeric");
  }
  if (from !== `_content_${collection}`) {
    const collection2 = String(from || "").replace(/^_content_/, "");
    throw new Error(`Invalid query: Collection '${collection2}' does not exist`);
  }
  if (where && !isBuilderWhere(where)) {
    throw new Error("Invalid query: WHERE clause must match the query builder syntax");
  }
  const _order = (orderBy + " " + order).split(", ");
  if (!_order.every((column) => column.match(/^("[a-zA-Z_]\w*"|[a-zA-Z_]\w*) (ASC|DESC)$/))) {
    throw new Error("Invalid query: ORDER BY clause must contain valid column names followed by ASC or DESC");
  }
  if (limit !== void 0 && !limit.match(/^ LIMIT \d+$/)) {
    throw new Error("Invalid query: LIMIT clause must be a positive number");
  }
  if (offset !== void 0 && !offset.match(/^ OFFSET \d+$/)) {
    throw new Error("Invalid query: OFFSET clause must be a positive number");
  }
  return true;
}
function isBuilderWhere(where) {
  if (!where.startsWith(" WHERE ")) {
    return false;
  }
  const end = parseWhereBody(where, " WHERE ".length);
  return end === where.length;
}
function parseWhereBody(sql, i) {
  let next = parseGroup(sql, i);
  if (next < 0) {
    return -1;
  }
  while (sql.startsWith(" AND ", next)) {
    next = parseGroup(sql, next + " AND ".length);
    if (next < 0) {
      return -1;
    }
  }
  return next;
}
function parseGroup(sql, i) {
  if (sql[i] !== "(") {
    return -1;
  }
  const end = parseExpr(sql, i + 1);
  if (end < 0 || sql[end] !== ")") {
    return -1;
  }
  return end + 1;
}
function parseExpr(sql, i) {
  let next = parseItem(sql, i);
  if (next < 0) {
    return -1;
  }
  let joiner = "";
  while (sql.startsWith(" AND ", next) || sql.startsWith(" OR ", next)) {
    const found = sql.startsWith(" AND ", next) ? " AND " : " OR ";
    if (joiner && joiner !== found) {
      return -1;
    }
    joiner = found;
    next = parseItem(sql, next + found.length);
    if (next < 0) {
      return -1;
    }
  }
  return next;
}
function parseItem(sql, i) {
  if (sql[i] === "(") {
    return parseGroup(sql, i);
  }
  return parseLeaf(sql, i);
}
const WHERE_OPS = [
  { op: "IS NOT NULL", kind: "none" },
  { op: "IS NULL", kind: "none" },
  { op: "NOT BETWEEN", kind: "between" },
  { op: "BETWEEN", kind: "between" },
  { op: "NOT LIKE", kind: "value" },
  { op: "NOT IN", kind: "list" },
  { op: "LIKE", kind: "value" },
  { op: "IN", kind: "list" },
  { op: "<>", kind: "value" },
  { op: ">=", kind: "value" },
  { op: "<=", kind: "value" },
  { op: ">", kind: "value" },
  { op: "<", kind: "value" },
  { op: "=", kind: "value" }
];
function parseLeaf(sql, i) {
  const identEnd = parseQuotedIdent(sql, i);
  if (identEnd < 0 || sql[identEnd] !== " ") {
    return -1;
  }
  const matched = WHERE_OPS.find((candidate) => sql.startsWith(candidate.op, identEnd + 1));
  if (!matched) {
    return -1;
  }
  let j = identEnd + 1 + matched.op.length;
  if (matched.kind === "none") {
    return j;
  }
  if (sql[j] !== " ") {
    return -1;
  }
  j += 1;
  if (matched.kind === "list") {
    return parseValueList(sql, j);
  }
  if (matched.kind === "between") {
    const left = parseBuilderString(sql, j);
    if (left < 0 || !sql.startsWith(" AND ", left)) {
      return -1;
    }
    return parseBuilderString(sql, left + " AND ".length);
  }
  return parseBuilderString(sql, j);
}
function parseQuotedIdent(sql, i) {
  if (sql[i] !== '"') {
    return -1;
  }
  let j = i + 1;
  if (j >= sql.length || sql[j] === '"') {
    return -1;
  }
  while (j < sql.length && sql[j] !== '"') {
    j += 1;
  }
  return sql[j] === '"' ? j + 1 : -1;
}
function parseBuilderString(sql, i) {
  if (sql[i] !== "'") {
    return -1;
  }
  let j = i + 1;
  while (j < sql.length) {
    if (sql[j] === "'") {
      if (sql[j + 1] === "'") {
        j += 2;
        continue;
      }
      return j + 1;
    }
    j += 1;
  }
  return -1;
}
function parseValueList(sql, i) {
  if (sql[i] !== "(") {
    return -1;
  }
  let j = i + 1;
  if (sql[j] === ")") {
    return j + 1;
  }
  while (j < sql.length) {
    const end = parseBuilderString(sql, j);
    if (end < 0) {
      return -1;
    }
    if (sql.startsWith(", ", end)) {
      j = end + 2;
      continue;
    }
    return sql[end] === ")" ? end + 1 : -1;
  }
  return -1;
}
function cleanupQuery(query, options = {}) {
  let fence = null;
  let result = "";
  const stripAll = Boolean(options.removeString);
  const stripSingle = Boolean(options.removeSingleQuoted) && !stripAll;
  const strippingFence = (active) => {
    if (stripAll) {
      return true;
    }
    return stripSingle && active === "'";
  };
  for (let i = 0; i < query.length; i++) {
    const char = query[i];
    const nextChar = query[i + 1];
    if (fence) {
      if (fence === "[") {
        if (char === "]") {
          if (!strippingFence(fence)) {
            result += char;
          }
          fence = null;
        } else if (!strippingFence(fence)) {
          result += char;
        }
        continue;
      }
      if (char === fence) {
        if (nextChar === fence) {
          if (!strippingFence(fence)) {
            result += char + nextChar;
          }
          i += 1;
          continue;
        }
        if (!strippingFence(fence)) {
          result += char;
        }
        fence = null;
        continue;
      }
      if (!strippingFence(fence)) {
        result += char;
      }
      continue;
    }
    if (char === "'" || char === '"' || !options.standardQuotesOnly && (char === "`" || char === "[")) {
      fence = char;
      if (!strippingFence(fence)) {
        result += char;
      }
      continue;
    }
    if (char === "-" && nextChar === "-") {
      return result;
    }
    if (char === "/" && nextChar === "*") {
      i += 2;
      while (i < query.length && !(query[i] === "*" && query[i + 1] === "/")) {
        i += 1;
      }
      i += 2;
      continue;
    }
    result += char;
  }
  return result;
}
