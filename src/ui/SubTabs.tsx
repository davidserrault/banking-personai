import type { LucideIcon } from "lucide-react";

export function SubTabs<T extends string>({
  id,
  label,
  items,
  value,
  onChange,
}: {
  id: string;
  label: string;
  items: readonly { id: T; label: string; icon: LucideIcon }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <nav
      className="secondary-nav section-tabs"
      role="tablist"
      aria-label={label}
    >
      {items.map(({ id: key, label, icon: Icon }, index) => (
        <button
          key={key}
          type="button"
          id={`${id}-tab-${key}`}
          role="tab"
          aria-selected={value === key}
          aria-controls={`${id}-panel-${key}`}
          tabIndex={value === key ? 0 : -1}
          className={value === key ? "active" : ""}
          onClick={() => onChange(key)}
          onKeyDown={(event) => {
            let next: number;
            switch (event.key) {
              case "ArrowRight":
                next = (index + 1) % items.length;
                break;
              case "ArrowLeft":
                next = (index + items.length - 1) % items.length;
                break;
              case "Home":
                next = 0;
                break;
              case "End":
                next = items.length - 1;
                break;
              default:
                return;
            }
            event.preventDefault();
            onChange(items[next].id);
            const buttons =
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                "[role=tab]",
              );
            buttons?.[next]?.focus();
          }}
        >
          <Icon size={15} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
