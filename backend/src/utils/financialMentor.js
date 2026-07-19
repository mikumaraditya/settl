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
    // Only count expenses where user has a personal split share for consistency variance
    if (expense.personalShare <= 0) return;

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

  // 4b. Upfront Contribution Score: recency-weighted upfront payment ratio
  let weightedPaidSum = 0;
  let weightedTotalInvolvedSum = 0;

  personalExpenses.forEach((expense) => {
    const ageDays = Math.max(0, (refDate - new Date(expense.createdAt)) / 864e5);
    let weight = 1.0;
    if (ageDays > 90) {
      weight = 0.2;
    } else if (ageDays > 30) {
      weight = 0.5;
    }

    weightedTotalInvolvedSum += weight;
    if (expense.isPaidByUser) {
      weightedPaidSum += weight;
    }
  });

  const contributionScore = weightedTotalInvolvedSum > 0
    ? (weightedPaidSum / weightedTotalInvolvedSum) * 100
    : 0;
  const contribution = clamp(contributionScore, 0, 100);

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

  // Rebalanced score formula:
  const DIMENSION_CONFIG = {
    repaymentReliability: { weight: 0.50, minSettlements: 2 },
    contribution:         { weight: 0.35, minInvolvedExpenses: 3 },
    consistency:          { weight: 0.15, minActiveMonths: 3 },
  };

  const activeMonthsCount = Object.keys(monthlyTotals).length;
  const repaymentQualifies = settlements.length >= DIMENSION_CONFIG.repaymentReliability.minSettlements;
  const contributionQualifies = personalExpenses.length >= DIMENSION_CONFIG.contribution.minInvolvedExpenses;
  const consistencyQualifies = activeMonthsCount >= DIMENSION_CONFIG.consistency.minActiveMonths;

  const dimensions = {
    repaymentReliability: repaymentQualifies ? clamp(0.6 * followThrough + 0.4 * settlementInitiative, 0, 100) : null,
    contribution: contributionQualifies ? contribution : null,
    consistency: consistencyQualifies ? consistency : null,
  };

  const qualifying = Object.entries(dimensions).filter(([_, v]) => v !== null);

  let rawScore = 100;
  if (qualifying.length > 0) {
    const totalWeight = qualifying.reduce((sum, [key]) => sum + DIMENSION_CONFIG[key].weight, 0);
    rawScore = qualifying.reduce((sum, [key, value]) => {
      return sum + (DIMENSION_CONFIG[key].weight / totalWeight) * value;
    }, 0);
  }

  let score = rawScore;
  if (weightedRejectionsCount > 0) {
    score = Math.max(0, score - penaltyPoints);
  }
  score = clamp(Math.round(score), 0, 100);

  let scoreBand = "New";
  let scoreBandSummary = "You're starting at a perfect trust score. It'll update automatically as you add expenses and settle up.";

  if (qualifying.length > 0 || weightedRejectionsCount > 0) {
    scoreBand = "At Risk";
    scoreBandSummary = "Several unresolved balances or delayed payment initiatives indicate low trust reliability.";
    if (score >= 80) {
      scoreBand = "Excellent";
      scoreBandSummary = "Highly reliable. You clear your debts instantly and follow through on payments with outstanding consistency.";
    } else if (score >= 60) {
      scoreBand = "Good";
      scoreBandSummary = "Good trust record, but there is room to improve payment speed or consistency.";
    } else if (score >= 40) {
      scoreBand = "Needs Attention";
      scoreBandSummary = "Some delays in taking initiative to pay back debts or inconsistent follow-through on payment requests.";
    }
  }

  // Determine low-confidence status for equal-split-heavy data
  const isLowConfidence = totalExpensesCount > 0 && (unequalSplitCount / totalExpensesCount) < 0.3;
  const consistencyDescription = isLowConfidence
    ? "How steady your shared expenses are month-to-month. (Note: Low confidence as your expenses are mostly equal-split)"
    : "How steady your shared expenses are month-to-month. (Confidence is high based on individual spending splits)";

  const signalBreakdown = [];
  if (qualifying.length > 0) {
    const totalQualifyingWeight = qualifying.reduce((sum, [key]) => sum + DIMENSION_CONFIG[key].weight, 0);

    if (repaymentQualifies) {
      const normWeight = DIMENSION_CONFIG.repaymentReliability.weight / totalQualifyingWeight;
      signalBreakdown.push({
        key: "repaymentReliability",
        label: "Repayment Reliability",
        value: Math.round(dimensions.repaymentReliability),
        weight: Math.round(normWeight * 100) / 100,
        description: "Composite score of follow-through and payment speed when you owe money."
      });
    }

    if (contributionQualifies) {
      const normWeight = DIMENSION_CONFIG.contribution.weight / totalQualifyingWeight;
      signalBreakdown.push({
        key: "contribution",
        label: "Contribution",
        value: Math.round(dimensions.contribution),
        weight: Math.round(normWeight * 100) / 100,
        description: "How often you pay for shared expenses upfront."
      });
    }

    if (consistencyQualifies) {
      const normWeight = DIMENSION_CONFIG.consistency.weight / totalQualifyingWeight;
      signalBreakdown.push({
        key: "consistency",
        label: "Spending Consistency",
        value: Math.round(dimensions.consistency),
        weight: Math.round(normWeight * 100) / 100,
        description: consistencyDescription
      });
    }

    // Find weakest signal(s) - lowest value among the breakdown items
    const minValue = Math.min(...signalBreakdown.map(s => s.value));
    signalBreakdown.forEach(s => {
      s.isWeakest = s.value === minValue;
    });
  }

  // Add reliabilityIncidents as a separate clearly-flagged override entry (not blended into the same list/weakest calculation)
  signalBreakdown.push({
    key: "reliabilityIncidents",
    label: "Reliability Incidents (Override Penalty)",
    value: Math.round(reliabilityScore),
    penaltyApplied: penaltyPoints,
    description: "Settlement claims that were rejected by the receiver as not actually received."
  });

  // Compute biggest lever (primaryFocus)
  let primaryFocus = "settlement_speed";
  if (qualifying.length > 0) {
    let maxGain = -1;
    let bestKey = "";

    qualifying.forEach(([key, value]) => {
      const weight = DIMENSION_CONFIG[key].weight;
      const gain = (100 - value) * weight;
      if (gain > maxGain) {
        maxGain = gain;
        bestKey = key;
      }
    });

    if (bestKey === "repaymentReliability") {
      if (followThrough <= settlementInitiative) {
        primaryFocus = "settlement_follow_through";
      } else {
        primaryFocus = "settlement_speed";
      }
    } else if (bestKey === "contribution") {
      primaryFocus = "upfront_contribution";
    } else if (bestKey === "consistency") {
      primaryFocus = "spending_consistency";
    }
  }

  return {
    score,
    scoreBand,
    scoreBandSummary,
    signalBreakdown,
    primaryFocus,
    signals: {
      followThrough: Math.round(followThrough),
      averageInitiativeHours: Math.round(averageInitiativeHours * 100) / 100,
      settlementInitiative: Math.round(settlementInitiative),
      consistency: Math.round(consistency),
      contribution: Math.round(contribution),
      reliabilityIncidents: Math.round(reliabilityScore),
      confirmedSettlements: hasSettlements ? settlements.filter((s) => !s.status || s.status === "confirmed").length : 0,
      totalSettlements: settlements.length,
      rejectionsCount: rejections.length
    }
  };
}

