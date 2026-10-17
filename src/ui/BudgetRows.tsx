import { useEffect, useState, type CSSProperties } from "react";
import { RotateCcw } from "lucide-react";
import type { PersonaConfig } from "../domain/types";
import { DeleteButton } from "./controls";
import { ReferenceNumber } from "./ReferenceAdjustment";
import { categoryLabel } from "./messages";

const descriptions: Record<string, string> = {
  groceries: "Food and everyday household essentials.",
  bakery: "Bread, pastries and local convenience shops.",
  fuel: "Petrol, diesel and vehicle refuelling.",
  transport: "Public transport, parking and tolls.",
  health: "Pharmacies, healthcare and personal wellbeing.",
  restaurants: "Dining out and delivered meals.",
  coffee: "Coffee shops and small daily treats.",
  shopping: "Clothing, accessories and everyday purchases.",
  leisure: "Entertainment, hobbies and cultural activities.",
  home: "Homeware, repairs and DIY supplies.",
  digital: "Digital purchases and telecom services.",
  travel: "Travel bookings and transport for trips.",
  hotels: "Hotels, campsites and overnight stays.",
  fastfood: "Quick meals and takeaway food.",
  bars: "Bars, drinks and evenings out.",
  alcohol: "Wine, beer and other alcoholic drinks.",
  cycling: "Bicycles, accessories and maintenance.",
  taxes: "Variable tax payments and public charges.",
  bankfees: "Variable banking charges.",
  incidentfees: "Additional simulated payment incident costs.",
  ridehailing: "Taxis, private drivers and ride-hailing.",
  childrenActivities: "Sports, clubs and activities for children.",
  luxury: "Designer goods and luxury purchases.",
};

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
        <p>{descriptions[category]}</p>
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
