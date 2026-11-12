import { pascalCase } from "scule";
import { pick } from "./utils.js";
export async function generateNavigationTree(queryBuilder, extraFields = []) {
  const params = queryBuilder.__params;
  if (!params?.orderBy?.length) {
    queryBuilder = queryBuilder.order("stem", "ASC");
  }
  const collecitonItems = await queryBuilder.orWhere(
    (group) => group.where("navigation", "<>", "false").where("navigation", "IS NULL")
  ).select("navigation", "stem", "path", "title", "meta", ...extraFields || []).all();
  const { contents, configs } = collecitonItems.reduce((acc, c) => {
    if (String(c.stem).split("/").pop() === ".navigation") {
      if (!c.title) {
        delete c.title;
      }
      const key = c.path.split("/").slice(0, -1).join("/") || "/";
      acc.configs[key] = {
        ...c,
        ...c.body
      };
    } else {
      acc.contents.push(c);
    }
    return acc;
  }, { configs: {}, contents: [] });
  const pickConfigNavigationFields = (content) => {
    const { _i18nSourceHash, ...meta } = content.meta || {};
    return {
      ...pick(["title", ...extraFields])(content),
      ...meta,
      ...isObject(content?.navigation) ? content.navigation : {}
    };
  };
  const pickNavigationFields = (content) => ({
    ...pick(["title", ...extraFields])(content),
    ...isObject(content?.navigation) ? content.navigation : {}
  });
  const checkedChildren = /* @__PURE__ */ new WeakMap();
  function findPlaceholder(nodes, path) {
    let checked = checkedChildren.get(nodes) ?? 0;
    if (checked !== false) {
      while (checked < nodes.length && nodes[checked].page !== false) {
        checked++;
      }
      if (checked === nodes.length) {
        checkedChildren.set(nodes, checked);
        return;
      }
      checkedChildren.set(nodes, false);
    }
    return nodes.find((item) => item.path === path && item.page === false);
  }
  const nav = contents.reduce((nav2, content) => {
    const parts = content.path.substring(1).split("/");
    const idParts = content.stem.split("/");
    const isIndex = !!idParts[idParts.length - 1]?.match(/([1-9]\d*\.)?index/g);
    const getNavItem = (content2) => ({
      title: content2.title,
      path: content2.path,
      stem: content2.stem,
      children: [],
      ...pickNavigationFields(content2)
    });
    const navItem = getNavItem(content);
    if (isIndex) {
      const dirConfig = configs[navItem.path];
      if (typeof dirConfig?.navigation !== "undefined" && dirConfig?.navigation === false) {
        return nav2;
      }
      if (content.path !== "/") {
        const indexItem = getNavItem(content);
        navItem.children.push(indexItem);
      }
      if (dirConfig) {
        Object.assign(
          navItem,
          pickConfigNavigationFields(dirConfig)
        );
      }
    }
    if (parts.length === 1) {
      const existed2 = isIndex && nav2.find((item) => item.path === navItem.path && item.page === false);
      if (isIndex && existed2) {
        Object.assign(existed2, {
          page: void 0,
          children: [
            ...navItem.children || [],
            ...existed2.children || []
          ]
        });
      } else {
        nav2.push(navItem);
      }
      return nav2;
    }
    const siblings = parts.slice(0, -1).reduce((nodes, part, i) => {
      const currentPathPart = "/" + parts.slice(0, i + 1).join("/");
      const conf = configs[currentPathPart];
      if (typeof conf?.navigation !== "undefined" && conf.navigation === false) {
        return [];
      }
      let parent = nodes.find((n) => n.path === currentPathPart);
      if (!parent) {
        const navigationConfig = conf ? pickConfigNavigationFields(conf) : {};
        parent = {
          ...navigationConfig,
          title: navigationConfig.title || generateTitle(part),
          path: currentPathPart,
          stem: idParts.slice(0, i + 1).join("/"),
          children: [],
          page: false
        };
        nodes.push(parent);
      }
      return parent.children;
    }, nav2);
    const existed = findPlaceholder(siblings, navItem.path);
    if (existed) {
      Object.assign(existed, {
        ...navItem,
        page: void 0,
        children: [
          ...navItem.children || [],
          ...existed.children || []
        ]
      });
    } else {
      siblings.push(navItem);
    }
    return nav2;
  }, []);
  return sortAndClear(nav);
}
function sortAndClear(nav) {
  const sorted = nav;
  for (const item of sorted) {
    if (item.children?.length) {
      sortAndClear(item.children);
    } else {
      delete item.children;
    }
  }
  return nav;
}
function isObject(obj) {
  return obj !== null && Object.prototype.toString.call(obj) === "[object Object]";
}
export const generateTitle = (path) => path.split(/[\s-]/g).map(pascalCase).join(" ");
