# Account transfers

Implemented in engine `personai.deterministic.v1.5.0`. The optional `configuration.accountTransfers` array contains up to 100 fixed-amount instructions. Existing configurations without this array keep their baseline cash flows.

## Scheduling

Each instruction stores its identifier, label, enabled state, source and destination account keys, amount, start date, optional inclusive stop date, timing and recurrence. Every account type can send to every other account type. A source and destination must be distinct and still exist. Removing a referenced account requires fixing or removing the instruction before generation resumes.

Scheduled repetition is once, weekly, monthly, quarterly or yearly. Weekly intervals are seven calendar days from the start. Other intervals retain the original day, clamped to the target month's last day; February 29 returns in leap years. Dates before the simulation are not posted retroactively. Weekends are retained for internal transfers.

The default execution condition requires enough available funds for the full amount. Scheduled instructions can additionally set `minimumSourceBalance`, a nonnegative monetary threshold checked against the source's balance immediately before execution. A balance equal to the threshold qualifies; the threshold does not specify the balance remaining afterwards. The full-funding rule always applies, even when the custom threshold is lower than the transfer amount. This optional condition is ignored for triggered instructions. If a condition fails, that occurrence is skipped; recurring instructions check again on their next scheduled date. A skipped one-time instruction is not postponed automatically.

The editor shows the optional minimum as one numeric field. An empty value removes the extra condition; a separate full-funding selector is unnecessary because full funding is always required. The destination list excludes the source. Selecting the current destination as the new source swaps the two ends, keeping a two-account instruction valid.

## Financial conditions

Triggered instructions specify a condition, monitored account, threshold and minimum days between attempts (1–7300):

- Balance below or above a monetary threshold: strict comparison on the selected account.
- Balance above average: compare the current balance with the mean of up to 30 previous daily closing balances, excluding today. The initial fallback is that account's opening balance. A percentage X means `balance > average + abs(average) × X / 100`, including when the average is negative.
- Monthly income above average: compare month-to-date configured income and inheritance receipts with up to three fully observed previous calendar months, including zero-income months. The first partial simulation month is excluded. Before any complete month exists, the configured monthly recurring-income equivalent is used. The condition means `monthly income > average × (1 + X / 100)` and can fire only on a positive income day. Transfers, borrowing, interest and support top-ups do not count as income for this trigger.

A condition fires once when it becomes true, including the first monitored day if already true. It must become false to rearm. A rearmed condition still waits for the minimum interval; if it remains true it can attempt when the interval expires. A skipped attempt also consumes that activation. Stop/start dates bound monitoring. Scheduled recurrence is ignored for triggered instructions.

The minimum interval is labeled as days between condition activations: it is not a repeat schedule while the condition remains true. For recurring balance-conditioned transfers, choose scheduled timing, the desired repetition and an optional minimum source balance. Average-calculation guidance appears only for an average-based trigger.

## Posting order and funding

Daily income and inheritance post first, then Spending Modes resolve, then configured transfers run before charges and purchases. Financial activation triggers use the same pre-transfer snapshot. Due instructions execute in configuration list order; available funds, source minimums and destination ceilings are checked immediately before each execution, including changes from earlier instructions. Earlier instructions cannot cause an extra same-day activation-trigger evaluation. No future data is consulted.

Transfers are explicit instructions, independent of Spending Mode withdrawal/deposit preferences and automatic savings priorities. They can use an account whose automatic priority is zero. Automatic savings and later expense funding can still move funds separately. Transfers never arrange new debt or overdraw the sending account; any checking-account reservations remain protected. The receiving account's configured ceiling applies. If the full amount cannot move, nothing posts and `transfer-skipped` is recorded in the audit with its rule identifier and reason. Missed scheduled transfers are not retried automatically.

Each successful instruction creates two postings with identical `transferId` and `transferRuleId`, opposite integer minor-unit amounts and no change in aggregate assets at posting time. Interest accrual observes the resulting account balances. History and exports retain both sides; account-scoped exports retain the selected side. Transfer labels are excluded from the financial fingerprint, while financial settings participate. Currency conversion scales amounts and absolute thresholds while preserving percentage thresholds.

## Persistence

Instructions, including optional source minimums, are included automatically in complete configuration JSON, browser local storage and Undo/Redo. Currency conversion also scales source minimums. Existing version-2 files remain supported; absent minimums retain the default full-funding condition. Both the interface and CLI use the same schema, validation and deterministic engine.
