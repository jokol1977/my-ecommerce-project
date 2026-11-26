export type CategoryNode = { id: string; name: string; parentId: string | null };

export function getCategoryPaths<T extends CategoryNode>(categories: T[]) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const paths = new Map<string, string>();

  function resolve(id: string, visited = new Set<string>()): string {
    const category = byId.get(id);
    if (!category) return "";
    if (visited.has(id)) return category.name;
    visited.add(id);
    const parentPath = category.parentId ? resolve(category.parentId, visited) : "";
    return parentPath ? `${parentPath} / ${category.name}` : category.name;
  }

  for (const category of categories) paths.set(category.id, resolve(category.id));
  return paths;
}

export function getCategoryBranchIds<T extends CategoryNode>(categories: T[], rootId: string) {
  const childrenByParent = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const children = childrenByParent.get(category.parentId) ?? [];
    children.push(category.id);
    childrenByParent.set(category.parentId, children);
  }

  const ids: string[] = [];
  const pending = [rootId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    ids.push(id);
    pending.push(...(childrenByParent.get(id) ?? []));
  }
  return ids;
}
