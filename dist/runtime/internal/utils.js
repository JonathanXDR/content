export function pick(keys) {
  return (obj) => {
    obj = obj || {};
    return (keys || []).filter((key) => typeof obj[key] !== "undefined").reduce((newObj, key) => Object.assign(newObj, { [key]: obj[key] }), {});
  };
}
export function createYielder(budget = 40) {
  let start = performance.now();
  return async () => {
    if (typeof window === "undefined" || performance.now() - start < budget) {
      return;
    }
    const { scheduler } = globalThis;
    await (scheduler?.yield?.() ?? new Promise((resolve) => setTimeout(resolve, 0)));
    start = performance.now();
  };
}
