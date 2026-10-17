import { useId, useState } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { PersonaConfig } from "../domain/types";
import type { SimulationResult } from "../engine/types";
import { money, dateLabel, todayInZone } from "./format";
import { t } from "./messages";
import { balanceChartData, isAllAccounts } from "./balance-data";
const NEGATIVE_BALANCE_COLOR = "#FF8585";
export function BalanceChart({
  result,
  config,
  account,
  compact = false,
  onEvent,
}: {
  result: SimulationResult;
  config: PersonaConfig;
  account: string;
  compact?: boolean;
  onEvent?: (id: string) => void;
}) {
  const id = useId().replace(/:/g, "");
  const { series, data, minimum, maximum } = balanceChartData(
    result,
    account,
    compact ? 150 : 800,
  );
  const combined = account === "combined";
  const offset = series[0]?.zeroOffset ?? 1;
  const stroke = (s: (typeof series)[number], index: number) =>
    s.minimum >= 0
      ? s.color
      : s.maximum <= 0
        ? NEGATIVE_BALANCE_COLOR
        : `url(#line-${id}-${index})`;
  const today = todayInZone(config.timeZone);
  const [event, setEvent] = useState<string>();
  const active = result.events.find((x) => x.id === event);
  return (
    <>
      <div
        className={`balance-chart ${compact ? "compact" : ""}`}
        role="img"
        aria-label={t("studio.keyboardChart")}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 600, height: compact ? 133 : 310 }}
        >
          <ComposedChart
            data={data}
            margin={{
              top: 16,
              right: compact ? 1 : 12,
              left: compact ? 0 : 5,
              bottom: 0,
            }}
          >
            <defs>
              {series.map((s, index) => (
                <linearGradient
                  key={s.key}
                  id={`line-${id}-${index}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset={s.zeroOffset} stopColor={s.color} />
                  <stop
                    offset={s.zeroOffset}
                    stopColor={NEGATIVE_BALANCE_COLOR}
                  />
                </linearGradient>
              ))}
              <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.13} />
                <stop offset={offset} stopColor="#FFFFFF" stopOpacity={0.05} />
                <stop
                  offset={offset}
                  stopColor={NEGATIVE_BALANCE_COLOR}
                  stopOpacity={0.13}
                />
                <stop
                  offset="100%"
                  stopColor={NEGATIVE_BALANCE_COLOR}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            {!compact && (
              <CartesianGrid
                vertical={false}
                stroke="#3f3f46"
                strokeDasharray="3 6"
              />
            )}
            <XAxis
              hide={compact}
              dataKey="date"
              tickFormatter={(x) =>
                new Date(x + "T12:00:00Z").toLocaleDateString("en-GB", {
                  month: "short",
                  year: "2-digit",
                  timeZone: "UTC",
                })
              }
              minTickGap={50}
              tick={{ fill: "#a1a1aa", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              hide={compact}
              width={65}
              tick={{ fill: "#a1a1aa", fontSize: 12 }}
              tickFormatter={(x) =>
                Math.abs(x) >= 1000 ? `${(x / 1000).toFixed(1)}k` : String(x)
              }
              tickLine={false}
              axisLine={false}
              domain={[minimum * 1.08, maximum * 1.08]}
            />
            <Tooltip
              contentStyle={{
                background: "#202024",
                border: "1px solid #71717a",
                borderRadius: 10,
                color: "#fff",
              }}
              labelFormatter={(x) => dateLabel(String(x), true)}
              formatter={(v, name) => [money(Number(v), config), String(name)]}
            />
            <ReferenceLine y={0} stroke="#71717a" strokeDasharray="3 4" />
            {!compact &&
              !isAllAccounts(account) &&
              config.accounts.find((x) => x.key === account)?.type ===
                "checking" && (
                <ReferenceLine
                  y={-(config.overdraft ? config.overdraftLimit : 0)}
                  stroke="#F5C36A"
                  strokeDasharray="4 5"
                  label={{
                    value: t("history.overdraft"),
                    fill: "#F5C36A",
                    fontSize: 12,
                    position: "insideBottomRight",
                  }}
                />
              )}
            {!compact && combined && (
              <Area
                type="linear"
                dataKey={(row) =>
                  Number(row.availableAssets) -
                  (config.overdraft ? config.overdraftLimit : 0)
                }
                stroke="#F5C36A"
                strokeDasharray="4 5"
                fill="transparent"
                isAnimationActive={false}
                dot={false}
                legendType="none"
                tooltipType="none"
              />
            )}
            {today >= result.startDate && today <= result.endDate && (
              <ReferenceLine
                x={data.find((x) => x.date >= today)?.date}
                stroke="#a1a1aa"
                strokeDasharray="3 3"
                label={
                  compact
                    ? undefined
                    : {
                        value: t("history.today"),
                        fill: "#c4c4cc",
                        fontSize: 12,
                      }
                }
              />
            )}
            {!compact &&
              result.events
                .slice(0, 20)
                .map((e) => (
                  <ReferenceLine
                    key={e.id}
                    x={data.find((x) => x.date >= e.startDate)?.date}
                    stroke="#71717a"
                    strokeDasharray="2 4"
                  />
                ))}
            {combined ? (
              <Area
                type="linear"
                dataKey="balance"
                name="Combined balance"
                stroke={stroke(series[0], 0)}
                strokeWidth={compact ? 1.7 : 2}
                fill={`url(#fill-${id})`}
                dot={false}
                isAnimationActive={false}
              />
            ) : (
              series.map((s, index) => (
                <Line
                  key={s.key}
                  type="linear"
                  dataKey={s.key}
                  name={s.name}
                  stroke={stroke(s, index)}
                  strokeDasharray={s.dash}
                  strokeWidth={compact ? 1.7 : 2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-legend account-legend">
        {combined ? (
          <>
            <span>
              <i />
              {t("studio.positive")}
            </span>
            <span>
              <i className="red" />
              {t("studio.negative")}
            </span>
          </>
        ) : (
          <>
            {series.map((s) => (
              <span key={s.key} title={`${s.name} · ${s.typeLabel}`}>
                <svg width="20" height="8" aria-hidden="true">
                  <line
                    x1="0"
                    y1="4"
                    x2="20"
                    y2="4"
                    stroke={s.color}
                    strokeWidth="2"
                    strokeDasharray={s.dash}
                  />
                </svg>
                {s.name}
              </span>
            ))}
            {minimum < 0 && (
              <span>
                <i className="red" />
                {t("studio.negative")}
              </span>
            )}
          </>
        )}
      </div>
      {!compact && result.events.length > 0 && (
        <div className="chart-events">
          {result.events.map((e) => (
            <button
              className={`chip event-chip ${event === e.id ? "selected" : ""}`}
              key={e.id}
              onClick={() => {
                setEvent(e.id === event ? undefined : e.id);
                onEvent?.(e.id);
              }}
            >
              {dateLabel(e.startDate, true)} · {e.label}
            </button>
          ))}
        </div>
      )}
      {active && (
        <div className="event-note">
          <strong>{active.label}</strong> · {t(`events.${active.status}`)}
          <p>
            {t("history.expenses")}: {money(active.expenses, config)} ·{" "}
            {t("history.income")}: {money(active.receipts, config)} ·{" "}
            {t("history.principal")}: {money(active.borrowed, config)}
          </p>
        </div>
      )}
    </>
  );
}
const COLORS = [
  "#ffffff",
  "#d4d4d8",
  "#a1a1aa",
  "#8b8b95",
  "#777781",
  "#686872",
];
export function Donut({
  items,
  config,
  title,
}: {
  items: { name: string; amount: number }[];
  config: PersonaConfig;
  title: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const sorted = items
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const total = sorted.reduce((s, x) => s + x.amount, 0);
  const data =
    sorted.length > 5
      ? [
          ...sorted.slice(0, 5),
          {
            name: t("history.other"),
            amount: sorted.slice(5).reduce((s, x) => s + x.amount, 0),
          },
        ]
      : sorted;
  return (
    <div className="donut-block">
      <h3>{title}</h3>
      <div className="donut-content">
        <div
          className="donut-graphic"
          role="img"
          aria-label={`${title}: ${money(total, config)}`}
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            initialDimension={{ width: 160, height: 160 }}
          >
            <PieChart>
              <Pie
                data={data.length ? data : [{ name: title, amount: 1 }]}
                dataKey="amount"
                nameKey="name"
                innerRadius="71%"
                outerRadius="95%"
                paddingAngle={2}
                stroke="#151518"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {(data.length ? data : [{}]).map((_, i) => (
                  <Cell
                    key={i}
                    fill={data.length ? COLORS[i % COLORS.length] : "#3f3f46"}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#202024",
                  border: "1px solid #71717a",
                  borderRadius: 10,
                  color: "#fff",
                }}
                itemStyle={{ color: "#fff" }}
                formatter={(v) => money(Number(v), config)}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-center">
            <span>{config.displayCurrency ?? config.currency}</span>
            <strong>
              {new Intl.NumberFormat("en-GB", {
                maximumFractionDigits: 0,
              }).format(total)}
            </strong>
          </div>
        </div>
        <div className="donut-legend">
          {(expanded ? sorted : data).map((x, i) => (
            <div key={x.name}>
              <span
                className="legend-square"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <span>
                {x.name}
                <small>{money(x.amount, config)}</small>
              </span>
              <strong>
                {total ? ((x.amount / total) * 100).toFixed(1) : 0}%
              </strong>
            </div>
          ))}
          {!data.length && <p className="muted">{t("studio.noMatches")}</p>}
          {sorted.length > 5 && (
            <button
              className="text-button"
              onClick={() => setExpanded(!expanded)}
            >
              {t(`history.${expanded ? "collapse" : "expand"}`)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
