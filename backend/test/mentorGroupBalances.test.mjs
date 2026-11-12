import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import User from "../src/models/User.js";
import UserFinancialProfile from "../src/models/UserFinancialProfile.js";
import Group from "../src/models/Group.js";
import Expense from "../src/models/Expense.js";
import { executeMentorTool, MENTOR_TOOLS_REGISTRY } from "../src/services/mentorTools.js";
import { getTestDbConfig } from "./testDbHelper.mjs";

test("Group schema indexes member lookups", () => {
  const hasMembershipIndex = Group.schema.indexes().some(
    ([keys]) => keys["members.user"] === 1,
  );
  assert.equal(hasMembershipIndex, true, "Group membership queries should have a members.user index");
});

test("getGroupBalances filters to the named group without exposing non-member groups", async () => {
  const { testUri } = getTestDbConfig();
  await mongoose.connect(testUri);

  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  let user;
  let friend;
  let otherUser;
  const groupIds = [];

  try {
    [user, friend, otherUser] = await User.create([
      { name: "Balance Test User", email: `balance-user-${suffix}@example.com`, password: "password123" },
      { name: "Balance Test Friend", email: `balance-friend-${suffix}@example.com`, password: "password123" },
      { name: "Non Member", email: `balance-other-${suffix}@example.com`, password: "password123" },
    ]);

    await UserFinancialProfile.create({ user: user._id, consentToUseForMentor: true });

    const [goaGroup, roomiesGroup, privateGroup] = await Group.create([
      { name: "Goa [Trip]", createdBy: user._id, members: [{ user: user._id }, { user: friend._id }] },
      { name: "Roomies", createdBy: user._id, members: [{ user: user._id }, { user: friend._id }] },
      { name: "Goa [Trip]", createdBy: otherUser._id, members: [{ user: otherUser._id }] },
    ]);
    groupIds.push(goaGroup._id, roomiesGroup._id, privateGroup._id);

    await Expense.create({
      description: "Test shared expense",
      amount: 100,
      paidBy: user._id,
      group: goaGroup._id,
      splits: [{ user: user._id, amount: 50 }, { user: friend._id, amount: 50 }],
    });

    const tool = MENTOR_TOOLS_REGISTRY.find((entry) => entry.name === "getGroupBalances");
    assert.ok(tool);
    assert.equal(tool.parameters.properties.groupName.type, "string");

    const allGroups = await executeMentorTool("getGroupBalances", {}, user._id.toString());
    assert.equal(allGroups.groups.length, 2, "Unfiltered requests should include all groups the user belongs to");

    const namedGroup = await executeMentorTool(
      "getGroupBalances",
      { groupName: "Goa [Trip]" },
      user._id.toString(),
    );
    assert.equal(namedGroup.groups.length, 1, "A named-group request should return only the matching membership");
    assert.equal(namedGroup.groups[0].groupName.untrustedText, "Goa [Trip]");
    assert.equal(namedGroup.groups[0].userNetBalance, 50);
    assert.equal(namedGroup.groups[0].members.length, 2, "Member references should remain populated");
    assert.ok(
      namedGroup.groups[0].members.some((member) => member.untrustedText === friend.name),
      "Populated member names should remain available to the balance explanation",
    );
    assert.equal(namedGroup.groups[0].balanceEvidence.reconciliation.matches, true);

    const missingGroup = await executeMentorTool(
      "getGroupBalances",
      { groupName: "Not My Group" },
      user._id.toString(),
    );
    assert.deepEqual(missingGroup.groups, []);
    assert.match(missingGroup.message, /Not My Group/);
  } finally {
    if (groupIds.length) {
      await Expense.deleteMany({ group: { $in: groupIds } });
      await Group.deleteMany({ _id: { $in: groupIds } });
    }
    if (user?._id) {
      await UserFinancialProfile.deleteMany({ user: user._id });
      await User.deleteMany({ _id: user._id });
    }
    if (friend?._id) await User.deleteMany({ _id: friend._id });
    if (otherUser?._id) await User.deleteMany({ _id: otherUser._id });
    await mongoose.disconnect();
  }
});
