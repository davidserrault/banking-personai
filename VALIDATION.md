# PersonAI validation

Validated implementation: `personai.deterministic.v2.0.0`.

## Current release — 18 October 2026

The GitHub source snapshot matches published Persona Ledger Studio 2 version 2 (Site source commit `fe63031accfe4e74971721dc1551aee46508fe01`), with updated repository documentation and self-contained migration tests. The current release passes 188 automated tests, TypeScript validation and the production build.

Bridge migration checks cover all 127 subcategories in 15 groups, stable leaf and parent IDs, legacy numeric-ID collisions, reference-hash validation, configuration and reference imports, workspace restoration, all five supplied personas, cost/frequency/budget preservation in a small synthetic legacy scenario, transfers, and reconciled account exports with category metadata.

Navigation checks cover Reference → Merchants / Taxes / Categories and Accounts → Summary / Transactions / Events. They verify exclusive visible panels, linked accessibility semantics, keyboard selection and wrapping, account-scoped summary totals and balances, transaction scope, disabled stale-history downloads, empty states, and removal of duplicate controls, the JSON preview and the technical history footer. Inactive reference editors remain mounted so tax drafts survive subtab changes.

Live browser QA was unavailable for the Bridge migration and subtab changes; these screens have automated component-rendering checks. The browser checks described later in this document were performed on earlier releases and do not establish live browser coverage of the current release.

The archived legacy persona and category-metrics fixture files are excluded from this GitHub distribution. Their nine full-baseline comparisons are replaced by one focused test with small invented merchant inputs; migration import, collision, workspace and all five current-persona export checks remain covered.

## Automated checks

All 188 automated tests pass. TypeScript checking and the production build pass.

André is the default model for a new workspace and retains the complete supplied four-year calendar, references and settings; loading a model returns an independent copy. All five models round-trip their configuration and export identified account histories. André's original scenario produces six EUR 1,000 transfer pairs over four years, starting on 15 October 2026. Source balances exceed the EUR 5,000 threshold at activation, the thirty-day interval is respected, both posting legs conserve money and every closing account balance reconciles. Editor checks cover two-account direction changes, exclusion of the source from destinations, and entering/clearing the optional pre-transfer source minimum. The interval is explicitly described as an activation delay rather than a repeat schedule.

Payment-card checks cover the default debit card and zero overdraft, isolated deferred/credit accounts opening at zero, selected-card routing, direct recurring/tax debits, paired settlements, percentage/fixed repayments and final-payment caps. The default credit rate is 20% annually, charged monthly at annual rate divided by twelve on the balance after due refunds. Calendar checks include weekly/quarterly/yearly repayments, day 31, leap days, the final unpaid statement and insufficient-funds carry-over. Card-specific authorized-overdraft interest is accrued on attributable current-account debt and charged monthly; non-card debt does not accrue these fees. Savings reserves, mode overdraft limits, all four persona ledgers, scoped JSON, configuration round trips, currency conversion and saved Undo history reconcile. Component rendering checks confirm the three card types and removal of credit cards from the new-loan dropdown.

Configuration exports include the complete persona, inflation overrides, applied references and assumptions and round trip through the configuration importer. Account histories use a separate format and filename, omit simulator settings and catalogs, and identify accounts, holders and beneficiaries. Export checks cover all five supplied personas, all-account and single-account scopes, exact per-operation balances, scoped totals, internal-transfer counterparties and empty accounts. Download checks use real JSON Blobs to verify parseable, indented UTF-8 content, distinct filenames with a local date/time suffix, preserved JSON/configuration extensions, anchor activation and object-URL cleanup.

Inflation settings are available in Configuration → Profile → Location & spending context. The default is 0% yearly. The selected rate compounds once per completed monthly or yearly anniversary of the simulation start date; there is no increase on the initial date. Advanced controls override the rate and period for each configured charge and budget, including a custom 0% exemption. Turning a custom rate off restores inheritance. Charge overrides are removed when their charge is deleted.

Inflation scales budget envelopes and purchase prices together, preserving baseline purchase frequency. It also updates recurring charges, habitual purchases and the reserve used before savings transfers. Explicit rent changes establish a new base price. Event-created recurring charges start compounding from their first scheduled payment. Income growth, tax payments and contractual loan repayments retain their own settings. Existing scenarios with no inflation setting retain their ledger amounts.