/**
 * computeWhatIfProjection — re-runs computeMentorReport with one hypothetical improvement
 * applied to the weakest qualifying dimension to show the user a concrete score incentive.
 *
 * @param {Array} settlements  - same settlements passed to the real report
 * @param {Array} personalExpenses - same personalExpenses
 * @param {Array} rejections   - same rejections
 * @param {string} weakestDimension - "repaymentReliability" | "contribution" | "consistency"
 * @param {number} currentScore - real score, used to ensure we never project lower
 * @returns {{ dimension: string, projectedScore: number, delta: number } | null}
 */
export function computeWhatIfProjection(settlements, personalExpenses, rejections, weakestDimension, currentScore) {
  try {
    if (weakestDimension === "repaymentReliability") {
      // Hypothetical: user settles within 3 days (72 hours) on every debt instead of their real average.
      const TARGET_HOURS = 72; // 3 days
      const modifiedSettlements = settlements.map(s => ({
        ...s,
        // Shift createdAt forward so the gap from the prior expense becomes exactly TARGET_HOURS.
        // We do this by computing a synthetic updatedAt, keeping status as "confirmed" so
        // follow-through = 100 in the hypothetical.
        _whatIfCreatedAt: s.createdAt,
        status: "confirmed",
      }));

      // To simulate faster initiative without touching the real expense dates, we inject
      // fake settlements whose createdAt is TARGET_HOURS after the most-recent expense they'd match.
      // Simpler approach: replace each settlement's createdAt to be TARGET_HOURS after the
      // earliest expense in the same calendar month.
      const sortedExpenseDates = personalExpenses
        .map(e => new Date(e.createdAt))
        .sort((a, b) => a - b);

      const hypotheticalSettlements = modifiedSettlements.map((s, i) => {
        const refExpense = sortedExpenseDates[Math.min(i, sortedExpenseDates.length - 1)];
        const hypotheticalCreatedAt = refExpense
          ? new Date(refExpense.getTime() + TARGET_HOURS * 60 * 60 * 1000)
          : s.createdAt;
        return { ...s, createdAt: hypotheticalCreatedAt, status: "confirmed" };
      });

      const projected = computeMentorReport(hypotheticalSettlements, personalExpenses, rejections);
      const projectedScore = Math.max(currentScore, projected.score);
      return {
        dimension: "repaymentReliability",
        targetDays: 3,
        projectedScore,
        delta: projectedScore - currentScore,
      };
    }

    if (weakestDimension === "contribution") {
      // Hypothetical: user fronts +15% more expenses upfront (capped at 100%).
      const totalExpenses = personalExpenses.length;
      const currentPaidCount = personalExpenses.filter(e => e.isPaidByUser).length;
      const currentRatio = totalExpenses > 0 ? currentPaidCount / totalExpenses : 0;
      const hypotheticalRatio = Math.min(1.0, currentRatio + 0.15);
      const hypotheticalPaidCount = Math.round(hypotheticalRatio * totalExpenses);

      // Flip the isPaidByUser flag on the unpaid expenses (earliest-first) to reach the target count
      let flipped = 0;
      const modifiedExpenses = personalExpenses.map(e => {
        if (!e.isPaidByUser && flipped < hypotheticalPaidCount - currentPaidCount) {
          flipped++;
          return { ...e, isPaidByUser: true };
        }
        return e;
      });

      const projected = computeMentorReport(settlements, modifiedExpenses, rejections);
      const projectedScore = Math.max(currentScore, projected.score);
      return {
        dimension: "contribution",
        targetRatioIncrease: 15,
        projectedScore,
        delta: projectedScore - currentScore,
      };
    }

    // "consistency" — skip (too hard to simulate meaningfully)
    return null;
  } catch {
    return null;
  }
}
