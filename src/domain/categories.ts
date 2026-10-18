import data from "../../specifications/reference/categories.json";
import groups from "../../specifications/reference/category-groups.json";
import system from "../../specifications/reference/category-system.json";
export const categorySystem = system;
export const categories = data;
export const categoryGroups = groups;
export type Category = (typeof data)[number];
export const categoryByKey: Record<string, Category> = Object.fromEntries(
  data.map((c) => [c.key, c]),
);
export const categoryById: Record<number, Category> = Object.fromEntries(
  data.map((c) => [c.id, c]),
);
export const groupById = Object.fromEntries(groups.map((g) => [g.id, g]));
export const spendingCategories = data.filter((c) => c.budgetable);
export const incomeCategories = data.filter((c) => c.parentId === 2);
export const expenseCategories = data.filter((c) => c.parentId !== 2);
export const categoryName = (key: string) => categoryByKey[key]?.name ?? key;
export const categoryPath = (key: string) => {
  const c = categoryByKey[key];
  return c ? `${groupById[c.parentId].name} / ${c.name}` : key;
};
export const matchesCategory = (key: string, selection: string) =>
  selection === "all" ||
  key === selection ||
  selection === `group:${categoryByKey[key]?.parentId}`;
export const categoryMetadata = (id: number) => {
  const c = categoryById[id];
  if (!c) throw new Error(`Unknown Bridge subcategory: ${id}`);
  return {
    id: c.id,
    key: c.key,
    name: c.name,
    parentId: c.parentId,
    parentName: groupById[c.parentId].name,
  };
};
