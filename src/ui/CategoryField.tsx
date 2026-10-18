import { Field, type FieldProps } from "./controls";
import {
  categories,
  categoryGroups,
  type Category,
} from "../domain/categories";
export function CategoryField({
  numeric = false,
  scope = "all",
  includeGroups = false,
  allLabel,
  emptyLabel,
  availableKeys,
  ...props
}: Omit<FieldProps, "options" | "optionGroups"> & {
  numeric?: boolean;
  scope?: "all" | "spending" | "expense" | "income" | "tax";
  includeGroups?: boolean;
  allLabel?: string;
  emptyLabel?: string;
  availableKeys?: string[];
}) {
  const allowed = (c: Category) =>
    (!availableKeys || availableKeys.includes(c.key)) &&
    (scope === "spending"
      ? c.budgetable
      : scope === "expense"
        ? c.parentId !== 2
        : scope === "income"
          ? c.parentId === 2
          : scope === "tax"
            ? c.parentId === 159
            : true);
  return (
    <Field
      {...props}
      options={
        allLabel ? [["all", allLabel]] : emptyLabel ? [["", emptyLabel]] : []
      }
      optionGroups={categoryGroups
        .map((g) => ({
          label: g.name,
          options: [
            ...(includeGroups
              ? [[`group:${g.id}`, `All ${g.name}`] as [string, string]]
              : []),
            ...categories
              .filter((c) => c.parentId === g.id && allowed(c))
              .map(
                (c) =>
                  [numeric ? String(c.id) : c.key, c.name] as [string, string],
              ),
          ],
        }))
        .filter(
          (g) =>
            g.options.length &&
            (!availableKeys ||
              categories.some(
                (c) =>
                  c.parentId ===
                    categoryGroups.find((p) => p.name === g.label)!.id &&
                  allowed(c),
              )),
        )}
    />
  );
}