The six inflation tests cover monthly/yearly compounding, exact daily balance reconciliation, mixed overrides and exemptions, month-end and leap-year boundaries, budget/purchase-price effects, rent changes, configuration export/import and invalid settings. An isolated EUR 1,000 monthly charge at 10% yearly produces EUR 1,200 more spending over two years and exactly EUR 1,200 less closing cash. Comparisons of all four supplied personas over three years with 3% yearly inflation increase expenses and reduce net assets. Current-account closing balances can rise slightly when existing savings rules retain more cash instead of moving it into savings.

- Fixed inputs reproduce identical ledgers; generation does not mutate inputs. Customer labels do not change the financial fingerprint.
- Integer minor-unit postings reconcile account balances and daily balances. Monthly totals reconcile with posted operations.
- All four supplied personas preserve their non-geographic budget/merchant derivations. Historical geographic factors are removed and the expanded merchant selection reconciles to category budgets.
- Income recurrence, calendar boundaries, seasonality, independent random streams and long horizons are covered.
- Savings priorities, ceilings, leap-year interest, fortnightly interest and year-end crediting are covered.
- The controlled loan fixture verifies capital, instalments, insurance and remaining principal.
- All five credit facility defaults amortize exactly. Tests cover zero-rate payments, month-end dates, loans predating the history, first-day payments, disabled/future facilities, no recursive refinancing, mortgage charge replacement, currency conversion and configuration round trips.
- The global Bank fees module, intervention-fee queues and related pending-fee audit entries have been removed. Legacy bankFees settings remain ignored. Current card overdraft rates belong to each payment card and default to zero. Regression checks cover repeated non-card overdraft operations, quarter ends, leap years, end-of-history operations, exact savings sweeps and identical ledgers/fingerprints with legacy bankFees enabled, disabled or absent. Legacy configuration imports, exports, currency previews and saved Undo history remain compatible.
- Event budgets, foreign-currency amounts, rounding allocation and one-time currency conversion are covered.
- Configuration and reference validation rejects unsafe keys, unsupported fields, invalid dates and invalid numeric values.
- Complete configuration round trips, embedded reference hashes, scoped ledger exports and stale-result rejection are covered.
- Country conversion previews, missing categories and staged-reference merging are covered.
- Linked budget, average purchase and monthly-frequency adjustments cover all three impact choices, zero budgets, restarting purchases, unavailable merchants and unchanged neighbouring merchants.
- Tax tests cover household shares, progressive calculations, scaled rows, monthly/quarterly/yearly payments, calendar clamping, exact cent allocation, custom grids, other taxes and disabled schedules.
- Living-cost adjustments include merchant overrides; changing display currency or location text leaves generated cash flows unchanged. Legacy geographic and family-status fields no longer affect the engine and are removed from exports.
- Adding/removing merchants preserves other purchase patterns; reference-setting downloads round trip through the uploader, while legacy catalogs remain compatible.
- Local workspace tests cover complete persona/reference restoration, deterministic regeneration, persisted Undo/Redo, grouped typing, branching edits, added/removed fields and array entries, incomplete drafts, corrupt saved data, unsafe edit paths, history limits and storage-quota fallback. Strict configuration-file validation is unchanged.
- Transfer tests cover all account directions, conserved assets and paired integer postings, month-end/leap-day/weekly/quarterly schedules, horizon and stop-date boundaries, disabled rules, insufficient funds and ceilings, custom source minimums with inclusive thresholds and resumption on later eligible dates, sequential funding checks, crossing/cooldown behavior, negative balance averages, income-day activation and zero-income months, simultaneous condition snapshots, mode interaction, validation, currency conversion, configuration/history exports and local Undo/Redo. Simplified mode conditions retain distinct bounds and legacy income behavior while merging duplicates.

Spending Modes checks cover unchanged no-mode ledgers, immutable baseline inputs, deterministic results, priorities, inclusive dates, duration, yearly cross-year recurrence, monthly cooldown, transitions, financial/temporal trigger combinations, explicit income classification, one-off bonuses, absent/decreased income, compulsory payments, optional overdraft limits, savings eligibility, persistent investment withdrawals, balanced allocations, investment/liquid-reserve routing, committed trips, import/export and invalid configuration rejection. A twenty-year recurring-mode scenario reconciles all accounts and both sides of every internal transfer.

