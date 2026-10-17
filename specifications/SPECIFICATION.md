# Person’IA — Developer Specification

**Specification revision:** 2  
**Interface and documentation language:** English (en-GB)  
**Default persona country:** France (FR)  
**Default persona data locale / currency / timezone:** fr-FR / EUR / Europe/Paris  
**Visual theme:** Dark background, white content  
**Reference implementation revision:** `5a94fd4a62aad9623c2fa92f52d3277e771c50f2`  
**Specification date:** 15 September 2026

This document defines the target application requirements. The supplied French datasets preserve the financial assumptions of the reference implementation. Country selection, local merchant-reference loading, English interface text and the dark design described here are requirements for implementation; this documentation update does not change the running application.

The interface language is independent of the persona country. French names, merchant brands, product names and source titles remain authentic data. All system-owned labels, actions, guidance, errors, charts and accessibility text are displayed in English. A new workspace selects André and the France reference; an existing workspace restores its saved scenario.

The handoff contains the detailed specification, reference datasets, target import contracts and illustrative files, alongside clearly identified financial test fixtures. Rates and statistical coefficients describe stored scenario assumptions; they are not live financial product quotations.

## Contents

1. [Product purpose and scope](#1-product-purpose-and-scope)
2. [Feature inventory and user journeys](#2-feature-inventory-and-user-journeys)
3. [Navigation, layout and shared behavior](#3-navigation-layout-and-shared-behavior)
4. [Configuration screens](#4-configuration-screens)
5. [Reference screen](#5-reference-screen)
6. [History screen](#6-history-screen)
7. [Simulation rules and financial calculations](#7-simulation-rules-and-financial-calculations)
8. [Data contracts and file formats](#8-data-contracts-and-file-formats)
9. [Reference data and source provenance](#9-reference-data-and-source-provenance)
10. [Architecture and developer integration](#10-architecture-and-developer-integration)
11. [Validation and acceptance criteria](#11-validation-and-acceptance-criteria)
12. [Modeling boundaries](#12-modeling-boundaries)

## 1. Product purpose and scope

Person’IA generates fictional but plausible banking histories for a selected persona country from a configurable persona, a deterministic seed, a simulation horizon and editable consumption assumptions. Users can observe how life events, income, spending, borrowing and savings affect account balances over time.

The application is a scenario authoring tool. It does not connect to real accounts, execute banking operations or make lending decisions. The engine uses seeded algorithms; it does not call a generative AI model to invent transactions. The same engine version, financial configuration and complete reference content produce the same financial history. Interface locale changes presentation only; it is excluded from the financial fingerprint.

The unit of work is one persona scenario with exactly one current account and optional savings/investment accounts. Each persona uses one settlement currency across its bank accounts, defaulting to EUR for France. A local merchant reference declares its country and pricing currency. Foreign purchases retain original-currency amounts and conversion metadata alongside the settlement-currency debit. Country and currency transitions require an explicit, validated preview before application.

The simulation covers one to twenty whole years from a chosen start date. The initial UI selects André's supplied four-year scenario, **15 October 2026 through 14 October 2030 inclusive**, preserving its related dates and complete configuration. The four original models retain their rolling origin twelve calendar months before the current date in the persona timezone. The same simulation rules apply to every day in the selected period.

Configuration, references and recent Undo/Redo history persist locally in the same browser. Reloading restores that workspace; a browser without a saved workspace starts with André. Configuration and account histories can also be saved as separate JSON files. The application has no server-side scenario database.

## 2. Feature inventory and user journeys

### 2.1 Functional inventory

| ID | Capability | Result |
|---|---|---|
| F01 | Select a persona model | Loads André (default), Nicolas, Léa, Sarah or Michel with the corresponding complete configuration. |
| F02 | Edit identity and household | Updates scenario metadata and applicable household, age and location factors. |
| F03 | Manage multiple incomes | Adds, removes, enables and schedules income sources with amount/date variation and annual growth. |
| F04 | Manage accounts | Configures opening balances, product types, rates and deposit ceilings. |
| F05 | Manage fixed charges | Adds, removes or disables recurring monthly debits and changes their payment days. |
| F06 | Configure financial behavior | Sets discretionary spending, savings behavior, cash buffer, overdraft and optional support. |
| F07 | Order savings priorities | Separately orders eligible accounts for withdrawals and deposits. |
| F08 | Apply seasonality | Modulates transaction frequency using weighted monthly observations; optional basket variation is an explicit assumption. |
| F09 | Configure habitual events | Enables school, household, gifts, birthdays and occasional travel patterns. |
| F10 | Schedule life events | Adds dated trips, inheritance, income gaps, large purchases and persistent changes. |
| F11 | Configure borrowing | Defines automatic consumer/card borrowing and event-specific mortgage financing. |
| F12 | Accrue savings income | Posts annual savings interest. |
| F13 | Edit the reference | Changes envelopes, profile-specific merchant means/frequencies and scenario merchants. |
| F14 | Apply reference changes | Explicitly commits a staged reference to the configuration and recalculates the history. |
| F15 | Recalculate automatically | Runs a cancellable browser worker after valid applied configuration changes. |
| F16 | Inspect balances | Displays aggregate or account-level curves, negative balances, today and event markers. |
| F17 | Analyze category shares | Shows income/expense donuts for a month, year or the full period. |
| F18 | Search operations | Filters the selected account's operations by text, category and inclusive date range. |
| F19 | Export histories | Saves all-account or single-account transaction JSON, independently of table filters. |
| F20 | Save/load configuration | Round-trips all configuration values and the merchant catalog through a self-contained JSON file. |
| F21 | Inspect event and loan results | Shows borrowing, outstanding principal, interest, insurance and amortization schedules. |
| F22 | Explain invalid input | Shows red English error messages and highlights affected fields; preserves the preceding result while correction is needed. |
| F23 | Select persona country | Defaults to France; changing country opens a staged local-reference setup. |
| F24 | Load a local merchant reference | Validates a country-specific JSON file, previews its effect and replaces the applied domestic catalog atomically. |
| F25 | Separate language from country | Keeps the whole interface in English while country, regional assumptions, currency and merchant data change. |

### 2.2 Main journeys

**Create a scenario:** open Configuration → choose a model → edit profile, accounts, behavior and events → set the horizon → inspect and click the recap curve to open History → download one or all account statements. The recap also offers a direct history download for its selected account scope.

**Tune the consumption reference:** open Reference → change envelopes or merchant settings → inspect the draft donut → click **“Update configuration”** → wait for recalculation → compare the updated history. Until application, exports and the simulation use the previous reference.

**Explore a purchase financed by savings and credit:** add a purchase → enter date, price and associated costs → enable permitted borrowing if needed → verify the savings transfer, loan drawdown, purchase debit and later repayments → inspect closing assets and outstanding debt separately.

**Share a reproducible persona:** download the configuration from the persona recap → transfer the JSON → load it using the header button → verify the resulting fingerprint and history. A history JSON is not accepted by the configuration importer.

## 3. Navigation, layout and shared behavior

### 3.1 Application shell

There is one application page, at `/`. Internal tabs are client-side state, not separate page URLs.

The header contains, from left to right:

- The textual **Person’IA** brand.
- The **“Persona model”** selector. André is preselected for a new workspace. Options are “André”, “Nicolas · Family”, “Léa · Student”, “Sarah · Professional” and “Michel · Retired”. Each option identifies France as its country.
- **“Load configuration”**, which opens a JSON file picker. A spinner and disabled button indicate import processing. An imported unknown model ID is displayed as “Imported configuration”.
- A **“Synthetic data”** badge.

The primary tabs are ordered **Configuration → Reference → Accounts**. Accounts opens the account-history view. A visually hidden page heading remains for assistive technology. A footer identifies the synthetic-data workshop and the active country, settlement currency and reference version.

Selecting a model loads its complete configuration and compatible merchant reference, clears pending edits and opens Configuration. The built-in models load France and its reference. André retains its authored start date and four-year horizon; the original models use the rolling start date in their timezone. Model selection replaces the scenario and is included in Undo/Redo.

### 3.2 Visual language — dark interface

Use Inter throughout, a near-black canvas and white primary content. Panels, forms, menus, tooltips, upload previews and charts all use the same dark system. The persona recap is a slightly elevated dark surface consistent with the rest of the page.

| Token | Value | Use |
|---|---|---|
| canvas | #0B0B0C | Page and chart background |
| surface | #151518 | Cards, forms and recap |
| surface-raised | #202024 | Menus, tooltips and dialogs |
| content-primary | #FFFFFF | Main labels, headings and chart line |
| content-secondary | #C4C4CC | Explanations and secondary values |
| content-muted | #A1A1AA | Supporting metadata |
| border | #3F3F46 | Dividers and decorative panel borders |
| control-border | #71717A | Input outlines and interactive boundaries |
| focus | #FFFFFF | Keyboard focus outline |
| error / negative | #FF8585 | Errors, negative values and curve segments |
| overdraft | #F5C36A | Dashed authorized-overdraft marker |
| action-fill | #FFFFFF | Primary action background |
| action-content | #0B0B0C | Text and icons within primary actions |

Primary buttons use white fills and dark text. Secondary actions use dark fills or transparent backgrounds with white text and visible outlines. Hover and selected states use elevated surfaces or stronger borders. Disabled actions remain legible and are identified by both state and styling.

Balance curves are white above zero and red below zero. Today and event markers use white/gray lines with labels. Gridlines are restrained gray. Donuts use distinct white-to-gray slices, dark separators and matching labeled legends; amounts and percentages are available without relying on color. Tooltip backgrounds are dark and their text white.

Aim for WCAG AA contrast: 4.5:1 for normal text, 3:1 for large text and essential graphical/control boundaries. Verify computed contrast for actual adjacent surfaces and states. Preserve visible keyboard focus and text descriptions for errors and chart events.

The workspace has a maximum width of approximately 1,440 px. Desktop Configuration uses a main editing column and a roughly 350 px sticky recap column. At intermediate widths the recap narrows; on mobile the layout stacks. The envelope donut moves above its input list at widths up to 760 px, and the History donuts stack on small screens. Typography, spacing and restrained corners support a compact, minimal layout.

### 3.3 Live generation and result freshness

Applied configuration changes trigger recalculation automatically.

- Initial calculation starts without debounce.
- Subsequent changes wait **250 ms** before validation and worker creation.
- A new change cancels the preceding timer/worker.
- Late replies from canceled workers must never replace a newer result.
- The previous result is retained while a new calculation runs or input is invalid.
- History downloads are disabled until the displayed result matches the applied inputs.
- The reference draft is independent: its edits do not launch generation until committed.

The states are `waiting`, `running`, `ready`, `invalid` and `error`. Waiting/running show progress feedback. Invalid input shows correction messages. Worker failures show a retry-by-editing message. Stale history is explicitly marked.

Configuration export serializes the currently applied configuration and catalog. It does not include pending reference edits. Validate the applied configuration synchronously before producing a configuration file; display English field errors if validation fails.

### 3.4 Shared persona recap

The recap appears alongside Configuration and remains sticky on desktop. It contains:

- “Your Person’IA” context and persona name.
- Age, country, region and household/housing tags.
- Average monthly income equivalent.
- Explicit monthly fixed charges excluding the charge with ID `fees`.
- The difference before variable daily spending; this is not a guaranteed disposable-income figure.
- A compact **“Balance evolution”** curve.
- A selector with all accounts selected initially, plus each individual account.
- **Opening balance above closing balance**, with the closing amount reduced in size.
- **“Download account history”** below these balance figures, exporting the complete selected account scope and disabled until the result matches the applied inputs.
- A separate primary configuration-download button. Clicking the balance visualization opens History; the main navigation also provides direct access through Accounts, alongside Configuration and Reference. Accounts is active when the history view is open.

The selected account is shared with the main History workspace. An all-account curve sums bank balances; it does not deduct outstanding borrowing. Negative portions are red. Event/date and overdraft references remain graphical where applicable. 

### 3.5 English interface contract

Set the document language to en and use en-GB for interface formatting. The persona data locale remains fr-FR for the default French models. Country changes never change the interface language.

All system text comes from the English message catalog, including tabs, labels, model descriptions, placeholders, action menus, confirmation dialogs, loading/empty/error states, chart axes and tooltips, accessibility names, uploaded-file validation and download notifications. No component may fall back to a French system string.

Use English month/day names, English decimal/group separators and an explicit currency indicator. For example, the French default can display EUR 1,234.56 and 15 September 2026. ISO dates in JSON remain machine-readable and language-independent. Format number/currency values with the interface locale and the persona currency.

Display user names, brands, user-authored descriptions and registered product/source names unchanged. Translate system-owned category/profile/segment labels by stable ID rather than by modifying merchant names or IDs. This distinction keeps the default French persona authentic.

The core English catalog is delivered in i18n/en-GB.json. Developers must cover every additional rendered system string through the same catalog and test for missing keys.

## 4. Configuration screens

The secondary tabs are **Profile**, **Accounts & charges**, **Behavior**, **Events** and **Time horizon**.

### 4.1 Profile — identity and household

| Field | Control and limits | Effect |
|---|---|---|
| First name | Required text, maximum 80 characters | Labels and exports. |
| Persona identifier | Required text, maximum 120 characters | Scenario identity and deterministic account identifiers. |
| Age | Integer, 18–100 | Health spending multiplier. Age is an initial fixed parameter, not an automatically advancing age. |
| Household size | Integer, 1–12 | Food, health and certain event amounts. |
| Children | Integer, 0 to household size minus one | School habits and extracurricular budgets/merchant eligibility. |
| Persona country | Searchable English country selector; France initially selected | Determines the domestic merchant context and starts the country/reference workflow. |
| Region | Regions provided by the applied country reference; France supplies 13 metropolitan regions | Scenario factor and merchant availability; use “All regions” when the pack has no subdivisions. |
| Settlement type | `metropole`, `city`, `rural` | Urban-only merchant eligibility; city and metropolis use the same urban gate. |
| Family situation | `single`, `couple`, `single-parent` | Descriptive metadata; household/children values control numerical effects. |
| Employment | Full-time, part-time, self-employed, student, retired, unemployed | Default income labeling; not an automatic job-market model. |
| Financial autonomy | Supported, transition, independent | Modifies low-cash discretionary behavior. |
| Housing | Mortgage, rent, owner, hosted | Activates/renames relevant default charges and owner-related habits. |
| Consumption profile | Student, modest, family, comfort, retired | Category budgets, merchant affinity and basket multipliers. |
| Car | Toggle | Fuel spending and transport merchant eligibility. |

The country control describes where the persona lives and consumes. It does not infer nationality. A country change opens **“Set up local reference”** with the selected country, active currency and reference-file loader. The current scenario remains applied until the local reference and any currency conversion are validated and committed. See section 5.5.

Changing a consumption profile is separate from changing a model: model selection supplies a recommended profile, while the user can select another profile afterward.

### 4.2 Profile — financial situation and incomes

Income amounts mean the **average amount actually paid per occurrence**, defaulting to monthly payments.

The income editor is a list of zero to thirty income cards. Each card provides:

| Field/action | Behavior |
|---|---|
| Enabled | Disabled income produces no payments and contributes zero to the monthly equivalent. |
| Label | Required nonempty label, maximum 150 characters. |
| Mean payment amount | Settlement currency, 0–1,000,000 per occurrence. |
| Frequency | Daily, weekly, every 14 days, monthly, quarterly, semiannual or annual. |
| Payment day | Monthly date 1–31, or weekday 1–7 for weekly/fortnightly; daily has no day input. |
| Reference month | 1–12 for quarterly, semiannual or annual recurrence. |
| Amount variation | 0–100%, interpreted as a bounded plus/minus variation. |
| Frequency variation | 0–100%, implemented as a bounded shift around nominal payment dates. |
| Annual evolution | −50% to +100% compounded growth. |
| Main income | Exactly one source must be marked main if the list is nonempty. |
| Delete | Removes a source; if the main source is deleted, the first remaining source becomes main. |

New sources default to 500 settlement-currency units (EUR 500 for France), monthly, day 28, reference month January, no variation or growth, and a generated unique `income_n` ID. If the list was empty, the new source becomes main.

The editor displays the combined monthly equivalent. Multiple enabled incomes all pay into the current account. It is possible to model no income with an empty list.

Annualization uses 365.2425 nominal daily payments, 365.2425/7 weekly payments, 365.2425/14 fortnightly payments, or 12/4/2/1 monthly/quarterly/semiannual/annual payments. This display conversion does not replace actual calendar scheduling.

### 4.3 Accounts & charges — accounts

The persona must retain exactly one current account. Additional accounts are savings or investment accounts, up to twenty accounts in total.

Each account card includes:

- Editable name, bank label and stable key.
- Opening balance: −100 million to +100 million settlement-currency units for current accounts; zero to 100 million otherwise.
- For non-current accounts, a savings/investment product selector.
- Annual scenario yield: 0–30%.
- Optional deposit ceiling; no ceiling is represented by `null`.
- A contextual note explaining the selected product.
- A delete action for eligible non-current accounts.

Changing a product applies that product's type, rate, ceiling and interest calculation mode. Account values can then be customized. New accounts use unique `account_n` keys and start with zero balance. Savings priorities are edited in Behavior, not on the account card.

The France default products are:

| Product ID | Display name | Account type | Annual scenario yield | Default deposit ceiling |
|---|---|---|---:|---:|
| `checking` | Compte courant | checking | 0% | None |
| `livret-a` | Livret A | savings | 1.7% | EUR 20,000 |
| `ldds` | LDDS | savings | 1.7% | EUR 12,000 |
| `csl` | Compte sur livret | savings | 1% | None |
| `life-euro` | Assurance-vie · fonds euros | investment | 2.5% | None |

These are editable stored assumptions. The Livret A cap of EUR 20,000 is a deliberate scenario default, not the statutory ceiling quoted in the source note. Product availability does not enforce real eligibility, ownership or tax rules.

A total opening-assets figure and the automatic-savings switch accompany the account list. Expandable source links explain the modeled account types.

### 4.3.1 Payment cards

Accounts includes Payment cards. A persona can configure up to twenty cards and select one card used for all card purchases. Types are Debit card (default), Deferred debit card and Credit card. Each card has a stable ID, editable label, authorized current-account overdraft (default 0) and authorized-overdraft annual rate (default 0%).

Card routing covers merchant purchases, habitual card payments, trips and exceptional one-off purchases. Recurring charges, taxes, loan repayments and car/property bank payments remain on the current account. Debit purchases use that current account after the existing funding policy; authorization requires sufficient funds plus the card's permitted overdraft. Mode rules can disable overdraft. Declined purchases are recorded in the audit.

Deferred and credit cards produce dedicated accounts with keys `card:<card-id>`, types `deferred-card` / `credit-card`, and fixed opening balance 0. Purchases make these balances negative. Deferred cards refund the outstanding balance monthly on the selected settlement day (default 1). Credit repayments use a fixed amount or percentage of the then-outstanding balance, capped at that balance. Defaults are 10% monthly on day 1; weekly, quarterly and yearly schedules are also available. Monthly credit interest defaults to 20% annually divided by twelve and is charged on the remaining balance after repayments due that day. Its monthly posting day is separately editable and defaults to 1. Days 29–31 clamp to month end without losing the original day anchor.

Repayments occur after due recurring charges and taxes and before new card purchases that day. They create equal current-account debit/card-account credit transfer legs. They do not duplicate purchase expenses or income. Savings funding is allowed by the existing policy; automatic savings retain the next scheduled card payment. When cash plus the authorized overdraft is insufficient, only the available amount is refunded and the remainder stays on the card account, with an audit entry. No scheduled item outside the history changes closing balances.

Card-attributable current-account overdraft debt accrues daily interest at the card's annual overdraft rate / 365, capped by that card's authorization, and is debited at month end. Checking-account credits repay the tracked card overdraft first. Non-card charges do not accrue this card interest. The removed global bankFees module remains ignored.

Card debt is a liability. Bank assets exclude card-account negative balances; total debt includes card balances plus loan principal. Net assets deduct those liabilities once. The combined balance chart and its totals sum all displayed account balances, including card accounts; explicit bank-loan liabilities remain in the separate debt total. Configuration exports retain every card setting; bank-statement exports identify card accounts and annotate purchases/refunds/interest with paymentCardId.

Credit facilities offers Mortgage, Auto loan, Personal loan and Student loan when adding a new loan. Existing saved fixed-term card facilities remain importable.

### 4.4 Accounts & charges — recurring charges

Each fixed monthly charge has an enabled switch, label, settlement-currency amount, payment day and deletion action. Adding a charge creates a unique ID with EUR 20, day 15 and category 18.

Charges post monthly, clamping a day such as the 31st to the last day of shorter months. Enabled charges are reflected in the displayed total. Nicolas initially has mortgage, borrower insurance, home insurance, electricity, broadband, mobile and a bank subscription charge.

The initial mortgage payment is a fixed charge, not a reconstructed amortization schedule. New event-related mortgages use the explicit loan engine.

### 4.5 Charges — retired automatic bank fees

The Bank fees section has been removed. The engine does not accrue overdraft interest, post intervention commissions, queue pending fees or reserve cash for these fees. Old configuration files remain loadable; their bankFees settings are ignored and omitted from current configuration exports.

Explicit recurring bank subscriptions and user-configured merchant budget categories remain ordinary charges and purchases.

### 4.6 Behavior — seasonal rhythm

“Seasonal patterns” contains:

- A seasonal-variation toggle.
- A read-only category explorer.
- Twelve monthly normalized frequency bars from January to December.
- A source-series/page note, explicitly identifying proxy categories.
- Frequency-variation intensity from 0 to 2 in 0.1 steps.
- Basket-variation intensity from 0 to 2 in 0.1 steps.
- An expandable table of volume, basket and target-spending factors.

The French reference applies its combined, weighted population series. Default frequency intensity is 1; default basket intensity is 0 because the source PDF supplies counts rather than monetary amounts.

Selecting an exploration category only changes the displayed chart. It does not change the configuration.

### 4.7 Behavior — everyday decisions

The settings include:

- Discretionary multiplier, 0–3.
- Savings aggression, 0–1.
- Low-balance regime: rare, occasional or repetitive.
- Target cash buffer.
- Authorized overdraft toggle and amount.
- Automatic savings funding/sweeping.
- Optional synthetic external support, its threshold and tranche amount.

Two adjacent ordered lists define **savings deposit priority** and **savings withdrawal priority**. Each lists the non-current accounts, including life insurance. Users can enable an account in a list and reorder it by dragging or using up/down buttons. A rank of zero excludes the account from that direction. Positive ranks are processed in ascending order, then by account key to resolve ties.

The category budget list shows all 23 categories, their effective monthly values and whether they are protected or discretionary. Editing a value sets an explicit final envelope override. These are the same applied envelopes used by the reference screen and engine.

“Protected” means different treatment in behavioral scaling and synthetic support; it does not mean a guarantee of sufficient bank funds.

### 4.8 Behavior — habits

The habits section includes comma-separated preferred merchants, nine toggles and comma-separated occasional destinations.

The toggles are App Store micropayments, school-start purchases, school trips, birthday takeaway meals, appliance repairs, year-end gifts, household equipment, homeowner maintenance and occasional trips.

A preferred merchant receives a selection-weight boost only if it is otherwise eligible. The preference does not create an unavailable merchant or override regional restrictions.

School habits require initial children; owner maintenance requires an owner/mortgage housing situation at execution. Digital daily transactions are gated by the App Store toggle. The default occasional destinations for Nicolas are Nantes, Lille and Paris.

### 4.9 Events — scheduled events

The top of the section provides a type selector and **Add** button. A scenario can contain up to one hundred events. An empty state explains the available life events.

Each card includes its order number, enabled switch, editable label, type, start date, duplicate action and delete action. Type changes reset type-specific defaults while preserving the card ID and date. Duplicates require a new unique ID.

Enabled event start dates must fall within the simulated window. Travel must also finish within that window, and two trips cannot overlap. Other event effects may extend beyond the window; the engine does not post out-of-window transactions.

| Event type | Inputs | Financial effect |
|---|---|---|
| `travel-domestic` | Start, 1–90 days, travelers, settlement-currency budget | Allocates the fixed trip budget among representative transport, lodging, food and leisure merchants. |
| `travel-abroad` | Destination, duration, travelers, foreign-currency budget, FX rate and fee | Generates foreign purchases and their settlement-currency conversions. |
| `inheritance` | Net received amount | Credits the current account once. No inheritance tax calculation. |
| `income-gap` | Duration up to 3,650 days, retained income percentage, main/all scope | Reduces affected income payments during the interval. |
| `exceptional` | Amount and existing spending category | Debits a one-off exceptional expense. |
| `property` | Purchase price, extra costs, recurring impact, optional mortgage and replacement of housing charges | Posts purchase/financing and later recurring costs/loan installments. |
| `car` | Price, extra costs, recurring impact | Posts purchase, enables car-related spending and adds later recurring costs. |
| `durable-change` | Subtype and subtype-specific values | Changes future salary, recurring charges, category prices or household composition. |

Travel destinations are France, the United Kingdom, the United States, Japan, Switzerland, Morocco and Spain. An international destination may share the persona currency. Trips using settlement currency use rate 1 and zero conversion fees.

Default trip duration is seven days. The initial generic event amount is EUR 1,500 or the corresponding entered foreign amount; inheritance defaults to EUR 20,000, property EUR 200,000 and car EUR 16,000. An income gap defaults to ninety days and zero retained income. Event templates in the handoff preserve all actual fields, including values irrelevant to a particular type.

### 4.10 Events — durable changes

| Subtype | Configuration | Effective behavior |
|---|---|---|
| Salary | New monthly-equivalent main income | Converts the target into the main source's payment frequency and applies it from the event date. Later salary events supersede earlier ones. |
| Rent | Enabled charge ID and new amount | Replaces that charge's amount for subsequent debits. Despite the label, the selector can target an enabled charge other than rent. |
| Category prices | One or more categories, percentage −90% to +500% | Compounds category-specific expense factors from the date onward. |
| Birth | 1–6 added children, one-off birth cost, monthly child cost | Enlarges the household immediately, posts the birth expense and starts recurring child costs one month later. |

Two salary changes cannot start on the same day. Two rent changes for the same charge cannot start on the same day. Cumulative category-price factors must stay within 0.001–100. Births cannot bring the household above twelve.

A newborn affects household spending immediately. Extracurricular eligibility starts three years after the birth event. Explicit trip and purchase budgets are not inflated by category-price events.

### 4.11 Events — financing policy

“Funding unexpected expenses” shows the funding order and exposes automatic savings, credit scope, consumer credit and card credit controls.

For each enabled borrowing type, users set the maximum outstanding principal, nominal annual rate, amortization duration and fixed monthly insurance. If both types are enabled, a priority selector chooses consumer-then-card or card-then-consumer.

| Parameter | Consumer credit | Card credit |
|---|---:|---:|
| Default enabled | No | No |
| Default nominal annual rate | 6% | 16% |
| Default duration | 36 months | 12 months |
| Duration range | 1–120 months | 1–60 months |
| Default outstanding cap | EUR 25,000 | EUR 3,000 |
| Maximum configurable cap | EUR 1,000,000 | EUR 100,000 |
| Default monthly insurance | EUR 0 | EUR 0 |

Scope is events only or events and current spending. Event-specific mortgage configuration supports up to 480 months, a 0–50% rate, capital no larger than price plus costs, and fixed monthly insurance.

First repayment occurs one calendar month after funding. Insufficient resources do not stop purchase, repayment or insurance debits: the current account can become negative beyond its authorized overdraft.

### 4.12 Time horizon

The horizon tab includes preset buttons for 1, 2, 4 and 8 years; a numeric duration field from 1–20 whole years; an origin date; the resulting inclusive period; and a deterministic seed field with a randomize button.

The randomize button uses browser cryptographic random values to choose a new seed. This is a user-triggered seed change; the simulation itself is deterministic.

Dates are validated as real ISO calendar dates. The origin must be between 1900-01-01 and 2090-12-31. The exclusive end is `addMonths(startDate, years × 12)`; the last included date is the preceding day. Leap days and shorter months are handled by calendar helpers.

## 5. Reference screen

### 5.1 Source citations and context

The top displays citations and concise calibration notes belonging to the active country reference. The France pack supplies six consumption-source citations. Country-specific sources must be visibly associated with their country and reference version.

The applied country and a “Load local reference” action precede the region and consumption-profile selectors. Region and consumption-profile selectors define the active reference context. A region multiplier and profile description explain the derived amounts. These selectors are staged reference edits, not immediately applied persona changes.

### 5.2 Budget envelopes and donut

The main envelope area contains one row per represented category and a donut on the right at desktop sizes.

Each row shows category, effective settlement-currency amount per month, share of the total variable budget, a manual amount input, an automatic-reset action when overridden, and a remove action. A visible row is one with a nonzero base, an explicit override or a locally retained edited row.

The add control chooses an existing unused category and starts a manual envelope at EUR 50. It does not create a new category. There is at most one envelope per category.

Removing an envelope sets its base to zero and removes its override. Resetting an overridden value removes only the override and recomputes the automatic amount.

The donut reflects the **draft monthly variable envelopes**, excludes recurring fixed charges and updates immediately while editing. Its tooltip displays category, amount/currency and percentage. A zero/invalid total produces an empty or correction state. Fuel remains zero without a car even if a fuel override is entered.

### 5.3 Merchant catalog

The merchant section provides a search field, category filter and merchant table. Rows show name, category, segment, preferred/scenario status, availability, mean basket for the profile and frequency per month.

The bundled France catalog has 99 merchants, including discount, premium, luxury, student, health, family activity and VTC segments. Names mix familiar chains and explicitly fictional local services. They are scenario labels, not commercial transaction feeds.

Both basket and frequency are individually editable for the current consumption profile. A reset action can restore each automatic value. Overrides use the key `<referenceId>|<styleId>|<merchantId>`, allowing different settings for the same merchant in different profiles. Zero frequency disables the merchant in ordinary daily generation.

Automatic frequency is inferred from the monthly envelope, merchant affinity, preferred-merchant weight and effective mean basket. It is an expected input rate, not a promise of an exact count.

The add-merchant form accepts name, existing category, segment, mean basket and monthly frequency, in the active country/currency context. A custom merchant receives a unique ID above the scenario range, `scenario: true`, wildcard regional availability, and current-profile overrides. Scenario merchants can be removed. Changing the selected persona model drops these scenario entries.

### 5.4 Explicit application of reference edits

A sticky bottom action panel appears only when draft values differ from the applied configuration or catalog. It states that reference changes are pending and offers **“Update configuration”**.

Ordinary reference edits stage these fields; country setup additionally stages country/currency/timezone, the complete local reference, converted amounts and provenance:

```text
region
style
budgets
budgetOverrides
merchantOverrides
catalog (separate draft value)
```

Validation errors appear in red and disable the apply button. Applying a valid draft merges only its changes into the latest persona configuration, publishes catalog changes in the same state transition, clears the draft, shows confirmation and triggers automatic generation.

Changes made in other Configuration tabs while a draft exists must be preserved. Pending edits survive main-tab navigation, but selecting a model or importing a configuration clears them. Restoring original values removes the dirty state.

### 5.5 Country selection and local merchant-reference loading

**Default:** André, France, EUR, Europe/Paris and the bundled France reference are ready to simulate immediately. Other built-in personas also load France.

**Country selection:** Configuration → Profile contains a searchable “Persona country” selector using English country names and stable country codes. Offer the maintained country registry even when only France has a bundled calibrated reference. For a country with no bundled file, show “Load a local merchant reference to configure this country.”

**Import workflow:**

1. Selecting another country opens a staged “Set up local reference” panel. Display the target country and the currently applied country.
2. “Load local reference” accepts a local JSON file; Reference exposes the same action for replacing the current country's catalog.
3. Parse and validate the local-reference contract. Show filename, reference ID/version, country, currency, timezone, merchant count, regions, categories represented and provenance.
4. A country mismatch is an error, not an automatic change of the selected country. Unknown categories, duplicate IDs, unsupported currency precision, non-positive means, invalid regions and unsafe fields produce specific English errors. Preserve the applied scenario.
5. Preview the new catalog and the affected envelopes, merchant overrides, events and financial settings. A local reference replaces the domestic catalog; do not merge national datasets silently.
6. The “Apply country and reference” button becomes available after required currency/region/event decisions are valid. On application, commit country, currency context, catalog, compatible settings and assumption provenance together; clear the draft and regenerate once.
7. “Cancel” discards the country/reference draft. Canceling the file picker or a failed upload leaves the current country and simulation intact.

For the same country/currency, users can replace a merchant file through the normal pending-reference workflow and commit with “Update configuration.” Multiple drafts share one staged state so country and catalog cannot be applied inconsistently.

**Currency handling:** A country reference declares its settlement/pricing currency. If this differs from the applied persona currency, request a fixed rate labeled “New currency units per 1 current currency unit.” Show a before/after preview and require explicit application. Multiply existing settlement-denominated income amounts, balances, ceilings, charges, envelopes, event costs, credit limits/capital/insurance, fee amounts and cash thresholds once by this rate and round to the new currency precision. Keep percentages and frequencies unchanged.

Keep the original currency amounts of already configured foreign trips. Recompute their conversion quotes against the new settlement currency. Re-evaluate domestic/international travel classification using destination country. If a trip cannot be resolved with available destination data, highlight that event and require correction before applying. Store the rate and conversion provenance in the scenario assumptions. Changing country does not itself create a bank transaction.

**Catalog/settings reconciliation:** Choose a valid target region or “All regions.” Keep preferred names only as text preferences, with an English notice when no target merchant matches. Remove inapplicable merchant overrides from the applied target state; retain overrides only when reference identity/version and merchant identity explicitly match. Preserve canonical category IDs. Require a user decision for a positive envelope with no eligible merchant: set it to zero, add a local merchant, or keep it explicitly inactive. Show inactive categories and their reason.

**Uncalibrated-country fallback:** Merchant mean/frequency inputs come from the local file. Use region factor 1 and flat seasonality unless target-country values are provided. Keep user-defined final envelopes as explicit amounts, converting them once if needed. Do not apply France's age/profile budget ratios or seasonal observations as automatic local calibration. Profile labels and generic merchant-segment affinities can remain editable scenario heuristics; their provenance must say “Scenario assumption.”

A merchant-only file does not provide local banking rules. Present converted account rates and limits as user-defined assumptions and set bankingCountry to null. The user can edit them before applying. Product and bank names remain data; their names alone must not activate national rules.

**Source presentation:** The Reference screen cites the applied country file and any applicable calibration sources. Country selection alone must not relabel French statistics as evidence for another country. An uploaded file with authored assumptions is labeled “Scenario assumptions,” and the illustrative UK sample is never described as observed consumer data.

**Persistence:** Configuration export includes country, data locale, currency/precision, timezone, full local file content, reference ID and SHA-256 content hash, financial assumptions and conversion provenance. Reloading the file requires no second merchant upload. Reference content is rendered as escaped text. Loading a file cannot run scripts or read arbitrary filesystem paths.

## 6. History screen

### 6.1 Header, empty state and stale state

Without a result, History shows generation progress or a prompt to correct/configure the persona, with navigation back to Configuration.

With a result, its header shows persona name, horizon length, seed, date range, account count and the account-history download menu. If newer applied inputs have not completed, a banner explains that the displayed result is the previous generation and disables result downloads.

### 6.2 Summary and category donuts

The summary is placed at the top. It contains a period selector: entire period, year or month, with a matching year/month dropdown. Boundary months and years can be partial.

Metrics are operation count, income, expenses, and current-account closing balance with days in overdraft. The operation count includes both legs of internal transfers. The income/expense amounts exclude internal transfers; borrowing is excluded from income.

Two donuts show **expense amounts by category** and **income amounts by nature/source**. Savings interest counts as income; loan repayments, insurance and fees count as expenses. Income view grouping separates configured sources, interest, inheritance and synthetic support without rewriting transaction categories.

The ring displays the top five categories plus “Other categories” when needed. A control expands the full category list. Amounts and shares appear in the legend and tooltip; empty periods show an empty-ring state.

This summary always covers all accounts. Changing the account selection below does not filter these donuts. The selected summary period also does not change the operation-table filter or the export scope.

Aggregate reference comparison data may be included in export metadata for developer analysis, with its reference ID and country.

### 6.3 Savings interest summary

A compact banking summary displays credited savings interest and accrued but uncredited savings interest. The accrued values come from the in-memory simulation result; not all are present in the normal history export.

### 6.4 Account tabs and balance chart

Tabs display each account's name and ending balance, plus all accounts with the total ending assets. The account selection is shared with the Configuration recap.

The chart title is **“Balance evolution”**. It plots daily closing balances over the entire simulation horizon, with:

- A visible zero reference.
- Red line segments below zero.
- A today's-date marker if today falls within the horizon.
- Event markers and accessible event controls.
- An authorized-overdraft reference where relevant.

For a current account, the overdraft line is the negative authorized limit, or zero if no overdraft is allowed. Savings accounts have no authorized-overdraft reference. For the all-account asset curve, the threshold is the other accounts' assets minus the current account's overdraft limit; it can vary over time.

Clicking an event marker opens a tooltip/popover describing the event, its status, note, expenditure/receipts and associated financing information. Events on the same date are grouped. Marker layout and an event list provide alternatives to relying solely on a tiny plotted point.

Today is a view concern. Moving today's marker must not change generated transactions or their fingerprint.

### 6.5 Operation table

Controls include free-text search in the transaction label, a category selector, inclusive From/To dates and a reset-filters action. Selecting an account resets operation filters and pagination.

Columns are Date, Operation, Category, Account, Amount and Balance after. The operation cell also identifies its simulated nature. Foreign-currency transactions expose original amount, currency, conversion rate and settlement-currency fees.

There are thirty rows per page with previous/next controls and page count. Results follow the exported reverse booking order. Empty matches show a dedicated message.

The download menu exports **all operations for the chosen account scope**, irrespective of text/category/date filters or the selected summary period.

### 6.6 Events, loans and audit details

If events or loans exist, an “Events & financing” section shows borrowed capital, outstanding principal, interest paid during the horizon and insurance debited.

The event table shows label/note, date, status, purchases/charges and non-loan receipts. Durable events are not represented as fictitious direct income when they merely alter later payments.

Loan detail accordions show type, label, total monthly payment, capital, nominal rate, term, monthly/total insurance, total scheduled interest and an amortization table. The UI shows at most twenty loans and twelve installments per loan; JSON includes all.

An optional audit panel appears when automatic spending is deferred by envelope rules. It shows the first twenty-five decisions and provides a full audit download. Label these decisions “Deferred spending”; financial insufficiency alone does not defer a booked purchase or repayment.

A separate JSON-format preview shows the first exported operation and a reduced metadata/account example. The actual download includes the complete data, meta and included structures.

## 7. Simulation rules and financial calculations

### 7.0 Country scope and monetary conventions

The quantitative calibration in sections 7.4–7.8 describes **France** defaults. Other countries use their local merchants and the fallback rules in section 5.5. French ratios, observations, euro thresholds and product/fee assumptions must not be silently presented as local facts.

All algorithms operate in settlement currency and integer minor units. Numeric EUR examples identify France defaults. Local policies supply explicit values; user-defined assumptions are labeled. Conversion uses recorded scenario rates, not an unrecorded live quotation.

### 7.1 Determinism, dates and money

The engine clones configuration and catalog before validation and generation. It canonicalizes seasonality to the combined population. It then initializes:

- A 32-bit FNV-1a-style seed hash and a Mulberry-style pseudorandom sequence.
- An independent deterministic stream per configured trip.
- Independent amount/date random values per income ID and nominal payment date.
- Integer-minor-unit balances, transfers and postings.

Monetary JSON values are numbers in the settlement currency. Postings use integer minor units with scale = 10^currencyDigits. EUR has two digits; other supported currencies use their declared precision. Fractional interest can accrue internally before capitalization. The seed is text; preserve its exact string, including leading zeros.

Transaction dates are calendar dates serialized as `YYYY-MM-DDT00:00:00`, without a timezone suffix. Calculation helpers use UTC calendar operations to avoid daylight-saving drift. A card operation affects the balance on its operation date; its due/accounting date is the next Monday–Friday weekday under the scenario accounting convention; country selection alone does not supply a banking-holiday calendar. Other transaction types use the same operation/accounting day.

The account numeric base is `10,000,000 + (hash(personaId) mod 10,000,000) × 10`; account index is added to it. These identifiers are scenario-local, not globally collision-proof. Transaction IDs start at 100,000,001 in booking order. Final transaction arrays reverse booking order, including within the same day.

The financial fingerprint hashes normalized financial configuration, country/currency context, applied reference content and engine version. Interface locale and display-only labels are excluded. It is a reproducibility indicator, not a cryptographic integrity signature. The handoff manifest uses SHA-256 for file integrity.

### 7.2 Daily processing order

Order matters for funding and interest. Each day:

1. Resolve durable salary, household and category-price state; determine children eligible for activities.
2. Initialize savings interest bases when a new fortnight begins.
3. Reset monthly counters and update category targets/carryover.
4. Post scheduled incomes.
5. Post inheritance receipts.
7. Pay scheduled loan installments and their separate insurance debits.
8. Apply durable-event startup costs and recurring-cost setup.
9. Execute planned purchases and reserve trip budgets; update car/housing state.
10. Update income-gap event statuses.
11. Debit fixed charges and event-created recurring charges.
12. Post that day's trip purchases and release matching reserved cash.
13. Attempt ordinary category purchases.
14. Attempt automatically generated habitual events.
15. Accrue/credit savings interest, including year-end capitalization.
17. Sweep eligible surplus into savings.
18. Store the daily current-account balance, per-account balances, total bank assets, debt and net bank assets.

Income/price changes are dated: they do not rewrite earlier transactions. Ordering within same-date events is stable by event ID.

### 7.3 Income schedules

Daily income can occur on every calendar day, including weekends. Weekly and every-fourteen-day schedules use a weekday anchor starting Monday, 3 January 2000. Longer frequencies follow the configured reference-month cycle and clamp the chosen day to month end.

Nominal dates are generated beyond both horizon boundaries, then shifted and filtered. This permits payments shifted into the window from a neighboring nominal period.

For each nominal payment:

```text
dateShiftDays = round(uniform(-1, 1) × nominalIntervalDays × frequencyVariation / 100)
actualDate = nominalDate + dateShiftDays

payment = roundToCents(
  applicableBasePerPayment
  × (1 + annualGrowth / 100) ^ elapsedCalendarYears
  × (1 + uniform(-1, 1) × amountVariation / 100)
  × retainedIncomeFraction
)
```

Growth uses fractional years between calendar anniversaries. A salary event replaces the main income's monthly equivalent, converts it to the source frequency and restarts growth from the event date. A gap uses actual payment dates, not nominal dates. Overlapping gaps use the lowest retained percentage. Zero payments are omitted.

Date variation shifts payments; it is not random skipping or an independent probability of income. Payments may coincide or change order. Adding a separate income source preserves the other income streams' deterministic date/amount calculations, although resulting cash-dependent spending can change.

The configuration always contains an income array. An empty array means no income sources. Main-income events target the source explicitly marked as main.

### 7.4 Automatic monthly envelopes

For a category without an explicit override:

```text
monthlyEnvelope =
  roundToCents(
    baseCategoryBudget
    × householdFactor
    × regionalFactor
    × profileCategoryFactor
    × discretionaryFactor
  )
```

Household factors are:

- Food and bakery: `(1 + 0.35 × (household − 1)) / 2.05`.
- Health: `household / 4`.
- Extracurricular activities: `eligibleChildren / 2`.
- Other categories: 1.

Protected categories use a discretionary factor of 1; other categories use `discretionary`. Profile factors come from the explicit profile/category table, falling back to the profile's overall factor. Taxes and both bank-fee categories use a profile factor of 1.

Health uses the larger of the profile factor and the age factor: 1 below 40; 352/206 from 40–59; 443/206 from 60–69; 590/206 from 70 upward. These are modeled ratios drawn from the source interpretation; they are not reimbursements.

An explicit `budgetOverrides[category]` replaces the automatic amount, bypassing these factors. The no-car fuel gate still forces fuel to zero. Seasonal targets and later durable price changes still apply after the explicit base envelope.

Dated category-price events define changes to spending prices. Each income source has its own independent annual growth setting.

### 7.5 Consumption profiles and merchant selection

Five profiles are shipped:

| Profile | General level factor | General basket factor | Main characteristics |
|---|---:|---:|---|
| Student | 0.65 | 0.75 | Discount, small baskets, second-hand and student services. |
| Modest | 0.70 | 0.88 | Essentials and discount; limited discretionary spending. |
| Family | 1.00 | 1.00 | Higher food/home/activity envelopes; child-service affinity. |
| Comfort | 1.82 | 1.40 | Premium/luxury, restaurants, leisure and VTC. |
| Retired | 0.85 | 1.00 | Health, proximity shops and cultural spending. |

Per-category overrides take precedence over these general factors. The complete numeric tables are in `reference/consumption-profiles.json`.

A domestic merchant is eligible when its region matches or is wildcard, it is not travel-only, urban-only restrictions are met, and category-specific gates allow it. Transport uses car/non-car name conventions for default merchants; custom scenario merchants bypass that transport-name test. Child-activity merchants require eligible children.

Merchant weight equals profile/segment affinity, doubled for an exact case-insensitive preferred-name match. A positive explicit frequency can admit a merchant whose segment affinity is zero, but does not remove geographic gates.

```text
effectiveMean =
  explicitProfileMerchantMean
  OR roundToCents(catalogMean × regionalFactor × profileBasketFactor)

automaticMonthlyFrequency =
  monthlyEnvelope × merchantWeight / sumEligibleWeights / max(0.01, effectiveMean)

effectiveMonthlyFrequency =
  explicitProfileMerchantFrequency OR localReferenceProfileFrequency OR automaticMonthlyFrequency
```

The override must use null/undefined presence checks: an explicit frequency of zero is meaningful.

### 7.6 Seasonal factors

The observations run September 2024 to August 2025. Combine each month's count as:

```text
weightedCount = (populationAcount × 300231 + populationBcount × 299801) / 600032
ratio = weightedCount / meanOfTwelveWeightedCounts
volumeFactor = 1 + (ratio − 1) × volumeStrength
amountFactor = 1 + (ratio − 1) × amountStrength
targetSpendFactor = volumeFactor × amountFactor
```

The France reference uses the weighted combination. Reorder the source data before displaying January–December. The provided combined dataset is already in calendar order.

Category mapping includes explicit proxies, such as bakery→food, transport→fuel, leisure→culture and travel→hotels. Categories without a series remain at factor 1. Fixed income, contracted charges, installments and explicit event budgets are not seasonally multiplied.

The twelve volume factors have mean 1. If both frequency and basket variation are enabled, the mean of their product need not be 1. Therefore increasing both can also increase annual target spending. No monetary observations were supplied by the seasonal PDF.

### 7.7 Ordinary purchases and envelope use

Each day/category, the engine chooses a merchant using effective frequencies. The total expected daily attempts begin at the sum of eligible monthly frequencies divided by the number of days in that month, multiplied by the seasonal volume factor.

Additional effects:

- Home spending is reduced during configured trips using the fraction of household members traveling.
- Weekend food and restaurant frequency is multiplied by 1.25; other categories by 0.9.
- Discretionary frequency declines as the category envelope is consumed, with a floor factor of 0.15.
- A payment in the last four days boosts discretionary frequency by 1.35.
- Low cash reduces discretionary frequency according to low-balance regime and autonomy.
- Incident-fee-envelope purchases require a negative current balance or arrears.
- Fuel without a car and digital purchases without the App Store habit are skipped.

The number of attempts is the integer part of this expected count plus a Bernoulli draw for the fractional part, capped at fifty per category per day. The merchant selected for that category/day is reused for those attempts.

Baskets use bounded lognormal-style variation around the effective mean, with multiplier 0.28–3. Other factors include scenario annual growth, seasonal amount variation and durable category-price changes. Amounts are rounded to cents.

Ordinary purchases cannot exceed the remaining envelope. Health and luxury baskets that do not fit are skipped rather than truncated. Unused health/luxury amounts carry over, limited to five prior monthly targets plus the new target. Other categories reset monthly. Mid-month durable changes adjust only the remaining calendar share of the target.

The first partial calendar month receives the current monthly target rather than an automatically prorated full-month envelope. This affects interpretation of short boundary periods.

A configured envelope and merchant frequency therefore do not guarantee exact realized spending or counts. Eligibility, stochastic draws, timing, budget caps and cash-dependent behavior all matter.

### 7.8 Habitual events

The engine pre-schedules habitual events using the seed. Amounts below are base means before applicable regional, behavioral, seasonal, household-change and random adjustments.

| Habit | Schedule/probability | Base amount |
|---|---|---|
| School start | September, enabled and initial children > 0 | EUR 55 per initial child |
| School trip | May, 70% chance, initial children > 0 | EUR 55 per initial child |
| Birthday meal | One random month | EUR 16 × initial household |
| Appliance repair | One random month, 45% chance | EUR 170 |
| Year-end gifts | December | EUR 40 × initial household |
| Home equipment | One random month, 65% chance | EUR 160 |
| Home maintenance | April–September, 65% chance, owner gate | EUR 210 |
| Occasional trip | Each month, probability 0.095 × seasonal travel volume | Train mean EUR 65 × household × profile level; restaurant next day EUR 18 × household |

Most annual-event dates fall on days 2–26. Occasional trip dates fall on days 5–22, with the meal the next day.

Some optional habitual expenses are deferred if they exceed three times the category envelope, or eight times for travel. Such deferrals appear in the audit. Protected habitual expenses use different envelope treatment. A cash shortage does not itself reject an otherwise generated expense.

### 7.9 Planned travel and foreign exchange

The travel planner creates merchant/date candidates: transport on the first day, hotels on applicable nights, groceries every third day, leisure every second day and other daily services.

It weights candidates by merchant mean, travelers and deterministic noise, then distributes the **entered total trip budget** using a largest-remainder allocation in the source currency's smallest unit. All original allocations sum exactly to that budget. Japan uses zero decimal digits; the other destinations use two.

Conversion is:

```text
rate = foreignCurrencyUnits per settlementCurrencyUnit
scale = 10^currencyDigits
baseMinor = round(originalAmount / rate × scale)
feeMinor = round(baseMinor × fxFeePercent / 100)
debitMinor = baseMinor + feeMinor
```

The history stores the original debit amount as negative, the currency, rate, convention and fee. Settlement-currency totals can differ slightly from converting the total foreign budget once, because each operation and fee is rounded separately.

Funding is reserved at trip start. Reservation is an internal availability adjustment, not a transaction. Actual purchases debit on their scheduled dates and release that reserved amount. The trip's funding can use savings and permitted credit once at the start; individual trip postings do not borrow again.

Travelers influence domestic spending suppressed during the trip. Because the same traveler multiplier is applied to every candidate before normalization, changing travelers alone does not scale the entered total trip budget. This is an explicit implementation limitation if per-person travel costing is desired.

### 7.10 Purchases and durable changes

A property purchase debits price plus additional costs and can draw the explicitly configured mortgage. If replacement is enabled, the existing `housing` and `borrower` fixed charges stop from the purchase date. Otherwise they remain, potentially alongside the new mortgage.

A car purchase debits price plus costs and enables car-related behavior. Car/property monthly impact starts one calendar month after purchase, on the corresponding clamped day, and continues to the horizon end.

Salary changes affect future income payments. Rent changes replace the selected charge at its next due debit, without a partial-month adjustment. Price changes compound rather than overwrite. Births enlarge the household immediately, debit a birth cost and add a separate child recurring charge from the following month.

The model does not include property/car resale value in bank assets. It does not calculate inheritance taxes, purchase taxes beyond manually entered extra costs, depreciation or actual underwriting.

### 7.11 Funding order and overdraft

For a required debit, calculate available current cash after reservations. An explicit event mortgage is included in the funding plan before deciding how much savings is needed.

The engine then:

1. Transfers the required amount from eligible savings in withdrawal order, if automatic savings is enabled.
2. Draws the explicit mortgage, if applicable.
3. Fills remaining need with allowed automatic consumer/card loans, respecting priority, scope and outstanding-principal caps.
4. If applicable, adds synthetic support for a protected expense in configured tranches.
5. Posts the full debit even if a remaining shortage makes the current balance negative.

An authorized overdraft is a reference and pricing threshold. The engine does not spend up to that limit before considering savings/credit; funding is sought to cover the debit against available cash.

Savings accounts cannot be withdrawn below zero. Loans are separate liabilities and are not represented as negative savings-account balances. No new consumer/card credit directly finances an existing loan installment or its insurance, preventing recursive refinancing through that path.

Synthetic support is an optional external credit, not a savings transfer or means-tested public benefit. It rounds the amount needed to restore the configured protected-expense threshold up to whole support tranches.

### 7.12 Loan amortization and insurance

For capital P in settlement-currency minor units, nominal annual percentage a and n months:

```text
r = a / 1200
installment = round(P / n)                           if r = 0
installment = round(P × r / (1 − (1 + r)^(-n)))       otherwise

interest = round(remainingPrincipal × r)
principalPaid = installment − interest
```

The actual implementation constrains principal payments to valid cent amounts and adjusts the final installment to settle the exact remaining principal.

A drawdown credits the current account with `simulationKind: credit-drawdown`. It is followed by the related expense debit; borrowing is excluded from income totals.

From one month after drawdown, the engine debits:

- Principal plus interest as `credit-repayment`.
- Fixed monthly insurance as a separate `credit-insurance` operation, omitted when zero.

The loan tracks principal outstanding, installment status, actual paid date and schedule. The full schedule is exported even beyond the simulation horizon; future rows are marked `outside-window` and generate no transaction in the current history.

Consumer/card caps apply to total outstanding principal of the relevant type. Repaid principal releases capacity. Each card draw is its own amortized loan, not a real revolving statement/minimum-payment model.

**Provided example:** `examples/credit-savings-fixture.personia.json` starts with EUR 1,000 savings and no current cash, buys a EUR 7,000 car on 15 January 2025, transfers all savings and borrows EUR 6,000 at 6% over twelve months. The installment excluding insurance is EUR 516.40; insurance is EUR 8. Eleven in-window payments debit EUR 5,768.40 in total. With no income or further resources, current-account closing balance is −EUR 5,768.40. The twelfth installment remains outside the 2025 window.

### 7.13 Savings transfers and surplus placement

Every internal transfer creates two opposite settlement-currency transactions with the same `transferId` and category 212. It preserves the sum of all account balances. Deposits respect the destination's remaining ceiling; the next eligible account receives any remaining amount. Rank zero excludes an account.

For surplus placement the engine reserves:

- All active monthly fixed and event-created charges.
- Unpaid loan installments due within the next thirty days.
- Current variable monthly targets, excluding the incident-fee envelope.
- The target buffer multiplied by 1.5 for rare low balance, 1.2 for occasional and 1 for repetitive.
- Reserved travel funds.

The proposed sweep is the positive remaining surplus multiplied by savings aggression, rounded down to cents. A sweep occurs only if it reaches EUR 25, and uses deposit priority and available ceilings.

This is a conservative heuristic, not a full forecast of all future cash flows. Savings aggression affects surplus placement; the automatic-savings switch also controls funding withdrawals.

### 7.14 Savings interest

Non-current accounts with a positive annual rate accrue interest. Current accounts do not earn interest even if a rate is present in imported data.

**Fortnight mode:** on the 1st and 16th, initialize the eligible positive balance before that day's movements. Withdrawals reduce the current eligible base; deposits wait until the next fortnight. Credit one twenty-fourth of annual interest at the 15th/month end. An initial incomplete fortnight does not accrue. This is the implemented simplified value-date model.

**Daily mode:** accrue positive closing balance × annual rate / 365 or 366.

Both modes capitalize on **31 December**. The credited transaction increases that savings account's balance and counts as income. Uncredited accrued interest is stored separately and is not added to the balance curve before capitalization.

Interest may push an account above its deposit ceiling. The ceiling limits transfers in, not earned interest. Tax, insurance redemption delays and product-specific real-world restrictions are not separately calculated; entered yields are scenario net yields.

### 7.15 Retired automatic bank fees

Negative account balances do not accrue automatic debit interest or trigger intervention fees. The generator has no fee queue, fee reserve or quarter-end debit-interest calculation. Retired bankFees settings do not participate in financial fingerprints or currency conversion.

### 7.16 Totals and balance reconciliation

For each account:

```text
closingBalance = openingBalance + sum(all posted account amounts)
```

Every `balanceAfter` must reconcile in booking-ID order. Summed internal transfers must net to zero.

Income excludes internal transfers and credit drawdowns; expenses exclude internal transfers but include principal repayment, interest, insurance and fees. Savings interest is income. Count metrics may include transfer legs even when monetary income/expense metrics exclude them.

The displayed aggregate curve equals total bank assets. The internal daily model separately stores debt and `netAssets = assets − debt`. Bank assets do not include the purchased property or vehicle.

No out-of-window scheduled item changes the closing balance. Accrued unpaid savings interest is not yet posted income.

## 8. Data contracts and file formats

The target contracts are defined in [contracts/DATA-CONTRACTS.md](contracts/DATA-CONTRACTS.md). Runtime validators must enforce structure, enum values, list limits, monetary precision and cross-field rules. Uploaded JSON is data and must never execute code.

### 8.1 Persona configuration

| Group | Fields |
|---|---|
| Identity | id, name, seed |
| Country context | countryCode, locale, currency, currencyDigits, timeZone, referenceId, region |
| Household | age, household, children, employment, urbanity, housing, car, family, autonomy, style |
| Income | incomes, an array of explicitly configured Income records |
| Banking | accounts, charges, bankFees, overdraft, overdraftLimit |
| Behavior | discretionary, savingAggression, lowBalance, buffer, autoSavings, autoTopup, topupThreshold, topupAmount |
| Consumption | preferredMerchants, budgets, budgetOverrides, merchantOverrides |
| Events | events, travelCities, plannedEvents, financing |
| Time | startDate, years |
| Seasonal assumptions | seasonality with enabled, volumeStrength and amountStrength |

Country codes use ISO 3166-1 alpha-2 identifiers. Currency codes use ISO 4217 identifiers. Locale uses BCP 47 notation and describes the persona data context; the English interface locale is stored separately. The timezone is a recognized IANA zone selected for the scenario.

Account keys and event/income IDs must be unique within a persona. The configuration always supplies an income array. Monetary values are settlement-currency major units, representable at currencyDigits precision.

### 8.2 Core records

**Account:** key, name, bank, type, openingBalance; optional product, annualRate, ceiling, withdrawalRank, depositRank, interestMode. Type is checking, savings or investment. A null ceiling means unrestricted deposits. Rates are annual percentages.

**Charge:** id, name, amount, day, categoryId, enabled. Amount is a positive debit magnitude.

**Income:** id, label, amount, frequency, day, month, amountVariation, frequencyVariation, annualGrowth, main, enabled. Exactly one source is main when the array is nonempty.

**Merchant:** id, name, category, mean, regions; optional segment, urbanOnly, travelOnly, scenario and monthlyFrequencyByProfile. Its country/currency come from the enclosing local reference. Category keys are shared across countries. Merchant names are data and display unchanged.

**Merchant overrides:** keys combine reference ID, profile ID and merchant ID, for example fr.merchants.v1|family|800000. Each stores optional mean and frequency. Zero frequency is explicit. Reference scoping prevents settings from one country's merchant ID being applied to an unrelated merchant in another file.

**Planned event:** id, enabled, type, label, startDate plus applicable duration, budget, destination, travelers, FX, income retention, category, recurring impact, mortgage and durable-change fields. Types include travel-domestic, travel-abroad, inheritance, income-gap, exceptional, property, car and durable-change. Domestic travel compares destination country with persona country.

**Financing:** enabled consumer/card policies, priority, scope, limits, rates, durations and fixed monthly insurance.

### 8.3 Complete configuration export

The target exchange envelope is:

```text
{
  format: "personia.configuration",
  version: 2,
  specificationVersion: "2",
  uiLocale: "en-GB",
  modelId: "nicolas",
  configuration: PersonaConfig,
  reference: CountryMerchantReference,
  referenceHash: "SHA-256 of canonical reference content",
  assumptions: {
    bankingCountry: country code or null,
    consumptionCountry: country code or null,
    seasonalityCountry: country code or null,
    sources: provenance records
  }
}
```

The financial engine version is attached to generated results by the implementation. Specification examples do not claim a deployed engine version.

Export embeds every persona setting, the complete applied merchant reference and provenance. Reproduction must not depend on the original upload path or an external URL. Export excludes the uncommitted reference draft and validates the complete applied state synchronously. Configuration downloads use the filename `<persona>-configuration-<YYYY-MM-DD_HH-mm-ss>.personia.json`. All browser exports include their local export date and time, to the second, before the file extension.

The importer checks format/version, types, country/currency consistency, known categories, unique IDs, finite values and monetary precision. Limits are 5 MiB, twenty accounts, thirty incomes, one hundred charges, one hundred events and five thousand merchants. Reject unsafe identifier keys such as **proto**, prototype and constructor. Reject unknown fields unless explicitly defined by the schema.

Successful load replaces the complete scenario and reference atomically, restores saved country/currency/dates and opens Configuration → Profile. Failed, canceled or superseded loads preserve the applied state.

### 8.4 Local merchant-reference file

The format is defined by [contracts/local-merchant-reference.schema.json](contracts/local-merchant-reference.schema.json). Required fields are format, version, id, name, countryCode, currency, currencyDigits, locale, timeZone, dataStatus, regions, merchants and sources.

- format is personia.merchant-reference; version is 1.
- id is a stable, versioned reference identifier.
- dataStatus is scenario-assumptions or documented-estimates.
- regions contains unique IDs, names and positive regional factors. An empty list means countrywide coverage.
- merchants contains unique positive numeric IDs, names, supported category keys, positive mean baskets in reference currency, region IDs/wildcards and optional profile frequencies.
- sources records provenance. A URL is optional for user-authored assumptions. Official calibration claims require corresponding evidence.

Schema validation is followed by semantic checks: country matches selection; currency precision matches supported currency metadata; category/region references resolve; timezone is recognized; means/frequencies meet limits. A reference cannot contain executable expressions, scripts or markup.

### 8.5 History export

A generated statement uses format `personia.account-history`, version 1, with data, meta and included. History downloads use the filename `<persona>-<account-or-all>-account-history-<YYYY-MM-DD_HH-mm-ss>.json`. They contain booked banking operations and their identification, separately from the configuration export.

A transaction includes id, amount, amountMinor, currency, text, comments, categoryId, date, dueDate, originalDate, accountId, accountKey, detectedCategories, merchantId, isFlagged, counterpartyAccountIdentifier and parsedData. balanceBefore and balanceAfter record the account balance around each operation; corresponding minor-unit fields preserve exact arithmetic. beneficiary and counterparty identify the account holder, internal account, merchant or transaction label as available. Unidentified external parties retain the transaction label with an explicit identification status.

parsedData includes accountingDate, transactionTypeCode, transactionGranularityCode, transactionAccounting, status, originalText, synthetic, simulationKind, categoryLabel and balanceAfter. Optional fields include transferId, location, eventId, incomeId, loanId, principalRepaid, interestPaid, insurancePaid, scheduledDate, originalAmount, originalCurrency, exchangeRate, exchangeRateConvention and fxFee.

Amounts use the persona settlement currency. Original-currency fields preserve foreign purchases and a documented quote convention. System-owned labels use English. Merchant names and user-entered text retain their spelling. Signed amounts identify credits/debits; component fields for principal, interest, insurance and fees are positive magnitudes.

Common kinds include daily, income, recurring, internal-transfer, life-event, planned-event, travel-event, event-recurring, inheritance, credit-drawdown, credit-repayment, credit-insurance, external-support and savings-interest.

Metadata contains count, signed totalAmount and totalAmountMinor, synthetic status, engine version, financial fingerprint, persona identity, currency/precision, timezone, date range, reverse-chronological transaction order and scoped totals. Financial fingerprints exclude interface locale and display-only strings. Configuration settings, reference catalogs and provenance are reserved for the configuration file.

Included accounts identify their key, ID, name, bank, type, optional product, currency, holders and opening/closing balances in major and minor units. Used merchants contain only descriptive identification fields. A single-account export filters operations and accounts, supplies scoped totals and preserves identification of internal-transfer counterparties. Events and full loan schedules remain in the separate event/credit-details export.

### 8.6 Runtime result and additional exports

The runtime result additionally contains daily balances, monthly totals, accrued savings interest and deferred-spending audit entries. It includes generated card accounts and card debt in liability totals; card settlements are internal transfers and interest is an expense.

The event/credit-details export contains events and loans. The deferred-spending export contains audit entries. These file types use clear English filenames/descriptions and cannot be imported as configurations.

## 9. Reference data and source provenance

### 9.1 French default models

The four built-in personas retain their French financial assumptions. Translating the interface does not change means, rates, balances, household characteristics, merchants or seed.

| Model | Profile | Household | Monthly income equivalent | Country / region |
|---|---|---:|---:|---|
| Nicolas | Family | 4 including 2 children | EUR 2,000 | France / Centre-Val de Loire |
| Léa | Student | 1 | EUR 1,080 | France / Hauts-de-France |
| Sarah | Comfort | 1 | EUR 3,400 | France / Île-de-France |
| Michel | Retired | 2 | EUR 2,150 | France / Bretagne |

Nicolas begins with EUR 80 current, EUR 1,750 Livret A, EUR 950 savings and EUR 4,200 life insurance. Other presets begin with EUR 600, 2,500, 700 and 2,000 respectively. French product/merchant proper names remain authentic.

### 9.2 Delivered datasets

[DATASETS.md](DATASETS.md) and [manifest.json](manifest.json) distinguish target examples from reference financial data.

- models/: French persona configuration objects for the target contract.
- configurations/: complete target version-2 examples with embedded local references.
- country-references/fr.merchants.v1.json: France reference based on the 99 domestic merchants.
- country-references/gb.example.v1.json: a small fictional UK file demonstrating country/currency import, labeled as illustrative assumptions.
- i18n/en-GB.json: system interface vocabulary.
- design/dark-theme.json: visual tokens.
- reference/: consumption coefficients, catalogs, categories, regions, product assumptions, sources and seasonal observations.
- derived/: initial French budgets/merchant rates calculated from those assumptions.
- examples/: reference ledger fixtures demonstrating financial rules, independently of target interface implementation.
- contracts/: target types and local-reference schema.

Version-2 files specify the target import contract. They must not be described as accepted by the deployed application until its importer is implemented and tested.

### 9.3 Official/public references used by the application

These links document the France reference assumptions. Findings and coefficient choices are distinguished in the JSON source records.

- [INSEE — Budget de famille 2017](https://www.insee.fr/fr/statistiques/4764315): household and income-level consumption structure.
- [INSEE — Comportements de consommation](https://www.insee.fr/fr/statistiques/4127596): spending-level differences used to motivate differentiated scenarios.
- [INSEE — Lieux d’achat et revenus, historical publication](https://www.insee.fr/fr/statistiques/fichier/1373172/fporsoc07c.pdf): historical discount-shopping differences; not a current market-share feed.
- [DREES — La complémentaire santé, 2024 edition](https://drees.solidarites-sante.gouv.fr/sites/default/files/2024-07/CS2024EMB.pdf#page=14): age-related residual health expenditure.
- [INJEP–DEPP — Petites vacances des collégiens](https://injep.fr/wp-content/uploads/2023/12/IAS73_vacances-collegiens_web.pdf): children's organized activities.
- [OVE — Conditions de vie étudiantes 2023](https://www.ove-national.education.fr/publication/ove-infos-n48-la-crise-dans-le-retroviseur/): student budget/food constraints.
- [Banque de France — Livret A](https://www.banque-france.fr/fr/a-votre-service/particuliers/connaitre-pratiques-bancaires-assurance/epargne/livret-a), [Service Public — LDDS](https://www.service-public.gouv.fr/particuliers/vosdroits/F2368), [Compte sur livret](https://www.service-public.gouv.fr/particuliers/vosdroits/F34394), [Assurance-vie](https://www.service-public.gouv.fr/particuliers/vosdroits/F15274) and [Découvert](https://www.service-public.gouv.fr/particuliers/vosdroits/F31423): product concepts and fee context.
- A provider's [2026 retail tariff brochure](https://www.img.caisse-epargne.fr/app/uploads/sites/5/2025/11/28143245/2026-part-brochure-tarification-web.pdf) supplies example overdraft assumptions. It is a provider reference, not a national tariff.

The weighted seasonal counts come from the user-provided **“Volumétrie transactions Meniga — Analyse”**, September 2024–August 2025. The original PDF is not redistributed in this handoff.

The separate transaction calibration snapshot records 13 example files and 11,139 transactions, including 9 retail files and 8,624 retail transactions. Some source pages are truncated at 1,000 rows. It contains aggregate statistics, not original customer operations. These aggregates support developer comparisons for France.

### 9.4 Modeled assumptions

Merchant prices/frequencies, regional factors, profile levels/affinities, event costs, FX rates and banking yields are stored scenario assumptions. Observed budget shares influence category structure but are not merchant prices.

Repeated source aggregates in `observed-budget-shares.json` are mapped to several simulator categories. Do not add these repeated percentages as though they formed a single disjoint national budget.

Healthcare represents net out-of-pocket payments after assumed reimbursement; it does not generate gross medical bills followed by separate reimbursement flows. No national representativeness or calibrated distribution fit is demonstrated by these presets.

## 10. Architecture and developer integration

### 10.1 Runtime and modules

The reference implementation uses React 19.2.6, TypeScript 5.9.3, Vinext 1.0.0-beta.5 with Vite 8.0.13, Tailwind 4.2.1, Base UI/shadcn components, Lucide icons and Recharts 3.8.0. Node >=22.13.0 is declared. The lockfile is authoritative when reinstalling.

| Area | Main files |
|---|---|
| App state, tabs, import/export wiring | `app/page.tsx` |
| Account/income/priority editors | `app/accounts-editor.tsx`, `income-editor.tsx`, `savings-priorities.tsx` |
| Reference editing and citations | `app/merchant-reference.tsx`, `consumption-reference.tsx` |
| Event and durable editors/results | `app/scenario-editor.tsx`, `durable-editor.tsx` |
| Mini/full balance views | `app/live-rhythm.tsx`, `balance-chart.tsx` |
| History summary/downloads | `app/history-summary.tsx`, `history-download-menu.tsx` |
| Auto calculation | `app/use-auto-simulation.ts`, `lib/personia/auto-generation.ts`, `simulation.worker.ts` |
| Reference draft merge | `lib/personia/reference-draft.ts` |
| Core model/reference | `lib/personia/model.ts`, `consumption.ts`, `seasonality.ts`, `references.json` |
| Financial engine | `lib/personia/engine.ts`, `incomes.ts`, `banking.ts`, `credit.ts`, `events.ts` |
| JSON validation/scoping | `lib/personia/configuration-file.ts` |
| Dates and view totals | `lib/personia/dates.ts`, `balance-view.ts`, `history-summary.ts` |
| Shared validation/form controls | `components/validation-context.tsx`, `personia-fields.tsx` |

The simulation worker is a **browser Web Worker**. The hosting build also emits a server/edge worker; these are different responsibilities.

### 10.2 Data flow

```text
Model or imported file
        |
        v
Applied configuration + domestic catalog <--- Apply validated reference draft
        |
        v
250 ms debounce -> validate -> browser simulation worker
        |
        v
Simulation result with input identity
        |
        +--> shared recap/account balance curve
        +--> history summary, donuts, table, events and loans
        +--> scoped or all-account JSON exports
```

Worker creation uses Vite's `?worker` constructor import. Preserve this bundled deployment-safe mechanism. Resolve the worker from the deployed application bundle.

The target worker accepts `{config, reference, assumptions}` and returns `{result}` or `{error}`. Cancellation ownership lives in the scheduler and hook, not in individual form fields.

### 10.3 Local development and checks

Repository scripts are:

```sh
npm run dev
npm run test
npm run typecheck
npm run build
```

Additional scripts run linting/formatting and a local Wrangler preview of the built server. Use the repository's configured package manager and lockfile in a real checkout.

The public site is hosted through the existing Sites configuration. Publication requires the normal application build/hosting workflow; this documentation handoff itself makes no application or deployment change.

There is no application CRUD HTTP API. A rewrite can introduce a backend, but doing so would add synchronization, privacy and persistence requirements beyond the implemented version.

### 10.4 Optional browser host integration

When `document.modelContext.registerTool` exists, the page registers:

- `generate_personia_history`: optionally changes seed and/or years, validates, opens History and returns automatic-generation status.
- `read_personia_summary`: returns current profile, seed, years, status/current flag, errors and latest count/fingerprint/totals.

Registration is optional, lifecycle-canceled and not required for normal browser use. It is not an AI model call or a remote banking API.

### 10.5 Versioning and reproducibility

A version change to deterministic formulas, catalog order, seed usage or posting order can change histories. Maintain fixtures and deliberately update the engine version when behavior changes.

File-format version and engine version serve different purposes. Import compatibility is an explicit allowlist; accepting a newer engine tag requires a conscious migration decision. JSON omission of optional undefined fields is expected and must not be treated as data loss.

For reproducible handoffs freeze the rolling origin explicitly, as done here. Do not include a live clock in the engine or mutate source constants while generating derived values.

## 11. Validation and acceptance criteria

### 11.1 Input validation and error presentation

Validation runs on the complete configuration/catalog. Local form checks identify empty required inputs and out-of-range numbers immediately. Global messages are deduplicated and mapped to field labels for red highlights and associated error text.

Cross-field checks include a single current account, unique account/charge/income/event/merchant IDs, a main income when sources exist, valid product/account types, valid region/profile, known categories, correct currency precision, event dates inside the horizon, no overlapping trips and allowed durable-change combinations.

Numeric fields must not silently coerce an empty string to zero. The UI uses NaN for empty numeric configuration values and renders the empty input until corrected. File JSON must contain only finite numbers.

Accessibility expectations include visible text errors, `aria-invalid`, associated error descriptions, labeled toggles/selectors, keyboard-operable priority controls, and non-color-only chart/legend meaning. The existing implementation provides these building blocks; a full accessibility conformance audit is outside this specification handoff.

### 11.2 Acceptance matrix

| ID | Action/setup | Expected result |
|---|---|---|
| A01 | Load Nicolas on a known Paris date | One-year horizon starts twelve calendar months earlier; correct family profile. |
| A02 | Generate twice from the same complete input | Identical JSON content and fingerprint. |
| A03 | Rapidly edit parameters during calculation | Only the latest valid input result becomes current. |
| A04 | Enter invalid amount/date | Red correction state; previous history marked stale; no fresh history download. |
| A05 | Add weekly/annual income | Payments follow configured calendar/frequency and monthly equivalent is correct. |
| A06 | Add an independent income stream | Existing income dates/amounts remain deterministically stable. |
| A07 | Schedule an income gap | Only affected payment dates/sources use retention; minimum overlapping retention applies. |
| A08 | Change a reference envelope without applying | Draft donut changes; applied configuration/history remain unchanged. |
| A09 | Apply that reference edit | Configuration, automatic merchant rates and regenerated history use the new envelope. |
| A10 | Edit unrelated Configuration fields while reference is pending | Applying draft preserves those later changes. |
| A11 | Set a merchant frequency to zero and apply | No ordinary daily transaction uses that merchant where the override is active. |
| A12 | Add a scenario merchant and export/reload | Catalog entry and profile overrides survive; history reproduces. |
| A13 | Reorder savings withdrawals | Eligible balances fund a shortage in the new priority order. |
| A14 | Generate an internal transfer | Two equal/opposite postings, matching transfer ID, aggregate assets unchanged. |
| A15 | Fill a capped savings account | Deposit respects cap and spills to the next account; interest can exceed cap. |
| A16 | Run positive-rate savings across 31 December | Interest posts to that account and counts as income; pending accrual is separate. |
| A17 | Use the credit fixture | Savings 1,000 + loan 6,000 fund purchase 7,000; eleven repayments and insurance debits in 2025. |
| A18 | Exhaust every permitted funding source | Expenses/repayments still post and current balance becomes negative. |
| A19 | Run beyond loan maturity | Exact principal is settled; no further installment/insurance debit. |
| A20 | End before maturity | Later schedule rows exported as outside-window; no out-of-window operations. |
| A21 | Generate foreign travel | Original allocations equal foreign budget; signed currency metadata and per-operation settlement-currency conversion reconcile. |
| A22 | Add a category-price change | Earlier postings unchanged; later expense factor compounds. |
| A23 | Add a birth | Household increases immediately; one-off and monthly costs post; activity effect starts at age three. |
| A24 | Change account tab | Curve/table scope changes; all-account summary remains unchanged. |
| A25 | Select month/year summary | Donuts use amounts in the intersecting period; transfers/borrowing exclusions hold. |
| A26 | Filter transactions then export | Export ignores table filters and covers the requested full account history. |
| A27 | Click an event marker | Event description/status and applicable financing are available. |
| A28 | Import malformed/unknown-property/oversized JSON | Error displayed; previous applied state preserved. |
| A29 | Use production build | Browser worker loads from the hosted bundle and generation succeeds. |
| A30 | Reconcile every account | Opening balance plus signed postings equals each balanceAfter and final balance. |
| A31 | Open every screen with France selected | All system copy, formatting, errors and accessibility labels are English; authentic French names remain intact. |
| A32 | Change country without a local reference | Country setup is pending; applied country/history remain unchanged. |
| A33 | Load a valid matching local file and apply | Target catalog replaces domestic catalog; currency/region rules are applied once and history recalculates. |
| A34 | Load a wrong-country/malformed/oversized file | Specific English error; no applied state mutation. |
| A35 | Switch EUR to GBP with a recorded rate | All affected monetary values follow the reviewed conversion; percentages/frequencies unchanged; no double conversion on reload. |
| A36 | Use a country with no statistical calibration | Flat seasonal/regional defaults and explicit assumptions; no automatic French national calibration. |
| A37 | Export/reload a country-specific scenario | Country, currency, timezone, complete local catalog and overrides round-trip without another upload. |
| A38 | Compare interface-language presentation | Financial amounts, dates, balances and financial fingerprint are unchanged by UI locale. |
| A39 | Inspect cards, forms, menus, tooltips and charts | Dark surfaces and white content throughout, including loading, errors, disabled and focus states. |
| A40 | Measure contrast and test keyboard use | Required text/control contrast, visible focus, readable donut labels and accessible event details pass. |

These are behavioral acceptance criteria, not a claim that every row has been newly exercised in a browser during documentation.

### 11.3 Financial fixture verification

The reference financial fixtures were checked against the recorded implementation revision:

- The four source financial scenarios passed engine validation and source-format round-trip checks before preparation of the target contract.
- The reference financial histories reproduced after source configuration/catalog serialization.
- Every example account reconciled its opening balance, all per-operation balances and closing balance in cents.
- Every example internal transfer had two balanced legs.
- The controlled credit fixture verified EUR 6,000 capital, EUR 8 insurance, eleven paid installments, one outside-window installment and a negative ending current balance.
- Domestic/travel merchant categories and seasonal mappings passed reference checks.

The baseline Nicolas example contains **507 transactions**, fingerprint **4d1612e5**. Its closing balances are EUR 925.72 current, EUR 1,758.68 Livret A, EUR 1,013.64 compte sur livret and EUR 4,231.07 life insurance. These are fixed fixture expectations for the delivered files, not expected balances for a changed horizon or seed.

Recorded financial results are in verification.json. Target-country imports, English UI and dark-theme behavior require implementation tests; no completed implementation is claimed. TEST-REPORT.md separates artifact/schema checks from runtime tests.

## 12. Modeling boundaries

The simulator models one settlement currency and one current account per persona, positive-balance savings, fixed nominal-rate amortizing loans and configurable recurring insurance. Real-world account eligibility, taxation, asset resale values, underwriting and banking execution are outside the model.

A merchant reference supplies local merchant data. It does not establish local banking law or nationally representative consumer behavior. For a country without calibrated profiles, seasonal series or bank assumptions, use the explicit fallback rules in section 5.5 and show their provenance.

Entered travel budgets are total budgets, not prices per traveler. Traveler count changes the share of household spending occurring at home. Activity eligibility for a birth begins at age three. Initial school habits use the initially configured children.

The first partial month uses its monthly variable target; month/year summary filters identify partial periods. A selected envelope or merchant frequency is a behavioral input rather than a guarantee of exact realized spending. Aggregate balance charts show bank assets; debt is reported separately.

Reference drafts and applied scenarios remain in browser memory until exported. There is no latency guarantee for maximum-size scenarios; cancellation, worker isolation and validation limits keep editing responsive. Financial fingerprints identify reproducible inputs and are not cryptographic signatures.
