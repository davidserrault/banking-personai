import { useState } from "react";
import {
  categorySystem,
  categoryGroups,
  categories,
} from "../domain/categories";
import { Section } from "./controls";
export function CategoryReference() {
  const [search, setSearch] = useState("");
  return (
    <Section
      title="Transaction categories"
      description={`${categoryGroups.length} main categories · ${categories.length} subcategories`}
    >
      <p className="muted">
        Category system by{" "}
        <a href="https://www.bridgeapi.io/" target="_blank" rel="noreferrer">
          Bridge
        </a>
        .{" "}
        <a
          href={categorySystem.documentationUrl}
          target="_blank"
          rel="noreferrer"
        >
          View the original category tree
        </a>
        .
      </p>
      <input
        className="category-search"
        aria-label="Search transaction categories"
        placeholder="Search categories"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="category-reference-list">
        {categoryGroups.map((g) => {
          const leaves = categories.filter(
            (c) =>
              c.parentId === g.id &&
              `${g.name} ${c.name} ${c.id}`
                .toLowerCase()
                .includes(search.toLowerCase()),
          );
          return leaves.length ? (
            <details key={g.id} open={search ? true : undefined}>
              <summary>
                {g.name}
                <span>{leaves.length}</span>
              </summary>
              <ul>
                {leaves.map((c) => (
                  <li key={c.id}>
                    <span>{c.name}</span>
                    <small>#{c.id}</small>
                  </li>
                ))}
              </ul>
            </details>
          ) : null;
        })}
      </div>
    </Section>
  );
}
