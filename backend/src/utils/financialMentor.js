const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function computeMentorReport(settlements = [], personalExpenses = []) {
  const hasSettlements = settlements.length >= 1;
  let followThrough = 0;
  let promptness = 0;
  let averageConfirmationHours = 14 * 24;

  if (hasSettlements) {
    const confirmed = settlements.filter((settlement) => !settlement.status || settlement.status === "confirmed");
    const confirmationHours = confirmed.map((settlement) => Math.max(0, (new Date(settlement.updatedAt) - new Date(settlement.createdAt)) / 36e5));
    averageConfirmationHours = confirmationHours.length
      ? confirmationHours.reduce((sum, hours) => sum + hours, 0) / confirmationHours.length
      : 14 * 24;
    followThrough = (confirmed.length / settlements.length) * 100;
    promptness = clamp(100 - (averageConfirmationHours / (14 * 24)) * 100, 0, 100);
  }

  const monthlyTotals = {};
  personalExpenses.forEach((expense) => {
    const month = new Date(expense.createdAt).toISOString().slice(0, 7);
    monthlyTotals[month] = (monthlyTotals[month] || 0) + expense.personalShare;
  });
  const monthlyValues = Object.values(monthlyTotals);
  const monthlyMean = monthlyValues.reduce((sum, value) => sum + value, 0) / monthlyValues.length;
  const coefficientOfVariation = monthlyMean
    ? Math.sqrt(monthlyValues.reduce((sum, value) => sum + (value - monthlyMean) ** 2, 0) / monthlyValues.length) / monthlyMean
    : 1;
  const consistency = clamp(100 * (1 - coefficientOfVariation), 0, 100);

  const score = hasSettlements
    ? Math.round(0.35 * followThrough + 0.30 * promptness + 0.35 * consistency)
    : Math.round(consistency);

  let scoreBand = "At Risk";
  let scoreBandSummary = "Several unresolved balances or highly erratic spending habits require immediate attention.";
  
  if (score >= 80) {
    scoreBand = "Excellent";
    scoreBandSummary = "Your shared finances are in great shape. You follow through on settlements instantly and maintain consistent spending.";
  } else if (score >= 60) {
    scoreBand = "Good";
    scoreBandSummary = "You have healthy habits, but there is room to improve settlement promptness or consistency.";
  } else if (score >= 40) {
    scoreBand = "Needs Attention";
    scoreBandSummary = "Your score indicates some delays in settling debts or inconsistent spending patterns.";
  }

  let signalBreakdown = [];
  if (hasSettlements) {
    signalBreakdown = [
      {
        key: "followThrough",
        label: "Settlement Follow-Through",
        value: Math.round(followThrough),
        description: "Percentage of requested settlements you have paid."
      },
      {
        key: "promptness",
        label: "Payment Promptness",
        value: Math.round(promptness),
        description: "How quickly you confirm or complete settlements."
      },
      {
        key: "consistency",
        label: "Spending Consistency",
        value: Math.round(consistency),
        description: "How steady your shared expenses are month-to-month."
      }
    ];
  } else {
    signalBreakdown = [
      {
        key: "consistency",
        label: "Spending Consistency",
        value: Math.round(consistency),
        description: "How steady your shared expenses are month-to-month."
      }
    ];
  }

  // Find weakest signal(s) - lowest value among the breakdown items
  const minValue = Math.min(...signalBreakdown.map(s => s.value));
  signalBreakdown.forEach(s => {
    s.isWeakest = s.value === minValue;
  });

  return {
    score,
    scoreBand,
    scoreBandSummary,
    signalBreakdown,
    signals: {
      followThrough: Math.round(followThrough),
      averageConfirmationHours: Math.round(averageConfirmationHours * 100) / 100,
      promptness: Math.round(promptness),
      consistency: Math.round(consistency),
      confirmedSettlements: hasSettlements ? settlements.filter((s) => !s.status || s.status === "confirmed").length : 0,
      totalSettlements: settlements.length,
    }
  };
}
