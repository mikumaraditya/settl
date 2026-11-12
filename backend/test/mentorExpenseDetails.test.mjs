import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import User from "../src/models/User.js";
import Group from "../src/models/Group.js";
import Expense from "../src/models/Expense.js";
import UserFinancialProfile from "../src/models/UserFinancialProfile.js";
import { executeMentorTool } from "../src/services/mentorTools.js";
import { getTestDbConfig } from "./testDbHelper.mjs";

describe("Finn individual expense details tool", () => {
  let user;
  let otherUser;
  let group;

  before(async () => {
    const { testUri } = getTestDbConfig();
    await mongoose.connect(testUri);
    await Promise.all([
      User.init(),
      Group.init(),
      Expense.init(),
      UserFinancialProfile.init(),
    ]);
    const suffix = Date.now();
    [user, otherUser] = await User.create([
      { name: "Expense Details User", email: `expense-details-${suffix}@example.com`, password: "password123", isEmailVerified: true },
      { name: "Other Group Member", email: `expense-other-${suffix}@example.com`, password: "password123", isEmailVerified: true },
    ]);
    group = await Group.create({
      name: "Test Goa Trip",
      createdBy: user._id,
      members: [{ user: user._id, role: "admin" }, { user: otherUser._id, role: "member" }],
    });
    await Expense.create({
      description: "Dinner at beach cafe",
      amount: 1200,
      paidBy: otherUser._id,
      group: group._id,
      category: "food",
      splits: [
        { user: user._id, amount: 500 },
        { user: otherUser._id, amount: 700 },
      ],
      createdAt: new Date(),
    });
  });

  after(async () => {
    if (group) await Expense.deleteMany({ group: group._id });
    if (user || otherUser) {
      const ids = [user?._id, otherUser?._id].filter(Boolean);
      await Promise.all([
        Group.deleteMany({ _id: group?._id }),
        UserFinancialProfile.deleteMany({ user: { $in: ids } }),
        User.deleteMany({ _id: { $in: ids } }),
      ]);
    }
    await mongoose.disconnect();
  });

  it("denies access when mentoring consent is not enabled", async () => {
    const result = await executeMentorTool("getExpenseDetails", { months: 3 }, user._id.toString());
    assert.equal(result.requiresConsent, true);
    assert.equal(result.consentGranted, false);
  });

  it("returns transaction details and only the authenticated user's share after consent", async () => {
    await UserFinancialProfile.create({
      user: user._id,
      consentToUseForMentor: true,
    });

    const result = await executeMentorTool(
      "getExpenseDetails",
      { months: 3, category: "food", limit: 10 },
      user._id.toString()
    );

    assert.equal(result.totalMatchingExpenses, 1);
    assert.equal(result.returnedExpenses, 1);
    assert.equal(result.expenses[0].description.untrustedText, "Dinner at beach cafe");
    assert.equal(result.expenses[0].groupName.untrustedText, "Test Goa Trip");
    assert.equal(result.expenses[0].category, "food");
    assert.equal(result.expenses[0].totalGroupExpenseAmount, 1200);
    assert.equal(result.expenses[0].yourShare, 500);
    assert.equal("otherMemberShare" in result.expenses[0], false);
  });

  it("rejects invalid category filters", async () => {
    await assert.rejects(
      () => executeMentorTool("getExpenseDetails", { category: "salary" }, user._id.toString()),
      /not an allowed value/
    );
  });
});
