import { stripLegacySettings } from "./profile";
import { ledgerAccounts } from "./payment-cards";
import type {
  Assumptions,
  ConfigurationFile,
  CountryMerchantReference,
  PersonaConfig,
} from "../domain/types";
import type { SimulationResult, Transaction } from "../engine/types";
import { fromMinor, toMinor } from "../engine/money";
import { financialFingerprint } from "../engine";
import travelMerchants from "../../specifications/reference/travel-merchants.json";
import { referenceHash } from "./canonical";
import { merchantRates, monthlyEnvelopes } from "../engine/consumption";
import { checkSchema, fileSchema } from "./schema";
import {
  ConfigurationError,
  parseJson,
  validateMerchantReference,
  validateScenario,
} from "./validation";

export function parseConfiguration(text: string): ConfigurationFile {
  const value = parseJson(text);
  const shapeIssues = checkSchema(value, fileSchema);
  if (shapeIssues.length) throw new ConfigurationError(shapeIssues);
  const file = value as ConfigurationFile;
  const issues = validateScenario(
    file.configuration,
    file.reference,
    file.assumptions,
  );
  if (file.referenceHash !== referenceHash(file.reference))
    issues.push({
      path: "referenceHash",
      message: "The reference content does not match its SHA-256 hash.",
    });
  if (issues.length) throw new ConfigurationError(issues);
  file.configuration = stripLegacySettings(file.configuration);
  return file;
}

export function parseMerchantReference(
  text: string,
  expectedCountry?: string,
): CountryMerchantReference {
  const value = parseJson(text),
    issues = validateMerchantReference(value, expectedCountry);
  if (issues.length) throw new ConfigurationError(issues);
  return value as CountryMerchantReference;
}

export function exportConfiguration(
  configuration: PersonaConfig,
  reference: CountryMerchantReference,
  assumptions: Assumptions,
  modelId = "custom",
): ConfigurationFile {
  const file: ConfigurationFile = {
    format: "personia.configuration",
    version: 2,
    specificationVersion: "2",
    uiLocale: "en-GB",
    modelId,
    configuration: stripLegacySettings(configuration),
    reference: structuredClone(reference),
    referenceHash: referenceHash(reference),
    assumptions: structuredClone(assumptions),
  };
  const issues = [
    ...checkSchema(file, fileSchema),
    ...validateScenario(file.configuration, file.reference, file.assumptions),
  ];
  if (issues.length) throw new ConfigurationError(issues);
  file.configuration = stripLegacySettings(file.configuration);
  return file;
}

/** Same catalog format accepted by the reference uploader, with optional editor settings. */
export function exportReferenceSettings(
  file: ConfigurationFile,
): CountryMerchantReference {
  const checked = exportConfiguration(
    file.configuration,
    file.reference,
    file.assumptions,
    file.modelId,
  );
  const c = checked.configuration;
  const reference = structuredClone(checked.reference);
  reference.settings = {
    costOfLiving: c.costOfLiving ?? 1,
    style: c.style,
    budgets: structuredClone(c.budgets),
    budgetOverrides: Object.fromEntries(
      Object.entries(monthlyEnvelopes(c, reference, checked.assumptions)).map(
        ([k, v]) => [
          k,
          Math.round((v / (c.costOfLiving ?? 1)) * 10 ** c.currencyDigits) /
            10 ** c.currencyDigits,
        ],
      ),
    ),
    merchantOverrides: {
      ...c.merchantOverrides,
      ...Object.fromEntries(
        merchantRates(c, reference, checked.assumptions).map((r) => [
          `${reference.id}|${c.style}|${r.merchant.id}`,
          {
            mean:
              Math.round(
                (r.mean / (c.costOfLiving ?? 1)) * 10 ** c.currencyDigits,
              ) /
              10 ** c.currencyDigits,
            frequency: r.frequency,
          },
        ]),
      ),
    },
  };
  return parseMerchantReference(JSON.stringify(reference));
}

