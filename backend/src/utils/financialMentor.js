const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function computeMentorReport(settlements = [], personalExpenses = []) {
  const hasSettlements = settlements.length >= 1;
  let followThrough = 0;
  let settlementInitiative = 0;
  let averageInitiativeHours = 14 * 24;

  // 1. Determine reference date for recency calculations (latest transaction date in the dataset, fallback to today)
  let latestDate = new Date();
  let firstTimeInit = true;
  settlements.forEach(s => {
    const d = new Date(s.createdAt);
    if (firstTimeInit || d > latestDate) {
      latestDate = d;
      firstTimeInit = false;
    }
  });
  personalExpenses.forEach(e => {
    const d = new Date(e.createdAt);
    if (firstTimeInit || d > latestDate) {
      latestDate = d;
      firstTimeInit = false;
    }
  });
  const refDate = latestDate;

  if (hasSettlements) {
    // 2. Follow-Through: confirmed settlements / total settlements, weighted by recency
    // Recency weighting step decay:
    // - Created <= 30 days ago: weight 1.0
    // - 30 to 90 days ago: weight 0.5
    // - > 90 days ago: weight 0.2
    let weightedConfirmedSum = 0;
    let weightedTotalSum = 0;

    settlements.forEach((s) => {
      const ageDays = Math.max(0, (refDate - new Date(s.createdAt)) / 864e5);
      let weight = 1.0;
      if (ageDays > 90) {
        weight = 0.2;
      } else if (ageDays > 30) {
        weight = 0.5;
      }

      const isConfirmed = !s.status || s.status === "confirmed";
      weightedTotalSum += weight;
      if (isConfirmed) {
        weightedConfirmedSum += weight;
      }
    });

    followThrough = weightedTotalSum > 0 ? (weightedConfirmedSum / weightedTotalSum) * 100 : 100;

    // 3. Settlement Initiative: average time between a group's prior expense and the settlement request
    // Recency weighted similarly to followThrough.
    let weightedGapSum = 0;
    let weightedInitiativeSum = 0;

    settlements.forEach((s) => {
      const settlementGroup = s.group ? s.group.toString() : "";
      const settlementTime = new Date(s.createdAt);

      // Find prior expenses in the same group (created at or before the settlement)
      const priorExpenses = personalExpenses.filter((e) => {
        const expenseGroup = e.group ? e.group.toString() : "";
        return expenseGroup === settlementGroup && new Date(e.createdAt) <= settlementTime;
      });

      if (priorExpenses.length > 0) {
        // Find most recent prior expense
        const mostRecentExpense = priorExpenses.reduce((latest, current) => {
          return new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest;
        }, priorExpenses[0]);

        const gapHours = Math.max(0, (settlementTime - new Date(mostRecentExpense.createdAt)) / 36e5);

        // Recency weight for this settlement
        const ageDays = Math.max(0, (refDate - settlementTime) / 864e5);
        let weight = 1.0;
        if (ageDays > 90) {
          weight = 0.2;
        } else if (ageDays > 30) {
          weight = 0.5;
        }

        weightedGapSum += weight * gapHours;
        weightedInitiativeSum += weight;
      }
    });

    if (weightedInitiativeSum > 0) {
      averageInitiativeHours = weightedGapSum / weightedInitiativeSum;
      settlementInitiative = clamp(100 - (averageInitiativeHours / (14 * 24)) * 100, 0, 100);
    } else {
      // Handle edge case where no prior expense exists in any group cleanly (default to 100)
      settlementInitiative = 100;
      averageInitiativeHours = 0;
    }
  }

  // 4. Spending Consistency: recency-weighted monthly variance
  const refYear = refDate.getFullYear();
  const refMonth = refDate.getMonth();

  const monthlyTotals = {};
  personalExpenses.forEach((expense) => {
    const month = new Date(expense.createdAt).toISOString().slice(0, 7);
    monthlyTotals[month] = (monthlyTotals[month] || 0) + expense.personalShare;
  });

  const monthsData = Object.entries(monthlyTotals).map(([monthStr, total]) => {
    const [year, month] = monthStr.split("-").map(Number);
    const diffMonths = (refYear - year) * 12 + (refMonth - (month - 1));
    let weight = 1.0;
    if (diffMonths > 2) {
      weight = 0.3;
    } else if (diffMonths > 1) {
      weight = 0.6;
    }
    return { total, weight };
  });

  const sumWeights = monthsData.reduce((sum, m) => sum + m.weight, 0);
  const weightedMean = sumWeights > 0
    ? monthsData.reduce((sum, m) => sum + m.weight * m.total, 0) / sumWeights
    : 0;

  let weightedVariance = 0;
  if (sumWeights > 0) {
    weightedVariance = monthsData.reduce((sum, m) => sum + m.weight * ((m.total - weightedMean) ** 2), 0) / sumWeights;
  }
  const weightedStdDev = Math.sqrt(weightedVariance);
  const coefficientOfVariation = weightedMean
    ? weightedStdDev / weightedMean
    : 1;
  const consistency = clamp(100 * (1 - coefficientOfVariation), 0, 100);

  // Rebalanced score formula:
  // - Settlement Follow-Through (honesty/reliability): 40%
  // - Settlement Initiative (speed/proactiveness): 35%
  // - Spending Consistency (budget predictability): 25%
  const score = hasSettlements
    ? Math.round(0.40 * followThrough + 0.35 * settlementInitiative + 0.25 * consistency)
    : Math.round(consistency);

  let scoreBand = "At Risk";
  let scoreBandSummary = "Several unresolved balances or delayed settlement initiatives indicate low trust reliability.";
  
  if (score >= 80) {
    scoreBand = "Excellent";
    scoreBandSummary = "Highly reliable. You clear your debts instantly and follow through on settlements with outstanding consistency.";
  } else if (score >= 60) {
    scoreBand = "Good";
    scoreBandSummary = "Good trust record, but there is room to improve settlement initiative speed or payment consistency.";
  } else if (score >= 40) {
    scoreBand = "Needs Attention";
    scoreBandSummary = "Some delays in taking initiative to clear debts or inconsistent follow-through on settlement requests.";
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
        key: "settlementInitiative",
        label: "Settlement Initiative",
        value: Math.round(settlementInitiative),
        description: "How quickly you clear your share after shared spending happens."
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
      averageInitiativeHours: Math.round(averageInitiativeHours * 100) / 100,
      settlementInitiative: Math.round(settlementInitiative),
      consistency: Math.round(consistency),
      confirmedSettlements: hasSettlements ? settlements.filter((s) => !s.status || s.status === "confirmed").length : 0,
      totalSettlements: settlements.length,
    }
  };
}
