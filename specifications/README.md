# Person’IA — Developer specification, revision 2

The target application uses an **English interface and dark visual design**. The default persona remains **Nicolas in France**, with the existing French financial assumptions.

Read [SPECIFICATION.md](SPECIFICATION.md) for screens, behavior, country setup, financial rules, data contracts and acceptance criteria.

## Main deliverables

- [Specification](SPECIFICATION.md)
- [Dataset index](DATASETS.md)
- [Target contracts](contracts/DATA-CONTRACTS.md)
- [Local-reference schema](contracts/local-merchant-reference.schema.json)
- [France merchant reference](country-references/fr.merchants.v1.json)
- [Illustrative UK reference](country-references/gb.example.v1.json)
- [English interface messages](i18n/en-GB.json)
- [Dark design tokens](design/dark-theme.json)
- [Verification report](TEST-REPORT.md)

## Country and language

France, EUR and Europe/Paris are selected by default. Interface text and formatting use en-GB independently of the persona data locale. Proper names, brands and source titles remain authentic.

A user can choose another country and load a matching local merchant JSON file. Country/currency/reference changes are previewed and applied atomically. Currency conversion requires an explicit fixed rate and preserves financial assumptions as reviewed scenario settings. A local merchant file does not establish local banking law or statistical representativeness.

The UK sample contains fictional merchants and illustrative amounts only. It demonstrates the import contract.

## Persona datasets

The four raw target models are in models/. Full version-2 examples with embedded France references are:

- [Nicolas](configurations/nicolas.personia.json)
- [Léa](configurations/lea.personia.json)
- [Sarah](configurations/sarah.personia.json)
- [Michel](configurations/michel.personia.json)

These are **target implementation examples**, not a claim that the currently deployed importer accepts version 2. The date window is frozen at 2025-09-15 through 2026-09-14; a new session calculates its default window from the persona timezone.

The reference/ and derived/ folders retain the financial reference data. Files under examples/ and verification.json record baseline financial calculations and are identified as fixtures. They are not the target import contract.

## Implementation status

This is a specification and artifact update. No application code or production site has been changed. The English interface, country workflow and dark theme require implementation and the acceptance checks defined in the specification.

## Integrity and checks

manifest.json identifies artifact roles and hashes. SHA256SUMS.txt covers the complete package. DEFAULTS-CHECK.json records preservation of the French models' financial settings. The optional tools/validate-artifacts.py checks the delivered references, configuration consistency, message/category coverage and visual-token contrast without modifying the application.
