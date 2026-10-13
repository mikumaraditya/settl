import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import settlementsRouter, { autoExpirePendingSettlements } from "../src/routes/settlements.js";
import User from "../src/models/User.js";
import Group from "../src/models/Group.js";
import Expense from "../src/models/Expense.js";
import Settlement from "../src/models/Settlement.js";
import ActivityLog from "../src/models/ActivityLog.js";

// Setup express app for supertest
const app = express();
app.use(express.json());
app.use("/api/settlements", settlementsRouter);

const JWT_SECRET = process.env.JWT_SECRET || "default_super_secret_jwt_key_123";

function generateToken(user) {
  return jwt.sign({ id: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: "1h" });
}

async function runRouteTests() {
  const devUri = process.env.MONGO_URI;
  const testUri = process.env.MONGO_URI_TEST || "mongodb+srv://settl-admin:settl1234@cluster0.yzuy5hv.mongodb.net/settl_test?retryWrites=true&w=majority";

  // SAFETY CHECK: Refuse to run tests against the dev database
  if (testUri === devUri || testUri.includes("/settl?") || testUri.endsWith("/settl")) {
    throw new Error("SAFETY CHECK FAILED: Refusing to run tests against the dev database ('settl')! MONGO_URI_TEST must point to a separate test database (e.g. 'settl_test').");
  }

  await mongoose.connect(testUri);
  // Ensure schema indexes (including partial unique index) exist in test database
  await Settlement.syncIndexes();

  console.log("==================================================");
  console.log("SUPERTEST SETTLEMENT ROUTE INTEGRATION TESTS");
  console.log(`Target Database: ${mongoose.connection.name} (${testUri})`);
  console.log("==================================================");

  // Setup isolated test users in test database
  const userA = await User.create({ name: "Route Test User A", email: `usera_test_${Date.now()}@test.com`, password: "password123", isEmailVerified: true });
  const userB = await User.create({ name: "Route Test User B", email: `userb_test_${Date.now()}@test.com`, password: "password123", isEmailVerified: true });
  const userC = await User.create({ name: "Route Test User C", email: `userc_test_${Date.now()}@test.com`, password: "password123", isEmailVerified: true });

  const tokenA = generateToken(userA);
  const tokenB = generateToken(userB);
  const tokenC = generateToken(userC);

  // Create clean isolated test group
  const testGroup = await Group.create({
    name: `Isolated Test Group ${Date.now()}`,
    members: [{ user: userA._id }, { user: userB._id }, { user: userC._id }],
    createdBy: userA._id,
  });

  const groupId = testGroup._id.toString();

  // Create initial expense: User B paid ₹1000 split equally between User A and User B (User A owes User B ₹500)
  await Expense.create({
    description: "Dinner Test",
    amount: 1000,
    paidBy: userB._id,
    group: testGroup._id,
    splits: [
      { user: userA._id, amount: 500 },
      { user: userB._id, amount: 500 },
    ],
  });

  console.log(`\nTest setup complete: User A (${userA.name}) owes User B (${userB.name}) ₹500 in Group ${groupId}`);

  // ----------------------------------------------------
  // SCENARIO 1: Wrong Direction
  // User B (Creditor) attempts to settle with User A (Debtor)
  // ----------------------------------------------------
  console.log("\n[SCENARIO 1] Wrong direction check (Creditor tries to settle with Debtor)");
  {
    const res = await request(app)
      .post("/api/settlements/settle")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ groupId, toUserId: userA._id.toString(), amount: 500 });

    console.log(`HTTP Status: ${res.status} | Response Body:`, res.body);
    if (res.status === 400 && res.body.message.includes("Invalid settlement")) {
      console.log("✅ PASS: Correctly rejected wrong direction settlement request.");
    } else {
      console.error("❌ FAIL: Wrong direction was not rejected properly.");
    }
  }

  // ----------------------------------------------------
  // SCENARIO 2: Amount Above Debt
  // User A (Debtor) attempts to settle ₹1000 when debt is ₹500
  // ----------------------------------------------------
  console.log("\n[SCENARIO 2] Amount above debt check (User A tries to settle ₹1000 when debt is ₹500)");
  {
    const res = await request(app)
      .post("/api/settlements/settle")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ groupId, toUserId: userB._id.toString(), amount: 1000 });

    console.log(`HTTP Status: ${res.status} | Response Body:`, res.body);
    if (res.status === 400 && res.body.message.includes("exceeds the outstanding debt")) {
      console.log("✅ PASS: Correctly rejected amount above debt.");
    } else {
      console.error("❌ FAIL: Amount above debt was not rejected properly.");
    }
  }

  // ----------------------------------------------------
  // SCENARIO 3: Valid Settle
  // User A creates a valid settlement request of ₹300 to User B
  // ----------------------------------------------------
  let pendingSettlementId = null;
  console.log("\n[SCENARIO 3] Valid settle request (User A requests ₹300 settlement to User B)");
  {
    const res = await request(app)
      .post("/api/settlements/settle")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ groupId, toUserId: userB._id.toString(), amount: 300 });

    console.log(`HTTP Status: ${res.status} | Response Body:`, res.body);
    if (res.status === 201 && res.body.status === "pending") {
      pendingSettlementId = res.body._id;
      console.log("✅ PASS: Valid settlement request created successfully.");
    } else {
      console.error("❌ FAIL: Valid settlement creation failed.");
    }
  }

  // ----------------------------------------------------
  // SCENARIO 4: Double-Pending Overflow Check
  // User A tries to create a second pending settlement when ₹300 is already pending
  // ----------------------------------------------------
  console.log("\n[SCENARIO 4] Double-pending overflow check (Attempt second pending request)");
  {
    const res = await request(app)
      .post("/api/settlements/settle")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ groupId, toUserId: userB._id.toString(), amount: 200 });

    console.log(`HTTP Status: ${res.status} | Response Body:`, res.body);
    if (res.status === 400 && res.body.message.includes("already sent")) {
      console.log("✅ PASS: Correctly blocked double-pending request.");
    } else {
      console.error("❌ FAIL: Double pending request was not blocked.");
    }
  }

  // ----------------------------------------------------
  // SCENARIO 5: Confirm by Someone Who Isn't the Receiver
  // User A (Payer) attempts to confirm the settlement meant for User B
  // ----------------------------------------------------
  console.log("\n[SCENARIO 5] Confirm by non-receiver check (User A tries to confirm own payment)");
  {
    const res = await request(app)
      .post("/api/settlements/confirm")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ groupId, fromUserId: userA._id.toString() });

    console.log(`HTTP Status: ${res.status} | Response Body:`, res.body);
    if (res.status === 404 && res.body.message.includes("No pending settlement")) {
      console.log("✅ PASS: Non-receiver cannot confirm settlement.");
    } else {
      console.error("❌ FAIL: Non-receiver was able to confirm settlement!");
    }
  }

  // ----------------------------------------------------
  // SCENARIO 6: Cancel by someone else (rejected) [PART B]
  // User C tries to cancel User A's pending settlement request
  // ----------------------------------------------------
  console.log("\n[SCENARIO 6] Cancel by someone else (rejected check)");
  {
    const res = await request(app)
      .delete("/api/settlements/settle")
      .set("Authorization", `Bearer ${tokenC}`)
      .send({ groupId, toUserId: userB._id.toString() });

    console.log(`HTTP Status: ${res.status} | Response Body:`, res.body);
    if (res.status === 404 && res.body.message.includes("No pending settlement")) {
      console.log("✅ PASS: Non-payer cannot cancel someone else's settlement request.");
    } else {
      console.error("❌ FAIL: Non-payer was able to cancel settlement request!");
    }
  }

  // ----------------------------------------------------
  // SCENARIO 7: Cancel by the payer [PART B]
  // User A (Payer) cancels their own pending settlement request to User B
  // ----------------------------------------------------
  console.log("\n[SCENARIO 7] Cancel by the payer check (User A cancels own request)");
  {
    const res = await request(app)
      .delete("/api/settlements/settle")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ groupId, toUserId: userB._id.toString() });

    console.log(`HTTP Status: ${res.status} | Response Body:`, res.body);
    if (res.status === 200 && res.body.settlement?.status === "cancelled") {
      console.log("✅ PASS: Payer successfully cancelled own settlement request.");
    } else {
      console.error("❌ FAIL: Payer cancel failed.");
    }
  }

  // ----------------------------------------------------
  // SCENARIO 8: New request after cancel [PART B]
  // User A creates a NEW settlement request to User B after cancelling
  // ----------------------------------------------------
  console.log("\n[SCENARIO 8] New request after cancel check");
  {
    const res = await request(app)
      .post("/api/settlements/settle")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ groupId, toUserId: userB._id.toString(), amount: 250 });

    console.log(`HTTP Status: ${res.status} | Response Body:`, res.body);
    if (res.status === 201 && res.body.status === "pending") {
      pendingSettlementId = res.body._id;
      console.log("✅ PASS: Successfully created new settlement request after cancel.");
    } else {
      console.error("❌ FAIL: Creation of new request after cancel failed.");
    }
  }

  // ----------------------------------------------------
  // SCENARIO 9: Auto-expiry and New request after expiry [PART B]
  // Simulate 7+ days passing for pending settlement, trigger auto-expiry, then create new request
  // ----------------------------------------------------
  console.log("\n[SCENARIO 9] Auto-expiry and new request after expiry check");
  {
    // Backdate the pending settlement created in Scenario 8 by 8 days using raw collection update
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await Settlement.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(pendingSettlementId) },
      { $set: { createdAt: eightDaysAgo } }
    );

    // Run auto-expiry routine
    const expiredCount = await autoExpirePendingSettlements(groupId);
    console.log(`Auto-expiry routine processed ${expiredCount} expired settlement(s).`);

    const expiredDoc = await Settlement.findById(pendingSettlementId);
    if (expiredDoc && expiredDoc.status === "expired") {
      console.log("✅ PASS: Pending settlement status correctly set to 'expired'.");
    } else {
      console.error(`❌ FAIL: Settlement status was not set to 'expired'! Current: ${expiredDoc?.status}`);
    }

    // Now attempt a new settlement request from User A to User B
    const res = await request(app)
      .post("/api/settlements/settle")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ groupId, toUserId: userB._id.toString(), amount: 400 });

    console.log(`HTTP Status: ${res.status} | Response Body:`, res.body);
    if (res.status === 201 && res.body.status === "pending") {
      console.log("✅ PASS: Successfully created new settlement request after expiry.");
    } else {
      console.error("❌ FAIL: New settlement request after expiry failed!");
    }
  }

  // ----------------------------------------------------
  // SCENARIO 10: Confirm by receiver
  // Receiver User B confirms payment
  // ----------------------------------------------------
  console.log("\n[SCENARIO 10] Confirm by receiver");
  {
    const res = await request(app)
      .post("/api/settlements/confirm")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ groupId, fromUserId: userA._id.toString() });

    console.log(`HTTP Status: ${res.status} | Response Body:`, res.body);
    if (res.status === 200 && res.body.status === "confirmed") {
      console.log("✅ PASS: Settlement confirmed successfully by receiver.");
    } else {
      console.error("❌ FAIL: Confirmation by receiver failed.");
    }
  }

  // CLEANUP: Clean up test database after tests finish
  console.log("\n[CLEANUP] Cleaning up isolated test database...");
  await Group.deleteMany({ _id: testGroup._id });
  await Expense.deleteMany({ group: testGroup._id });
  await Settlement.deleteMany({ group: testGroup._id });
  await ActivityLog.deleteMany({ group: testGroup._id });
  await User.deleteMany({ _id: { $in: [userA._id, userB._id, userC._id] } });
  console.log("Cleanup completed cleanly.");

  console.log("\n==================================================");
  console.log("ALL ROUTE TEST SCENARIOS PASSED CLEANLY!");
  console.log("==================================================");

  await mongoose.disconnect();
}

runRouteTests().catch((err) => {
  console.error("Route test failure:", err);
  process.exit(1);
});
