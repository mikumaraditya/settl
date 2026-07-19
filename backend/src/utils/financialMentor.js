const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function computeMentorReport(settlements = [], personalExpenses = [], rejections = []) {
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
  rejections.forEach(r => {
    const d = new Date(r.createdAt);
    if (firstTimeInit || d > latestDate) {
      latestDate = d;
      firstTimeInit = false;
    }
  });
  const refDate = latestDate;

  if (hasSettlements) {
    // 2. Follow-Through: confirmed settlements / total settlements, weighted by recency & staleness.
    //
    // Interaction of Recency Weight and Staleness Credit:
    // - Recency weighting (weight: 1.0 / 0.5 / 0.2) controls the MAGNITUDE of a transaction's overall impact on the followThrough rating.
    // - Staleness credit (credit: 1.0 -> 0.0) controls the VALUE/CREDIT of unconfirmed settlements based on how long they have been pending.
    //
    // These two axes compose without double-discounting anomalies:
    // For example, if a settlement is 100 days old and still pending:
    // - Recency weight is 0.2 (low overall impact).
    // - Staleness credit factor is 0.0 (treated as fully unconfirmed/unpaid).
    // - Contribution to total sum is 0.2, and to confirmed sum is 0.2 * 0 = 0.
    // This correctly drags the score down, but because its recency weight is small (0.2), it has a smaller drag on the ratio than a fresh unconfirmed settlement.
    // This allows old behavior to decay gracefully while still correctly penalizing unresolved status.
    let weightedConfirmedSum = 0;
    let weightedTotalSum = 0;

    settlements.forEach((s) => {
      const ageDays = Math.max(0, (refDate - new Date(s.createdAt)) / 864e5);
      
      // A. Recency weight:
      let weight = 1.0;
      if (ageDays > 90) {
        weight = 0.2;
      } else if (ageDays > 30) {
        weight = 0.5;
      }

      // B. Staleness credit factor for pending settlements:
      // - Confirmed: 100% credit
      // - Pending < 3 days: 100% credit (grace period, neutral)
      // - Pending 3-14 days: scales linearly from 100% down to 0% credit
      // - Pending > 14 days: 0% credit (full penalty)
      let credit = 0.0;
      const isConfirmed = !s.status || s.status === "confirmed";
      if (isConfirmed) {
        credit = 1.0;
      } else {
        if (ageDays < 3) {
          credit = 1.0;
        } else if (ageDays <= 14) {
          credit = 1.0 - (ageDays - 3) / 11;
        } else {
          credit = 0.0;
        }
      }

      weightedTotalSum += weight;
      weightedConfirmedSum += weight * credit;
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
  let equalSplitCount = 0;
  let unequalSplitCount = 0;

  personalExpenses.forEach((expense) => {
    const month = new Date(expense.createdAt).toISOString().slice(0, 7);
    const isEqual = !expense.splitType || expense.splitType === "equal";
    
    if (isEqual) {
      equalSplitCount++;
    } else {
      unequalSplitCount++;
    }

    // Weight equal splits at 0.5x (mostly reflect group spending choices), and exact/percentage at 1.0x (reflect direct individual behavior)
    const splitWeight = isEqual ? 0.5 : 1.0;
    const weightedShare = expense.personalShare * splitWeight;

    monthlyTotals[month] = (monthlyTotals[month] || 0) + weightedShare;
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

  let consistency = clamp(100 * (1 - coefficientOfVariation), 0, 100);

  // Confidence reduction mechanism for equal-split-heavy datasets:
  // If user splits are mostly equal, scale consistency by confidence multiplier [0.6 - 1.0]
  const totalExpensesCount = equalSplitCount + unequalSplitCount;
  const confidenceMultiplier = totalExpensesCount > 0
    ? (0.6 + 0.4 * (unequalSplitCount / totalExpensesCount))
    : 1.0;
  consistency = clamp(consistency * confidenceMultiplier, 0, 100);

  // 5. Reliability Incidents (rejection penalty by receivers)
  // Recency weighted: rejections from <= 30 days have weight 1.0, 30-90 days weight 0.5, >90 days weight 0.2.
  let weightedRejectionsCount = 0;
  rejections.forEach((r) => {
    const ageDays = Math.max(0, (refDate - new Date(r.createdAt)) / 864e5);
    let weight = 1.0;
    if (ageDays > 90) {
      weight = 0.2;
    } else if (ageDays > 30) {
      weight = 0.5;
    }
    weightedRejectionsCount += weight;
  });

  // Diminishing returns penalty formula: max 50 points penalty
  const penaltyPoints = Math.round(50 * (1 - Math.exp(-0.4 * weightedRejectionsCount)));
  const reliabilityScore = Math.max(0, 100 - penaltyPoints);

  // Rebalanced score formula (total = 1.0):
  // - Settlement Follow-Through (reliability): 40% (direct reliability/honesty behavior)
  // - Settlement Initiative (proactiveness): 40% (direct action-based behavior)
  // - Spending Consistency (predictability): 20% (budget-predictability only; weighted lower)
  // Applied rejections penalty (diminishing return) after the three-signal calculation.
  let score = hasSettlements
    ? Math.round(0.40 * followThrough + 0.40 * settlementInitiative + 0.20 * consistency)
    : Math.round(consistency);

  if (hasSettlements) {
    score = Math.max(0, score - penaltyPoints);
  }

  score = clamp(score, 0, 100);

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

  // Determine low-confidence status for equal-split-heavy data
  const isLowConfidence = totalExpensesCount > 0 && (unequalSplitCount / totalExpensesCount) < 0.3;
  const consistencyDescription = isLowConfidence
    ? "How steady your shared expenses are month-to-month. (Note: Low confidence as your expenses are mostly equal-split)"
    : "How steady your shared expenses are month-to-month. (Confidence is high based on individual spending splits)";

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
        description: consistencyDescription
      },
      {
        key: "reliabilityIncidents",
        label: "Reliability Incidents",
        value: Math.round(reliabilityScore),
        description: "Settlement claims that were rejected by the receiver as not actually received."
      }
    ];
  } else {
    signalBreakdown = [
      {
        key: "consistency",
        label: "Spending Consistency",
        value: Math.round(consistency),
        description: consistencyDescription
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
      reliabilityIncidents: Math.round(reliabilityScore),
      confirmedSettlements: hasSettlements ? settlements.filter((s) => !s.status || s.status === "confirmed").length : 0,
      totalSettlements: settlements.length,
      rejectionsCount: rejections.length
    }
  };
}
