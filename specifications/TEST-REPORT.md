# Verification report — specification revision 2

This report separates reference financial evidence from target requirements.

## Reference financial evidence

The recorded implementation revision is 5a94fd4a62aad9623c2fa92f52d3277e771c50f2. Its existing automated financial tests passed in the preceding handoff. verification.json records deterministic generation and exact ledger/transfer reconciliation for the reference fixtures.

Those results support financial modeling rules. They do not certify the target country loader, English interface, dark theme or version-2 configuration importer.

## Revision-2 artifact checks

- The four target French models preserve the previous models' numeric financial settings, seed, household, rates, priorities, charge schedule and income schedule.
- Two local reference examples are checked against the schema's structural constraints and semantic category/region/precision rules.
- Negative checks reject wrong-country files, unknown categories, duplicate merchant IDs, unknown fields and invalid amounts.
- Target configuration country/currency/reference fields and embedded reference hashes are consistent.
- English message keys cover the shipped category, profile and segment registries.
- Dark text, primary-action and essential-control color combinations are checked numerically.
- All JSON files, local document links and packaging hashes are checked.

DEFAULTS-CHECK.json records the initial financial comparison. ARTIFACT-CHECKS.json records the current artifact-validation results.

## Runtime acceptance still required

Implement and exercise the English UI, country/currency/reference preview and import, configuration version 2, supported currency precision, source scoping and dark-state styling. Validate all states visually and with keyboard navigation; test full save/load round trips and actual histories after country changes.

No production deployment or browser UI modification was performed as part of this specification revision.
