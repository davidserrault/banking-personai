import { useEffect, useState, type CSSProperties } from "react";
import { RotateCcw } from "lucide-react";
import type { PersonaConfig } from "../domain/types";
import { DeleteButton } from "./controls";
import { ReferenceNumber } from "./ReferenceAdjustment";
import { categoryByKey, groupById } from "../domain/categories";
import { categoryLabel } from "./messages";

export function BudgetRow({
  category,
  amount,
  total,
  config,
  revision,
  onChange,
  onReset,
}: {
  category: string;
  amount: number;
  total: number;
  config: PersonaConfig;
  revision: number;
  onChange: (amount: number) => void;
  onReset: () => void;
}) {
  const share = total > 0 ? (amount / total) * 100 : 0;
  const [slider, setSlider] = useState(share);
  useEffect(() => setSlider(share), [share, revision]);
  const other = total - amount;
  const commitShare = () => {
    if (Math.abs(slider - share) < 0.000001) return;
    const next = other > 0 ? (other * slider) / (100 - slider) : amount;
    onChange(
      Math.round(next * 10 ** config.currencyDigits) /
        10 ** config.currencyDigits,
    );
  };
  const name = categoryLabel(category);
  return (
    <div className="budget-row">
      <div className="budget-description">
        <strong>{name}</strong>
        <p>{groupById[categoryByKey[category]?.parentId]?.name}</p>
      </div>
      <input
        className="budget-slider"
        type="range"
        min={0}
        max={other > 0 ? Math.max(99.9, share) : 100}
        step="any"
        value={slider}
        aria-label={`${name} share of total budget`}
        aria-valuetext={`${slider.toFixed(1)} percent`}
        disabled={other <= 0}
        style={{ "--share": `${slider}%` } as CSSProperties}
        onChange={(e) => setSlider(Number(e.target.value))}
        onPointerUp={commitShare}
        onKeyUp={(e) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(e.key)
          )
            commitShare();
        }}
        onBlur={commitShare}
      />
      <div className="budget-amount">
        <ReferenceNumber
          value={amount}
          revision={revision}
          label={`${name} budget amount`}
          step={10 ** -config.currencyDigits}
          onCommit={onChange}
        />
        <span>
          {config.displayCurrency ?? config.currency} · {share.toFixed(1)}%
        </span>
      </div>
      <div className="budget-actions">
        <button
          className="icon-button"
          title={`Reset ${name} budget and merchant settings`}
          aria-label={`Reset ${name} budget and merchant settings`}
          onClick={onReset}
        >
          <RotateCcw size={16} />
        </button>
        <DeleteButton
          label={`Remove ${name} budget`}
          onClick={() => onChange(0)}
        />
      </div>
    </div>
  );
}
