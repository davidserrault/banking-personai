# Spending Modes — implementation contract

Added in `personai.deterministic.v1.3.0`; duration editing updated in `personai.deterministic.v1.4.0`. The original specification bundle is preserved.

`configuration.spendingModes` is an optional array of independently scheduled strategies. Missing, disabled or zero-intensity modes do not alter baseline cash flows. Presets live in `src/config/modes.ts`; the typed contract is `src/domain/modes.ts`. The strict configuration schema validates the same objects used by the UI, CLI, imports and engine.

## Timing and selection

- `enabled` permits a mode to participate. With no activation conditions, `active` requests activation on its schedule. With conditions, those conditions determine activation instead.
- `activationTriggers` and `deactivationTriggers` each have `match: all | any` and typed `rules`. Empty activation groups follow the activation switch; empty deactivation groups follow the schedule.
- The editor exposes an optional start date and one duration in calendar days from activation, including the first day (default 30). It does not expose an end date. Browser imports convert legacy end dates into the inclusive day count from the start date (or simulation start), limited by any shorter existing duration. Modes without a duration receive 30 days. Trigger date ranges retain their own end dates. Direct engine consumers can still supply the legacy end-date field; the earlier legacy boundary wins.
- Recurrence repeats the original schedule monthly or yearly, including cross-year windows. Month-end dates are clamped. Cooldown starts when activation ends; expired windows do not restart it.
- Higher numeric priority wins; ties sort by stable ID. Lower-priority modes remain activated but suppressed, so duration continues to elapse.
- `transitionDuration` blends intensity into/out of purchase effects. A triggered deactivation fades out over the transition. Scheduled exits fade within the scheduled interval. Funding permissions are discrete while the mode is selected.
- No effective mode means baseline behaviour resumes. Prior transactions and changed balances are retained.

## Financial effects

Category amount and frequency multipliers combine with baseline profile, prices and seasonality. Intensity blends each multiplier from 1. Seeded mode variability has its own random stream. Changing modes never mutates baseline budgets or merchant references. Category substitutions move a configured share of reduced spending to an alternative category. Survival prefers lower-cost merchants when alternatives exist.

Monthly budgets are adjusted only for the remaining portion of the month when a mode changes. Obligations take priority over optional purchases. Rent, fixed charges, taxes, loan installments/insurance and bank fees cannot be skipped by a mode. Explicit credit facilities and committed purchases remain commitments; modes govern new discretionary credit use. Optional expenses can be deferred; deferrals are audited, not automatically rescheduled. Travel is checked before departure and already-started travel remains committed.

Withdrawals respect account eligibility (`withdrawalRank > 0`), available positive balances, mode permissions and the configured allowance. The allowance starts as a percentage of eligible savings at activation and includes the same percentage of new contributions. Eligible investment withdrawals additionally require the mode's persistence threshold. Deposits respect priority, account ceilings, operational cash and upcoming obligations. Planner selects accessible savings and keeps planned reserves liquid. Investor favors eligible configured returns and deposit priority. The retired baseline investment-risk preference is ignored in old files and omitted from new exports; asset prices and security-specific investment risk are not simulated.

Balanced needs/wants/future percentages total 100. They are soft targets: normal essentials and compulsory payments are preserved, the wants allocation shrinks when those obligations consume the available income, and future contributions are limited after debt repayment. They do not force extra purchases to hit a quota.

## Trigger observations

Triggers are sampled daily after actual income receipts and before the day's expenses. Category/discretionary conditions include spending already posted; they can therefore respond the following day. Unexpected planned expenses are visible before purchase. Internal transfers, borrowing and synthetic external support do not count as earned income. Transfers do not count as spending.

Monthly income is compared with the mean of up to three completed simulation months, falling back to configured average income. Salary decrease compares actual payment with its configured payment baseline. Absence means days since the latest receipt; before the first receipt it counts from simulation start. Salary-relative dates use the actual generated salary schedule. Net wealth means bank assets minus outstanding loan principal, excluding physical property. Decline is measured from the observed net-wealth peak. Liquid-asset coverage includes baseline spending, taxes and outstanding installments. Consecutive overspending counts completed months only.

Income can be classified by kind, expectation, recurrence and change persistence. Filters can be combined with other trigger families. `frequency: once` creates one receipt, with optional start/end limits; exceptional one-off receipts are excluded from the regular annualized income-tax estimate, whose existing reconciliation limitations still apply.

## Reproducibility and exports

Configuration version 2 accepts the optional mode extension. Imports reject malformed dates, allocations, identifiers and rules. Display labels do not affect the financial fingerprint. History exports include `modeHistory`, transactions include `modeId` where applicable, and daily balance output includes the effective intensity. An unchanged seed, configuration and references reproduce the same result.
