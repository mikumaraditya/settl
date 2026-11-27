const getId = (value) => value?._id?.toString?.() || value?.toString?.() || null;

/**
 * Capture the expense rows that contribute to either participant's net
 * position when a settlement or schedule is created. Other members' unrelated
 * expenses are not included in this snapshot.
 */
export const getExpenseSourceIds = (expenses, fromId, toId) => {
  const participants = new Set([String(fromId), String(toId)]);
  return expenses
    .filter((expense) => {
      if (participants.has(getId(expense.paidBy))) return true;
      return (expense.splits || []).some((split) => participants.has(getId(split.user)));
    })
    .map((expense) => expense._id);
};

export default getExpenseSourceIds;
