/**
 * Simplifies debts among a group.
 *
 * @param {Array} expenses  - Populated expense documents
 * @param {Array} settlements - Existing settlement records (already paid debts).
 *   Each settlement {from, to, amount} reduces the outstanding balance so the
 *   returned transactions represent ONLY what is still owed.
 */
const simplifyDebts = (expenses, settlements = []) => {
  // Step 1: calculate net balance for each person from expenses
  const balance = {};

  expenses.forEach(({ paidBy, splits }) => {
    const payerId = paidBy._id ? paidBy._id.toString() : paidBy.toString();
    if (!balance[payerId]) balance[payerId] = 0;

    // Credit the payer the full expense amount exactly once
    const totalAmount = splits.reduce((sum, s) => sum + s.amount, 0);
    balance[payerId] += totalAmount;

    // Debit each split member their share
    splits.forEach(({ user, amount }) => {
      const userId = user._id ? user._id.toString() : user.toString();
      if (!balance[userId]) balance[userId] = 0;
      balance[userId] -= amount;
    });
  });

  // Step 2: Factor in CONFIRMED settlements so we get REMAINING balances.
  // Only confirmed settlements (receiver approved) actually clear the debt.
  // Pending settlements (awaiting receiver confirmation) are ignored here.
  const confirmedSettlements = settlements.filter(
    (s) => !s.status || s.status === "confirmed",
  );
  confirmedSettlements.forEach(({ from, to, amount }) => {
    const fromId = from._id ? from._id.toString() : from.toString();
    const toId   = to._id   ? to._id.toString()   : to.toString();
    if (!balance[fromId]) balance[fromId] = 0;
    if (!balance[toId])   balance[toId]   = 0;
    balance[fromId] += amount;  // payer's debt reduced
    balance[toId]   -= amount;  // receiver's credit reduced
  });

  // Step 3: separate into creditors (net positive) and debtors (net negative)
  const creditors = [];
  const debtors   = [];

  Object.entries(balance).forEach(([userId, amount]) => {
    const rounded = Math.round(amount);
    if (rounded > 0) creditors.push({ userId, amount: rounded });
    if (rounded < 0) debtors.push({ userId, amount: -rounded });
  });

  // Step 4: sort largest first for optimal greedy matching
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  // Step 5: greedy matching — minimise number of transactions
  const transactions = [];
  let i = 0, j = 0;

  while (i < creditors.length && j < debtors.length) {
    const settle = Math.min(creditors[i].amount, debtors[j].amount);

    transactions.push({
      from:   debtors[j].userId,
      to:     creditors[i].userId,
      amount: settle,
    });

    creditors[i].amount -= settle;
    debtors[j].amount   -= settle;

    if (creditors[i].amount === 0) i++;
    if (debtors[j].amount   === 0) j++;
  }

  return transactions;
};

export default simplifyDebts;

