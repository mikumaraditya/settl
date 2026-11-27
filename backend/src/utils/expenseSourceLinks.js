/**
 * Snapshot the expense rows used by the group's simplified-debt calculation.
 * Debt simplification nets all member balances together, so even an expense
 * between other members can affect which payer/receiver edge is produced.
 */
export const getExpenseSourceIds = (expenses) => expenses.map((expense) => expense._id);

export default getExpenseSourceIds;
