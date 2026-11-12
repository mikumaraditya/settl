import simplifyDebts, { computeBalances } from "./debtSimplify.js";

const toId = (value) => value?._id?.toString?.() || value?.toString?.() || "";
const toPaise = (value) => Math.round(Number(value || 0) * 100);
const toRupees = (paise) => Math.round(paise) / 100;
const round = (value) => Math.round(Number(value || 0) * 100) / 100;

/**
 * Build an auditable explanation of one member's group balance.
 * The authoritative balance is always produced by Settl's existing
 * computeBalances/simplifyDebts functions; this helper only assembles evidence.
 */
export function buildGroupBalanceEvidence({ group, expenses = [], settlements = [], userId, limit = 30 }) {
  const memberId = userId?.toString();
  if (!memberId) throw new Error("userId is required");

  const confirmedSettlements = settlements.filter(
    (item) => !item.status || item.status === "confirmed",
  );
  const balanceMap = computeBalances(expenses, confirmedSettlements);
  const userBalancePaise = balanceMap[memberId] || 0;
  const simplified = simplifyDebts(expenses, confirmedSettlements);
  const userSimplifiedDebts = simplified
    .filter((item) => item.from === memberId || item.to === memberId)
    .map((item) => ({
      direction: item.from === memberId ? "you_owe" : "owes_you",
      counterpartId: item.from === memberId ? item.to : item.from,
      amount: round(item.amount),
    }));

  const members = new Map((group.members || []).map((member) => {
    const user = member.user || member;
    return [toId(user), user.name || "Group member"];
  }));

  const relevantExpenses = expenses
    .filter((expense) => {
      const isPayer = toId(expense.paidBy) === memberId;
      const hasSplit = (expense.splits || []).some((split) => toId(split.user) === memberId);
      return isPayer || hasSplit;
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  let ledgerImpactPaise = 0;
  const expenseEvidence = relevantExpenses.slice(0, limit).map((expense) => {
    const splits = expense.splits || [];
    const totalSplitPaise = splits.reduce((sum, split) => sum + toPaise(split.amount), 0);
    const mySplit = splits.find((split) => toId(split.user) === memberId);
    const isPayer = toId(expense.paidBy) === memberId;
    const impactPaise = (isPayer ? totalSplitPaise : 0) - (mySplit ? toPaise(mySplit.amount) : 0);
    ledgerImpactPaise += impactPaise;

    return {
      expenseId: expense._id?.toString?.() || null,
      date: expense.createdAt || null,
      description: expense.description || "Shared expense",
      category: expense.category || "other",
      fullGroupBill: round(expense.amount),
      splitTotal: toRupees(totalSplitPaise),
      paidBy: members.get(toId(expense.paidBy)) || expense.paidBy?.name || "Unknown",
      yourShare: mySplit ? round(mySplit.amount) : 0,
      yourBalanceImpact: toRupees(impactPaise),
      currency: "INR",
    };
  });

  const relevantSettlements = settlements
    .filter((settlement) => toId(settlement.from) === memberId || toId(settlement.to) === memberId)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  let confirmedSettlementImpactPaise = 0;
  const settlementEvidence = relevantSettlements.slice(0, limit).map((settlement) => {
    const isFromUser = toId(settlement.from) === memberId;
    const isConfirmed = !settlement.status || settlement.status === "confirmed";
    const impactPaise = isConfirmed
      ? (isFromUser ? toPaise(settlement.amount) : -toPaise(settlement.amount))
      : 0;
    confirmedSettlementImpactPaise += impactPaise;

    return {
      settlementId: settlement._id?.toString?.() || null,
      date: settlement.createdAt || null,
      from: members.get(toId(settlement.from)) || settlement.from?.name || "Unknown",
      to: members.get(toId(settlement.to)) || settlement.to?.name || "Unknown",
      amount: round(settlement.amount),
      status: settlement.status || "confirmed",
      affectsCurrentBalance: isConfirmed,
      yourBalanceImpact: toRupees(impactPaise),
      currency: "INR",
    };
  });

  const hasMoreExpenses = relevantExpenses.length > limit;
  const hasMoreSettlements = relevantSettlements.length > limit;
  const ledgerBalancePaise = ledgerImpactPaise + confirmedSettlementImpactPaise;
  const evidenceMatchesBalance = ledgerBalancePaise === userBalancePaise;

  return {
    groupId: group._id?.toString?.() || null,
    groupName: group.name || "Group",
    currency: "INR",
    balanceSource: "Settl computeBalances + simplifyDebts",
    userNetBalance: toRupees(userBalancePaise),
    balanceDirection: userBalancePaise > 0 ? "owes_you" : userBalancePaise < 0 ? "you_owe" : "settled",
    simplifiedDebts: userSimplifiedDebts,
    expenseEvidence: expenseEvidence.map((item) => ({
      ...item,
      paidByUser: item.paidBy === "You",
    })),
    settlementEvidence,
    reconciliation: {
      computedBalance: toRupees(userBalancePaise),
      evidenceBalance: toRupees(ledgerBalancePaise),
      difference: toRupees(userBalancePaise - ledgerBalancePaise),
      matches: evidenceMatchesBalance,
      explanation: evidenceMatchesBalance
        ? "The visible expense and confirmed-settlement evidence reconciles to Settl's authoritative balance."
        : "The evidence rows do not reconcile to Settl's authoritative balance. Do not infer a cause; report that further investigation is required.",
    },
    hasMoreExpenses,
    hasMoreSettlements,
    evidenceIsPartial: hasMoreExpenses || hasMoreSettlements,
    accountingNotes: [
      "Only confirmed settlements reduce balances. Pending, cancelled, expired, and rejected settlements do not reduce the current balance.",
      "A positive userNetBalance means other members owe the user; a negative balance means the user owes other members.",
      "Simplified debts are net group obligations, not necessarily one-to-one links to a specific original expense.",
      "The current data model has Expense and Settlement records; no separate manual-adjustment record is included in this evidence.",
    ],
  };
}

export default buildGroupBalanceEvidence;
