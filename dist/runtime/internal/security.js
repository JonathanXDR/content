const SQL_COMMANDS = /SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|\$/i;
const SQL_UNSAFE_FUNCTIONS = /\b(randomblob|zeroblob|load_extension|readfile|writefile|fts3_tokenizer|pg_sleep|pg_read_file|pg_read_binary_file|dblink|lo_import|lo_export)\s*\(/i;
const MAX_QUERY_LENGTH = 5e4;
const SQL_COUNT_REGEX = /^COUNT\((DISTINCT )?("[a-z_]\w*"|[a-z_]\w*|\*)\) as count$/i;
const SQL_SELECT_REGEX = /^SELECT (.*?) FROM (\w+)( WHERE .*?)?( ORDER BY (["\w,\s]+) (ASC|DESC))?( LIMIT \d+)?( OFFSET \d+)?$/;
export function assertSafeQuery(sql, collection) {
  if (!sql) {
    throw new Error("Invalid query: Query cannot be empty");
  }
  if (sql.length > MAX_QUERY_LENGTH) {
    throw new Error("Invalid query: Query exceeds the maximum allowed length");
  }
  if (sql.includes("\n") || sql.includes("\r")) {
    throw new Error("Invalid query: Newlines are not allowed in queries");
  }
  const cleanedupQuery = cleanupQuery(sql);
  if (cleanedupQuery !== sql) {
    throw new Error("Invalid query: SQL comments are not allowed");
  }
  const match = sql.match(SQL_SELECT_REGEX);
  if (!match) {
    throw new Error("Invalid query: Query must be a valid SELECT statement with proper syntax");
  }
  const [_, select, from, where, _orderByFull, orderBy, order, limit, offset] = match;
  const columns = select?.trim().split(", ") || [];
  if (columns.length === 1) {
    if (columns[0] !== "*" && !columns[0]?.match(SQL_COUNT_REGEX) && !columns[0]?.match(/^"[a-z_]\w*"$/i)) {
      throw new Error(`Invalid query: Column '${columns[0]}' has invalid format. Expected *, COUNT(), or a quoted column name`);
    }
  } else if (!columns.every((column) => column.match(/^"[a-z_]\w*"$/i))) {
    throw new Error("Invalid query: Multiple columns must be properly quoted and alphanumeric");
  }
  if (from !== `_content_${collection}`) {
    const invalidCollection = String(from || "").replace(/^_content_/, "");
    throw new Error(`Invalid query: Collection '${invalidCollection}' does not exist`);
  }
  if (where) {
    if (!where.startsWith(" WHERE (") || !where.endsWith(")")) {
      throw new Error("Invalid query: WHERE clause must be properly enclosed in parentheses");
    }
    const noString = cleanupQuery(where, { removeString: true });
    if (noString.match(SQL_COMMANDS)) {
      throw new Error("Invalid query: WHERE clause contains unsafe SQL commands");
    }
    if (noString.match(SQL_UNSAFE_FUNCTIONS)) {
      throw new Error("Invalid query: WHERE clause contains unsafe SQL functions");
    }
  }
  if (orderBy && order) {
    const _order = (orderBy + " " + order).split(", ");
    if (!_order.every((column) => column.match(/^("[a-zA-Z_]\w*"|[a-zA-Z_]\w*) (ASC|DESC)$/))) {
      throw new Error("Invalid query: ORDER BY clause must contain valid column names followed by ASC or DESC");
    }
  }
  if (limit !== void 0 && !limit.match(/^ LIMIT \d+$/)) {
    throw new Error("Invalid query: LIMIT clause must be a positive number");
  }
  if (offset !== void 0 && !offset.match(/^ OFFSET \d+$/)) {
    throw new Error("Invalid query: OFFSET clause must be a positive number");
  }
  return true;
}
function cleanupQuery(query, options = { removeString: false }) {
  let inString = false;
  let stringFence = "";
  let result = "";
  for (let i = 0; i < query.length; i++) {
    const char = query[i];
    const nextChar = query[i + 1];
    if (inString) {
      if (char === stringFence) {
        if (nextChar === stringFence) {
          if (!options?.removeString) {
            result += char + char;
          }
          i++;
          continue;
        } else {
          inString = false;
          stringFence = "";
        }
      }
      if (!options?.removeString) {
        result += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      inString = true;
      stringFence = char;
      if (!options?.removeString) {
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
      if (i < query.length) i += 2;
      continue;
    }
    result += char;
  }
  return result;
}
