import { eventHandler, getRouterParam, readBody, getHeader, createError } from "h3";
import loadDatabaseAdapter, { checkAndImportDatabaseIntegrity } from "../internal/database.server.js";
import { assertSafeQuery, MAX_SQL_QUERY_LENGTH } from "../internal/security.js";
import { useRuntimeConfig } from "nitropack/runtime";
const JSON_WRAPPER_OVERHEAD = 16;
const MAX_BODY_BYTES = MAX_SQL_QUERY_LENGTH * 6 + JSON_WRAPPER_OVERHEAD;
export default eventHandler(async (event) => {
  const contentLength = Number(getHeader(event, "content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: "Request body too large"
    });
  }
  const { sql } = await readBody(event);
  const collection = getRouterParam(event, "collection") || event.path?.split("/")?.[2] || "";
  assertSafeQuery(sql, collection);
  const conf = useRuntimeConfig().content;
  if (conf.integrityCheck) {
    await checkAndImportDatabaseIntegrity(event, collection, conf);
  }
  return (await loadDatabaseAdapter(conf)).all(sql);
});
