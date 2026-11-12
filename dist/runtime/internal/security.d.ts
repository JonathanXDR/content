/**
 * Hard ceiling on SQL statement length accepted from the client.
 * Legitimate query-builder output is far smaller; this bounds work done by
 * validation and by the database before any expensive matching.
 */
export declare const MAX_SQL_QUERY_LENGTH = 100000;
/**
 * Assert that the query is safe
 * A query will consider safe if it matched the output pattern of query builder
 * Any mismatch will be considered as unsafe
 *
 * @param sql - The SQL query to check
 * @param collection - The collection to check
 * @returns True if the query is safe, false otherwise
 */
export declare function assertSafeQuery(sql: string, collection: string): boolean;
