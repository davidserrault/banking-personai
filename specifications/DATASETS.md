# Dataset index — specification revision 2

Target examples and reference financial fixtures have distinct roles. Target version-2 files require the corresponding importer implementation.

| File | Role |
|---|---|
| [ARTIFACT-CHECKS.json](ARTIFACT-CHECKS.json) | Revision-2 artifact verification |
| [DEFAULTS-CHECK.json](DEFAULTS-CHECK.json) | Revision-2 artifact verification |
| [configurations/lea.personia.json](configurations/lea.personia.json) | Target version-2 complete persona example; requires target importer |
| [configurations/michel.personia.json](configurations/michel.personia.json) | Target version-2 complete persona example; requires target importer |
| [configurations/nicolas.personia.json](configurations/nicolas.personia.json) | Target version-2 complete persona example; requires target importer |
| [configurations/sarah.personia.json](configurations/sarah.personia.json) | Target version-2 complete persona example; requires target importer |
| [contracts/local-merchant-reference.schema.json](contracts/local-merchant-reference.schema.json) | Target exchange contract/schema |
| [country-references/fr.merchants.v1.json](country-references/fr.merchants.v1.json) | Local merchant-reference example; France baseline or explicitly fictional UK illustration |
| [country-references/gb.example.v1.json](country-references/gb.example.v1.json) | Local merchant-reference example; France baseline or explicitly fictional UK illustration |
| [derived/lea-reference.json](derived/lea-reference.json) | Reference French financial derivation fixture |
| [derived/michel-reference.json](derived/michel-reference.json) | Reference French financial derivation fixture |
| [derived/nicolas-reference.json](derived/nicolas-reference.json) | Reference French financial derivation fixture |
| [derived/sarah-reference.json](derived/sarah-reference.json) | Reference French financial derivation fixture |
| [design/dark-theme.json](design/dark-theme.json) | Target dark visual tokens |
| [examples/credit-savings-fixture-history.json](examples/credit-savings-fixture-history.json) | Reference financial calculation fixture; not the target interface/import contract |
| [examples/credit-savings-fixture.personia.json](examples/credit-savings-fixture.personia.json) | Reference financial calculation fixture; not the target interface/import contract |
| [examples/nicolas-checking-history.json](examples/nicolas-checking-history.json) | Reference financial calculation fixture; not the target interface/import contract |
| [examples/nicolas-history.json](examples/nicolas-history.json) | Reference financial calculation fixture; not the target interface/import contract |
| [i18n/en-GB.json](i18n/en-GB.json) | English system interface vocabulary |
| [models/lea.json](models/lea.json) | Target French persona configuration; financial defaults retained |
| [models/michel.json](models/michel.json) | Target French persona configuration; financial defaults retained |
| [models/nicolas.json](models/nicolas.json) | Target French persona configuration; financial defaults retained |
| [models/sarah.json](models/sarah.json) | Target French persona configuration; financial defaults retained |
| [reference/bank-fees-defaults.json](reference/bank-fees-defaults.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/banking-sources.json](reference/banking-sources.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/calibration-statistics.json](reference/calibration-statistics.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/categories.json](reference/categories.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/consumption-profiles.json](reference/consumption-profiles.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/consumption-sources.json](reference/consumption-sources.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/durable-change-types.json](reference/durable-change-types.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/event-templates.json](reference/event-templates.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/event-types.json](reference/event-types.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/field-options.json](reference/field-options.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/financing-defaults.json](reference/financing-defaults.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/habit-types.json](reference/habit-types.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/income-frequencies.json](reference/income-frequencies.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/merchant-segments.json](reference/merchant-segments.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/merchants.json](reference/merchants.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/observed-budget-shares.json](reference/observed-budget-shares.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/regions.json](reference/regions.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/runtime-versions.json](reference/runtime-versions.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/savings-products.json](reference/savings-products.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/seasonality-applied-default.json](reference/seasonality-applied-default.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/seasonality-category-mapping.json](reference/seasonality-category-mapping.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/seasonality-combined.json](reference/seasonality-combined.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/seasonality-observations.json](reference/seasonality-observations.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/seasonality-source.json](reference/seasonality-source.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/transaction-system-categories.json](reference/transaction-system-categories.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/travel-destinations.json](reference/travel-destinations.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [reference/travel-merchants.json](reference/travel-merchants.json) | Financial/reference dataset; France scope unless travel destination is specified |
| [verification.json](verification.json) | Recorded reference financial checks |

## Units and scope

- English interface text is independent of French persona data.
- The default country reference prices merchants in EUR; the illustrative UK file uses GBP.
- Rates and variations are percentages. Monetary amounts use the declared currency precision.
- Domestic category keys are shared across countries; original merchant names remain data.
- France coefficients and seasonal sources are attributed to France. They are not automatically local calibration elsewhere.
- Source seasonal observation arrays run September to August; combined arrays run January to December.
- Configuration examples embed local-reference content and its canonical SHA-256 hash.
- Reference histories record financial fixture results; use models/ and configurations/ for the target contract.
- The UK file contains fictional merchants and assumptions only.

## Verification

See [TEST-REPORT.md](TEST-REPORT.md), [ARTIFACT-CHECKS.json](ARTIFACT-CHECKS.json) and [DEFAULTS-CHECK.json](DEFAULTS-CHECK.json). All packaging hashes are listed in SHA256SUMS.txt.