The Modes interface was checked by adding a preset, editing its duration, observing immediate recalculation and the resolved timeline, then activating it on each first day of the month. The timeline showed the expected ten-day periods. No browser console errors appeared during these checks. The new tab follows Events. Configuration navigation now counts configured accounts, events and modes, including disabled entries. The resolved modes timeline appears only in History, immediately below its balance graph.

The CLI was also exercised to validate and generate a complete Nicolas history. The test modules share the same engine and validators as the interface.

## Interface checks

The development and compiled applications were opened in the browser. Automatic worker generation, validation feedback, disabled exports for invalid input, preserved previous results, single-confirmation reference/budget edits, the seasonal explorer, and reference import validation were checked. A 390-pixel viewport had no horizontal page overflow. Formatting checks pass. The updated compiled application was checked for consolidated Profile data context, Reference navigation, Behaviour budget rows and impact choices, immediate confirmed application, the recalculation loader, personal-loan defaults, live instalment recalculation and loan/debt results in History.

File import and conversion behavior are covered by automated tests. Full operating-system file-picker interaction and downloaded-file handling have not been exhaustively tested across browsers. No formal accessibility certification or multi-browser certification is claimed.

The default balance view plots each account independently, with current-account, savings and investment colors shared between Configuration and History. Browser checks cover the combined total and single-account views, live tab counts after adding entries, and the relocated modes timeline. Export regression checks include all five modes and their schedules/rules/triggers, classified income, facilities, events, tax schedules, a custom tax grid, merchant overrides, budgets and display context; regenerating the imported file yields an identical history. Both old risk-preference return orderings yield identical ledgers with the selector removed.

Event scheduling checks cover anchored month-end and leap-day dates, once/disabled compatibility, per-occurrence reconciliation, repeated income interruptions, independent trip budgets, partial final trips, overlap validation, cumulative household/price changes, collision-free occurrence identifiers, separate mortgages/ongoing costs and configuration/history export. Legacy mode end dates migrate to an inclusive duration, and increasing the duration is not cut short by the removed field. Browser checks confirmed twelve monthly event occurrences, the Yearly option and a twelve-day mode in the resolved history; there is exactly one mode-duration field and no optional mode end-date control.

The latest interface checks cover independent Accounts and Charges tabs, personal-loan creation and live instalment recalculation, recurring-charge edits, quarterly income-tax scheduling, other taxes, and removal of the Habits editor from Behaviour. Reloading restores persona and charge edits, an added tax and both sides of Undo/Redo history. An unfinished numeric field also survives reload and can be undone. The main navigation has no numeric badges; Undo/Redo appear on its right, while Accounts, Events and Modes retain their secondary-navigation counts. No browser console errors appeared during these checks.

Browser checks for account transfers confirmed four quarterly transfers with matching debit/credit rows, all schedule options, account-to-account selection, above-average balance settings and persistence after reload. Modes checks confirmed one enable control, the schedule/condition choice, consolidated income filters and multiple-condition editing. No browser console errors appeared.

Scheduled-transfer condition checks confirmed the default full-funding option, zero postings with a high custom source minimum, and four paired quarterly transfers after lowering that minimum. The custom threshold survives reload and Undo/Redo restores both tested values. No browser console errors appeared.

## Original specification bundle

The 58 original files were moved into `specifications/`. A before/after SHA-256 comparison confirmed that their contents were preserved. The original historical financial fixtures remain intact.

## Practical boundaries

- This is an independently versioned deterministic engine. It does not claim to reproduce the historical engine's Nicolas fingerprint or transaction count.
- Financial rates, calibration and merchant distributions are scenario assumptions supplied with the project; they are not live product data or a statistical guarantee of population representativeness.
- Configuration, references and recent edit history persist in local browser storage for the same site. Clearing that site's data removes the save; browsers and devices do not synchronize. JSON exports provide portable backups. If storage is unavailable, the interface reports the saving failure and the session remains editable.
- A static React/Vite build provides the standalone application. The optional host `document.modelContext` bridge is not enabled.
- The production bundler reports a large chart/application chunk warning. The build succeeds; generation is isolated in a worker. Very large horizons can still consume significant browser memory.

The latest browser checks verified removal of country/region/settlement/family-status controls, display-currency labels, doubled merchant amounts from a cost multiplier of 2, the 3-share/60,000-income tax calculation (2,772 annually), adding a tax-share row and rate column, quarterly income tax, and yearly property-tax ledger entries. No browser console errors appeared in these checks.
