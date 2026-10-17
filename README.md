# PersonAI

A deterministic synthetic banking data studio. Configure a fictional customer, generate a reproducible multi-account ledger, and download complete scenarios or account statements. All generation runs in your browser. Configuration and reference settings are saved automatically in local browser storage; the application uses no banking connection or server database. Hosted access is managed by Sites.

## Launch

With Node.js 22.13+ and pnpm installed:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:5173/**. Use the local server; opening `index.html` directly as a `file://` URL cannot run the application or its worker. On this Mac, `start-personai.command` also uses the bundled Codex Node runtime when Node is not on your PATH.

## Application

- **Configuration:** starting from five French personas including different settings, embedded references and transfer instructions. Profile owns optional location text, display currency and a location-adjusted cost-of-living multiplier, Behaviour owns the linked monthly budget rows, Accounts contains bank accounts, payment cards, credit facilities and transfers, and Charges contains recurring charges and taxes. Also configure incomes, savings priorities, seasonal behaviour, scheduled events, temporary modes and a 1–20-year horizon. The Habits and recurring life events editor has been removed; existing scenario data remains compatible. The global Bank fees module has been removed. Legacy bank-fee settings are import-only compatibility data, ignored by generation and omitted from current configuration exports.
- **Reference:** linked merchant purchase amounts/frequencies, custom merchants, an editable progressive income-tax grid and reference-setting import/export. Links lead to the single context and budget editors in Configuration.
- **Payment cards:** Debit card is the default, with zero authorized overdraft and zero overdraft rate. The selected card pays merchant purchases, habitual card payments, trips and one-off exceptional purchases; recurring charges, taxes, car/property transfers and loan repayments stay on the current account. Deferred and credit cards have separate zero-opening ledgers. Deferred bills settle monthly (day 1 by default). Credit defaults to 20% annually, monthly interest after due repayments, and a monthly 10% refund; fixed amounts and weekly/quarterly/yearly refunds are available. Authorized overdraft applies to the current account when paying or refunding the card. Insufficient funding declines debit purchases or leaves card bills outstanding. Overdraft interest accrues only on this card's attributable authorized debt and posts at month end. Card settlements are paired transfers, so purchases count once as expenses. New-loan choices exclude Credit card; saved fixed-term card facilities remain compatible.
- **Accounts:** the main navigation opens account histories; clicking the balance visualization in Configuration also opens this view. It contains daily balances, account selection, period summaries, category breakdowns, operation filters, loans, amortization and deferred spending. The secondary button below the recap balances downloads the selected account history directly; configuration download remains the primary action.
- **JSON files:** strict version-2 configuration import/export and merchant-reference import. Configuration files contain every persona setting, the complete applied reference and its assumptions; they need no subsequent reference upload. Separate version-1 account-history files contain account types, banks, holders, beneficiaries, opening/closing balances and balances before/after every operation, for all accounts or one selected account. History files do not embed simulator settings or reference catalogs. Distinct filenames identify configuration and account-history downloads.

Every valid applied edit regenerates the ledger in a cancellable browser worker. Invalid input preserves the previous result and disables history downloads. Confirming a budget or merchant adjustment immediately updates the configuration and recalculates history. There is no second apply step.

All browser exports include the local export date and time (`YYYY-MM-DD_HH-mm-ss`) before their file extension. Configuration files retain the `.personia.json` extension.

The full working configuration, embedded references and recent Undo/Redo history are restored when reopening the same site in the same browser. Undo and Redo appear on the right of the main navigation and cover configuration edits, confirmed reference changes, imports and model switches. Typing in one field is grouped into an edit; a new edit after Undo clears Redo. Up to 50 recent edits are retained, with older history trimmed if storage space is limited. Unfinished fields are saved as drafts and still require correction before generation. Browser storage is specific to the site and browser, with no cross-device synchronization; JSON exports remain portable backups. Clearing site data removes the local save.

Accounts supports fixed-amount transfers in any direction between current, savings and investment accounts. Choose a date and Once, Weekly, Monthly, Quarterly or Yearly repetition, or monitor an account balance or above-average income/balance. Month-end schedules keep their original day, clamping shorter months. Transfers require enough existing funds by default and respect the destination ceiling. Scheduled instructions can also require a minimum source balance before execution; unmet conditions skip that occurrence, and recurring instructions check again at the next scheduled date. Skipped transfers are recorded in History. Each transfer creates equal debit/credit entries, changes the balance charts and stays outside income and expenses. Rules persist with Undo/Redo and configuration JSON; transaction exports include their rule identifiers. See [Account transfers](specifications/ACCOUNT_TRANSFERS.md) for evaluation order and trigger definitions.

Modes now offer one activation choice: schedule or conditions. Priority, cooldown, transitions and variability are grouped under advanced timing, with optional early-stop conditions separate. Income conditions use one selector with type/expectation filters; new date conditions use the schedule controls. Identical condition entries are merged while distinct upper/lower bounds remain possible. Legacy specialized conditions still load and retain their effect.

In Behaviour or Reference, finish an amount edit with Enter or by leaving the field; release a slider to review its impact. Choose which linked values change and confirm once. Budget changes scale the category's available merchants; merchant edits preserve the other merchants' patterns. “Both” splits the proportional change between the two linked values. Currency rounding can leave a small difference when frequency is held fixed. Removing a budget stops its purchases; the restore selector resets its budget and merchant overrides.

Profile geography and family-status selectors have been removed. Legacy `countryCode`, `region`, `urbanity` and `family` keys are accepted on import for compatibility, removed from exported persona configurations, and ignored in spending calculations. Reference geography remains provenance. The living-cost multiplier scales merchant purchase amounts (including overrides), automatic budgets and recurring habit costs; purchase frequency stays unchanged. Currency precision can cause small rounding differences. Display currency changes labels only: it does not convert values or change the ledger settlement currency, FX assumptions or financial fingerprint.

Income tax uses the user-supplied French-style progressive grid: 0%, 11%, 30%, 41%, 45%, with one-share upper limits of 11,600, 29,579, 84,577 and 181,917. The Reference editor supports adding/removing tax-share rows and rate columns, editing rates and thresholds, and applying a validated grid. One adult counts as one share; two or more adults count as two. The first two children add half a share each and additional children add one each. Missing rows scale thresholds from the nearest available share row. Tax uses annualized configured income, including annual growth, before this simulated tax. It does not model deductions, credits, tax-share caps, actual-income reconciliation or event-driven tax reassessments. The applicable marginal rate and effective rate are shown separately.

Income tax defaults to monthly payments on day 28. Quarterly payments occur in March, June, September and December; yearly payments use a configurable month. Payments reconcile to the annual tax in integer minor units. Other taxes default to yearly, with editable labels, amounts per payment and schedules. These payments debit the current account and participate in balance evolution and the cash reserve. Legacy variable tax purchases are suppressed when the new tax configuration is present, preventing duplicate income-tax modelling.

Credit facilities support Mortgage, Auto loan, Personal loan, Student loan and Credit card. Each has an editable start date, borrowed amount, annual interest rate and duration in months. Monthly payments use the same amortization calculation as the ledger. Defaults are illustrative values in the persona currency. Proceeds credit the current account on the start date; payments start one month later, with month-end dates clamped to the available day. Historical loans carry only their remaining principal into the simulation; opening account balances must already include earlier cash flows. Disabled or future facilities do not post within the current period. Mortgage facilities can replace the existing housing charge from their start date; separate insurance remains. Credit cards use a fixed-term repayment plan without extra purchases or redraws. Exported configurations preserve all facility terms.

**Download reference** includes the applied settings and tax grid in the same `personia.merchant-reference` version-1 format accepted by **Load local reference**. An optional, strictly validated `settings` object stores the consumption profile, living-cost multiplier, base budgets, budget overrides and merchant overrides. Catalog-only files remain supported. Validated imports apply their saved settings directly; the reference snapshot does not contain the persona's identity, income, accounts or history. Original specification files are preserved; the optional settings extension is implemented by the application schema.

## Spending Modes

Configuration → **Modes**, immediately after Events, adds temporary Survival, YOLO, Balanced, Investor and Planner strategies. Each preset exposes its schedule, priority, intensity, category amount/frequency multipliers, substitutions, savings and investment permissions, liquidity target and seeded variability. The original profile and reference remain unchanged. Modes can activate through combined financial, income, spending or calendar conditions; the editor shows the resolved active periods.

Modes use an optional start date and a duration in calendar days, plus monthly/yearly repetition, cooldown and progressive purchase transitions. The browser converts legacy mode end dates into an inclusive duration; changing that duration leaves no hidden end-date cutoff. Higher priority wins; equal priorities use the stable mode ID. Suppressed modes keep their clocks. Financial triggers are evaluated after today's receipts and before spending; spending conditions use activity already posted. Income classification distinguishes salary, bonus, refund and other receipts, expected/unexpected, recurring/exceptional and temporary/persistent changes. One-off income uses the optional start date, or the simulation start if omitted.

Mandatory charges, taxes, existing loan payments and committed events stay payable. Optional purchases must fit the mode's available liquidity and configured debt limits. Savings/investment eligibility and ceilings still apply. Planner reserves stay accessible; Investor allocation follows the baseline risk preference and configured account returns. Balanced uses a soft needs/wants/future allocation, protecting obligations first. Transitions blend purchase behaviour; discrete funding permissions apply while a mode controls behaviour. Already-started trips keep their committed payment schedule. Deferred optional events are recorded for review rather than automatically rescheduled.

Configurations round-trip modes and their triggers. History exports include active periods and per-transaction mode identifiers; the audit records switches and deferred spending. Old configurations with no modes retain their baseline cash flows. These are explicit scenario rules rather than empirical forecasts. See [Spending Modes](specifications/SPENDING_MODES.md) for the model and timing contract.

## Checks and production build

```sh
pnpm check          # typecheck, all automated tests, production build
pnpm format:check   # source formatting
pnpm build
pnpm preview       # serves the compiled application locally
```

`dist/` is a static application including the bundled simulation worker and locally hosted Inter font. It can be served by any ordinary static HTTP host. Sites hosting is configured in `.openai/hosting.json`; the published product is publicly accessible. The local development workflow remains available independently of hosting.

Both balance charts default to comparing all account balances, with consistent colors by account type. A combined total and individual accounts remain selectable. Configuration tab counts show the number of configured accounts, events and modes; resolved mode periods appear below the History balance chart. Configuration JSON preserves all current persona, mode, tax, credit, event and reference settings.

Scheduled events offer Once (the default), Monthly and Yearly repetition. Each occurrence reapplies the event, including its income interruption, loan or ongoing costs. Dates remain anchored to the original date, clamping to the last day of shorter months and recovering February 29 in leap years. The history stops at its configured horizon; a recurring trip may still be active at the end. Overlap and cumulative-change validation covers every occurrence. Exports retain the saved schedule and link generated occurrences to their source event.

## Command-line workflow

```sh
pnpm personai create --model nicolas --name Alex --seed demo --start-date 2025-01-01 --output alex.personia.json
pnpm personai configure --input alex.personia.json --set incomes.0.amount=2500 --output alex.personia.json
pnpm personai validate --input alex.personia.json
pnpm personai generate --input alex.personia.json --output history.json
pnpm personai generate --input alex.personia.json --account checking_nicolas --output checking-history.json
pnpm personai validate-reference --input specifications/country-references/gb.example.v1.json --country GB
pnpm personai convert --input alex.personia.json --reference specifications/country-references/gb.example.v1.json --rate 0.85 --missing inactive --output alex-gb.personia.json
```

CLI creation defaults to André and preserves each model's supplied origin unless `--start-date` is specified. In the browser, André also preserves the supplied calendar; the four original models start twelve calendar months before today's date in the persona timezone. Existing browser workspaces continue to restore their saved configuration. CLI writes validate first and replace the destination atomically. Quotes around complex `--set` values follow your shell's rules.

## Structure and extension points

```text
specifications/       Original specification bundle, unchanged
  SPECIFICATION.md    Product requirements
  contracts/          Interchange contracts and merchant JSON schema
  reference/          Financial and consumption registries
  configurations/     Five complete reproducible persona presets
  examples/           Recorded historical financial fixtures
src/domain/            Shared typed contracts
src/engine/            Pure money, calendar, income, consumption, event and loan calculations
src/config/            Closed validation, canonical SHA-256, file contracts, country preview and draft merge
src/ui/                Reusable controls, editors, charts and generation scheduling
src/simulation.worker.ts
scripts/               CLI and repeatable validation entry point
tests/                 Financial, contract and workflow tests
```

The UI, CLI and tests call the same engine and validators. Add a merchant through a reference file or the reference editor; add a country through a validated local reference. New event or financial rules should be added to the shared contract, validator and engine together, with focused invariant tests. Keep monetary postings in integer minor units and never introduce wall-clock or unseeded randomness into the engine.

This is an independent implementation, tagged **personai.deterministic.v1.4.0**. The specification's old engine version and Nicolas fingerprint are historical fixtures, not this engine's output. The controlled credit/savings fixture remains independently verified. Historical budget/merchant derivations are checked with their geographic factors removed; geographic merchant restrictions no longer apply. Stored rates and calibration coefficients are scenario assumptions, not current financial product quotations or statistically representative national models.

The supplied Vinext server stack was replaced with a small React/Vite static application because the specified product is entirely local and has no server API. The browser worker is bundled by Vite's `?worker` import. The optional `document.modelContext` host bridge is not required for the standalone application and is not enabled.

See [VALIDATION.md](VALIDATION.md) for completed checks and practical limits, and [specifications/SPECIFICATION.md](specifications/SPECIFICATION.md) for the original requirements.