const kindLabels: Record<string, string> = {
  habit: "life-event",
  event: "planned-event",
  travel: "travel-event",
  transfer: "internal-transfer",
  support: "external-support",
};
const formatLabel = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("-", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
export interface HistoryParty {
  name: string;
  identification:
    | "account-holder"
    | "internal-account"
    | "merchant"
    | "transaction-label";
  id?: string | number;
  accountId?: number;
  accountKey?: string;
  accountName?: string;
  bank?: string;
}
export interface StatementParties {
  beneficiary: HistoryParty;
  counterparty: HistoryParty;
}
export function statementTransaction(
  transaction: Transaction,
  currencyDigits = 2,
) {
  return {
    id: transaction.id,
    accountKey: transaction.accountKey,
    amount: transaction.amount,
    amountMinor: transaction.amountMinor,
    currency: transaction.currency,
    balanceBefore: fromMinor(
      transaction.balanceAfterMinor - transaction.amountMinor,
      currencyDigits,
    ),
    balanceAfter: transaction.balanceAfter,
    balanceBeforeMinor: transaction.balanceAfterMinor - transaction.amountMinor,
    balanceAfterMinor: transaction.balanceAfterMinor,
    text: transaction.label,
    comments: [],
    categoryId: transaction.categoryId,
    date: transaction.date,
    dueDate: transaction.accountingDate,
    originalDate: transaction.date,
    accountId: transaction.accountId,
    detectedCategories: [{ categoryId: transaction.categoryId, score: 1 }],
    merchantId: transaction.merchantId ?? null,
    isFlagged: false,
    counterpartyAccountIdentifier: null,
    parsedData: {
      accountingDate: transaction.accountingDate,
      transactionTypeCode: transaction.amount < 0 ? "DEBIT" : "CREDIT",
      transactionGranularityCode: "TRANSACTION",
      transactionAccounting: transaction.amount < 0 ? "debit" : "credit",
      status: "booked",
      originalText: transaction.label,
      synthetic: true,
      simulationKind:
        transaction.eventId && transaction.simulationKind === "recurring"
          ? "event-recurring"
          : (kindLabels[transaction.simulationKind] ??
            transaction.simulationKind),
      categoryLabel: formatLabel(transaction.category),
      balanceAfter: transaction.balanceAfter,
      ...(transaction.modeId ? { modeId: transaction.modeId } : {}),
      ...(transaction.paymentCardId
        ? { paymentCardId: transaction.paymentCardId }
        : {}),
      ...(transaction.transferId ? { transferId: transaction.transferId } : {}),
      ...(transaction.transferRuleId
        ? { transferRuleId: transaction.transferRuleId }
        : {}),
      ...(transaction.eventId ? { eventId: transaction.eventId } : {}),
      ...(transaction.incomeId ? { incomeId: transaction.incomeId } : {}),
      ...(transaction.loanId ? { loanId: transaction.loanId } : {}),
      ...(transaction.principal !== undefined
        ? { principalRepaid: transaction.principal }
        : {}),
      ...(transaction.interest !== undefined
        ? { interestPaid: transaction.interest }
        : {}),
      ...(transaction.simulationKind === "credit-insurance"
        ? { insurancePaid: Math.abs(transaction.amount) }
        : {}),
      ...(transaction.fx
        ? {
            originalAmount: transaction.fx.originalAmount,
            originalCurrency: transaction.fx.originalCurrency,
            exchangeRate: transaction.fx.exchangeRate,
            exchangeRateConvention: transaction.fx.convention,
            fxFee: transaction.fx.fee,
          }
        : {}),
    },
  };
}

/** Banking statements contain identification and booked operations, never scenario settings or catalogs. */
export function exportHistory(
  result: SimulationResult,
  scenario: ConfigurationFile,
  accountKey?: string,
) {
  const context = exportConfiguration(
    scenario.configuration,
    scenario.reference,
    scenario.assumptions,
    scenario.modelId,
  );
  if (
    result.referenceHash !== context.referenceHash ||
    result.fingerprint !==
      financialFingerprint(
        context.configuration,
        context.reference,
        context.assumptions,
      )
  )
    throw new ConfigurationError([
      {
        path: "history",
        message: "The history is stale. Recalculate before exporting.",
      },
    ]);
  const account = accountKey
    ? result.accounts.find((a) => a.key === accountKey)
    : undefined;
  if (accountKey && !account)
    throw new ConfigurationError([
      {
        path: "account",
        message: "The selected account does not exist in this history.",
      },
    ]);
  const transactions = accountKey
    ? result.transactions.filter((t) => t.accountKey === accountKey)
    : result.transactions;
  const usedMerchants = new Set(
    transactions.map((t) => t.merchantId).filter((id) => id !== undefined),
  );
  const holder = {
    id: context.configuration.id,
    name: context.configuration.name,
    identification: "account-holder" as const,
  };
  const merchants = [
    ...context.reference.merchants,
    ...travelMerchants.filter(
      (travel) => !context.reference.merchants.some((m) => m.id === travel.id),
    ),
  ];
  const merchantById = new Map(
    merchants.map((merchant) => [merchant.id, merchant]),
  );
  const accountByKey = new Map(
    result.accounts.map((a) => {
      const configured = ledgerAccounts(context.configuration).find(
        (c) => c.key === a.key,
      )!;
      return [a.key, { ...a, name: configured.name, bank: configured.bank }];
    }),
  );
  const transfers = new Map<string, Transaction[]>();
  for (const transaction of result.transactions)
    if (transaction.transferId) {
      const pair = transfers.get(transaction.transferId) ?? [];
      pair.push(transaction);
      transfers.set(transaction.transferId, pair);
    }
  const parties = (transaction: Transaction): StatementParties => {
    const transfer = transaction.transferId
      ? transfers
          .get(transaction.transferId)
          ?.find((t) => t.accountKey !== transaction.accountKey)
      : undefined;
    const otherAccount = transfer && accountByKey.get(transfer.accountKey);
    const merchant =
      transaction.merchantId !== undefined
        ? merchantById.get(transaction.merchantId)
        : undefined;
    const counterparty: HistoryParty = otherAccount
      ? {
          ...holder,
          identification: "internal-account",
          accountId: otherAccount.id,
          accountKey: otherAccount.key,
          accountName: otherAccount.name,
          bank: otherAccount.bank,
        }
      : merchant
        ? { id: merchant.id, name: merchant.name, identification: "merchant" }
        : { name: transaction.label, identification: "transaction-label" };
    return {
      counterparty,
      beneficiary: transaction.amountMinor < 0 ? counterparty : holder,
    };
  };
  const selectedAccounts = account ? [account] : result.accounts;
  const openingMinor = selectedAccounts.reduce(
    (sum, a) => sum + toMinor(a.openingBalance, result.currencyDigits),
    0,
  );
  const closingMinor = selectedAccounts.reduce(
    (sum, a) => sum + toMinor(a.closingBalance, result.currencyDigits),
    0,
  );
  const totalMinor = transactions.reduce((sum, t) => sum + t.amountMinor, 0);
  const creditsMinor = transactions
    .filter((t) => t.amountMinor > 0)
    .reduce((sum, t) => sum + t.amountMinor, 0);
  const debitsMinor = transactions
    .filter((t) => t.amountMinor < 0)
    .reduce((sum, t) => sum - t.amountMinor, 0);
  const major = (amount: number) => fromMinor(amount, result.currencyDigits);
  return {
    format: "personia.account-history" as const,
    version: 1 as const,
    data: transactions.map((transaction) => {
      const identified = parties(transaction);
      return {
        ...statementTransaction(transaction, result.currencyDigits),
        ...identified,
        counterpartyAccountIdentifier:
          identified.counterparty.accountId !== undefined
            ? String(identified.counterparty.accountId)
            : null,
      };
    }),
    meta: {
      count: transactions.length,
      totalAmount: major(totalMinor),
      totalAmountMinor: totalMinor,
      synthetic: true,
      engineVersion: result.engineVersion,
      financialFingerprint: result.fingerprint,
      persona: { id: holder.id, name: holder.name },
      currency: result.currency,
      currencyDigits: result.currencyDigits,
      timeZone: context.configuration.timeZone,
      startDate: result.startDate,
      endDate: result.endDate,
      transactionOrder: "reverse-chronological" as const,
      totals: {
        openingBalance: major(openingMinor),
        closingBalance: major(closingMinor),
        credits: major(creditsMinor),
        debits: major(debitsMinor),
        netChange: major(totalMinor),
      },
      scope: account
        ? {
            accountKey,
            accountId: account.id,
            openingBalance: account.openingBalance,
            closingBalance: account.closingBalance,
          }
        : {
            accountKey: null,
            openingBalance: major(openingMinor),
            closingBalance: major(closingMinor),
          },
    },
    included: {
      accounts: selectedAccounts.map((a) => {
        const configured = ledgerAccounts(context.configuration).find(
          (c) => c.key === a.key,
        )!;
        return {
          key: a.key,
          id: a.id,
          name: configured.name,
          bank: configured.bank,
          type: configured.type,
          ...("paymentCardId" in configured
            ? { paymentCardId: configured.paymentCardId }
            : {}),
          ...(configured.product ? { product: configured.product } : {}),
          currency: result.currency,
          currencyDigits: result.currencyDigits,
          holders: [{ id: holder.id, name: holder.name }],
          openingBalance: a.openingBalance,
          openingBalanceMinor: toMinor(a.openingBalance, result.currencyDigits),
          closingBalance: a.closingBalance,
          closingBalanceMinor: toMinor(a.closingBalance, result.currencyDigits),
        };
      }),
      merchants: merchants
        .filter((m) => usedMerchants.has(m.id))
        .map(({ id, name, category }) => ({ id, name, category })),
    },
  };
}

export const exportEventDetails = (result: SimulationResult) => ({
  format: "personia.event-details",
  version: 1,
  engineVersion: result.engineVersion,
  financialFingerprint: result.fingerprint,
  events: result.events,
  loans: result.loans,
});
export const exportDeferredSpending = (result: SimulationResult) => ({
  format: "personia.deferred-spending",
  version: 1,
  engineVersion: result.engineVersion,
  financialFingerprint: result.fingerprint,
  audit: result.audit,
});
