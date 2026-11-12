import { createDefu } from "defu";
export * from "./files.js";
export const defu = createDefu((obj, key, value) => {
  if (Array.isArray(obj[key]) && Array.isArray(value)) {
    obj[key] = value;
    return true;
  }
});
export const createSingleton = (fn) => {
  let instance;
  return (_args) => {
    if (!instance) {
      instance = fn();
    }
    return instance;
  };
};
export function deepDelete(obj, newObj) {
  for (const key in obj) {
    const val = newObj[key];
    if (!(key in newObj)) {
      delete obj[key];
    }
    if (val !== null && typeof val === "object") {
      deepDelete(obj[key], newObj[key]);
    }
  }
}
export function deepAssign(obj, newObj) {
  for (const key in newObj) {
    const val = newObj[key];
    if (val === "_DELETED_") {
      delete obj[key];
      continue;
    }
    if (val !== null && typeof val === "object") {
      if (Array.isArray(val) && Array.isArray(obj[key])) {
        obj[key] = val;
      } else {
        obj[key] = obj[key] || {};
        deepAssign(obj[key], val);
      }
    } else {
      obj[key] = val;
    }
  }
}
export function parseSourceBase(source) {
  const [fixPart, ...rest] = source.include.includes("*") ? source.include.split("*") : ["", source.include];
  return {
    fixed: fixPart || "",
    dynamic: "*" + rest.join("*")
  };
}
export const formatDate = (date) => {
  const d = toUtcDate(date);
  if (Number.isNaN(d.getTime())) {
    throw new TypeError(`Invalid date value: "${date}"`);
  }
  return d.toISOString().slice(0, 10);
};
export const formatDateTime = (datetime) => {
  const d = toUtcDate(datetime);
  if (Number.isNaN(d.getTime())) {
    throw new TypeError(`Invalid datetime value: "${datetime}"`);
  }
  return d.toISOString().slice(0, 19).replace("T", " ");
};
const STRUCTURED = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/i;
function toUtcDate(value) {
  if (value instanceof Date) {
    return value;
  }
  const input = String(value).trim();
  const match = STRUCTURED.exec(input);
  if (!match) {
    return new Date(input);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] || 0);
  const minute = Number(match[5] || 0);
  const second = Number(match[6] || 0);
  const offset = match[7];
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() + 1 !== month || utc.getUTCDate() !== day || utc.getUTCHours() !== hour || utc.getUTCMinutes() !== minute || utc.getUTCSeconds() !== second) {
    return new Date(Number.NaN);
  }
  if (offset && offset.toUpperCase() !== "Z") {
    return new Date(input.includes("T") ? input : input.replace(" ", "T"));
  }
  return utc;
}
