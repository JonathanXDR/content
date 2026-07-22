import { collectionQueryBuilder } from "./internal/query.js";
import { generateNavigationTree } from "./internal/navigation.js";
import { generateItemSurround } from "./internal/surround.js";
import { generateSearchSections } from "./internal/search.js";
import { generateCollectionLocales } from "./internal/locales.js";
import { detectServerLocale } from "./internal/i18n-detection.js";
import { fetchQuery } from "./internal/api.js";
export const queryCollection = (event, collection) => {
  return collectionQueryBuilder(collection, (collection2, sql) => fetchQuery(event, collection2, sql), detectServerLocale(event));
};
export function queryCollectionNavigation(event, collection, fields) {
  return chainablePromise(event, collection, (qb) => generateNavigationTree(qb, fields));
}
export function queryCollectionItemSurroundings(event, collection, path, opts) {
  return chainablePromise(event, collection, (qb) => generateItemSurround(qb, path, opts));
}
export function queryCollectionSearchSections(event, collection, opts) {
  return chainablePromise(event, collection, (qb) => generateSearchSections(qb, opts));
}
export function queryCollectionLocales(event, collection, stem) {
  const qb = collectionQueryBuilder(collection, (collection2, sql) => fetchQuery(event, collection2, sql));
  return generateCollectionLocales(qb, String(collection), stem);
}
function chainablePromise(event, collection, fn) {
  const queryBuilder = queryCollection(event, collection);
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
