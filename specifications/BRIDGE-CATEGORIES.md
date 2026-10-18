# Bridge transaction categories

Persona Ledger Studio 2 uses the English category tree from [Bridge](https://www.bridgeapi.io/) and its [transaction-category documentation](https://docs.bridgeapi.io/docs/transactions-categories), retrieved on 18 October 2026. The published tree and the supplied list contain **127 subcategories in 15 main categories**, although the documentation introduction states 126. This implementation retains every listed entry.

`reference/categories.json` is the single current leaf registry; `reference/category-groups.json` defines its parents. Each leaf has its original Bridge numeric ID, an application key, the exact English label and a parent ID. Repeated labels such as Rent, Pension, Salaries, Savings and Internal transfer remain separate records. Parent IDs are never valid leaf IDs. The `budgetable` and `protected` attributes are explicit simulator assumptions, not Bridge classifications. This application uses the taxonomy and does not call Bridge's categorization API.

## Behaviour

- Charges, income streams, exceptional events, other taxes, merchants, budgets, inflation overrides, temporary spending modes and seasonal mappings use the same registry.
- Category selectors group subcategories under their main category. Incomes select income leaves; recurring charges select expense leaves. Purchase budgets and merchant catalogs exclude income, internal-transfer and loan/settlement categories.
- Budget rows are grouped by main category. Existing nonzero budgets appear by default; Show all spending subcategories exposes the other available purchase categories. A positive purchase budget needs an eligible merchant, which can be added in Reference.
- Reference includes a searchable, complete category tree and links to Bridge. History filters by either a main category or a leaf; expense charts switch between the two levels. Operation kind remains independent of category, so a transfer never counts as income or spending because of its category name.
- New account histories include each transaction's leaf ID, key and label, parent ID and label, plus a used-category directory and taxonomy metadata. Account identities, counterparties and all balances remain available.

## Generated banking operations

| Operation | Bridge leaf |
| --- | --- |
| Configured income | Chosen Incomes leaf |
| Salary | 230 · Salaries |
| Student grant | 441893 · Grants |
| Retirement pension | 279 · Retirement |
| Savings interest | 80 · Interest incomes |
| Loan proceeds | 441894 · Loans |
| Loan repayment | 89 · Mortgage refund (Bridge's English label for the repayment category) |
| Student loan repayment | 259 · Student loan |
| Loan insurance | 278 · Insurance |
| Credit card / authorized overdraft interest | 79 · Banking fees and charges |
| Income tax | 208 · Incomes taxes |
| Other taxes | Chosen Taxes leaf, default 302 · Taxes |
| Internal transfer debit / credit | 326 / 282 · Internal transfer |
| Deferred card settlement debit | 191 · Monthly Debit |
| Property / vehicle acquisition | 220 · Home - Others / 84 · Auto & Transport - Others |
| New childcare costs | 267 · Baby-sitter & Daycare |

## Migration

Every new configuration and merchant reference carries `categorySystem: "bridge"`. This marker is necessary because several legacy IDs have different meanings in Bridge: legacy coffee 79 becomes 313, while Bridge 79 means banking fees. The strict configuration importer validates structure and the original reference hash before migrating an unmarked legacy file, then validates the migrated scenario and computes its new reference hash. Invalid or unknown fields remain rejected.

Legacy merchants are mapped to specific leaves, including pharmacies, tolls, public transport, clothing, books, sporting goods and train tickets. Existing purchase means and frequencies are retained as explicit overrides. Envelopes split by their merchant purchase patterns and conserve the total within currency rounding. Inflation overrides, event price changes, mode rules, reference settings and seasonality mappings are translated too. When legacy categories merge into one leaf, one seasonal proxy is retained; unobserved categories keep neutral seasonality. These are modeling proxies and do not constitute new empirical observations.

André, Nicolas, Léa, Sarah and Michel retain their authored monetary inputs, dates, card settings and transfer instructions. Their histories can change because purchases are sampled by the new category grouping. André stays the first-visit default. Restoring a legacy workspace retains its latest edits and starts a fresh undo history, preventing old category patches from replaying against new keys. Re-importing a migrated configuration is idempotent.

The legacy registry and import-only consumption adapter are isolated from current generation. Self-contained migration tests use small invented merchant inputs to verify costs, frequencies and total budgets. Archived full-persona and category-metrics fixtures are excluded from this GitHub distribution. Archived derivations and original recorded history fixtures are retained as historical test data.
