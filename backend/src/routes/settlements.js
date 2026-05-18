import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Expense from '../models/Expense.js';
import Group from '../models/Group.js';
import Settlement from '../models/Settlement.js';
import User from '../models/User.js';
import ActivityLog from '../models/ActivityLog.js';
import protect from '../middleware/auth.js';
import simplifyDebts from '../utils/debtSimplify.js';
import { io } from '../../server.js';
import uploadMiddleware from '../config/multer.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — call Gemini Flash (free, 1500 req/day) to verify a payment screenshot
// Get your free API key at: https://aistudio.google.com/
// ─────────────────────────────────────────────────────────────────────────────
async function verifyScreenshotWithAI(imagePath, expectedAmount, expectedUpiId) {
  const fs = (await import('fs')).default
  try {
    const imageBuffer = fs.readFileSync(imagePath)
    const base64Image = imageBuffer.toString('base64')
    const ext = path.extname(imagePath).toLowerCase().replace('.', '')
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
    const mimeType = mimeMap[ext] || 'image/jpeg'

    const prompt = `You are a strict payment fraud detector for a UPI bill-splitting app.

Expected payment details:
- Amount: ₹${expectedAmount}
- Receiver UPI ID or name: "${expectedUpiId}"

Carefully examine this screenshot and answer ALL of the following:

1. PAYMENT STATUS: Is the status clearly "Success", "Successful", or "Completed"? (Reject if "Pending", "Failed", "Processing", or blank)
2. AMOUNT: Does the paid amount match ₹${expectedAmount}? Allow ±1 rupee rounding tolerance only.
3. RECEIVER: Does the receiver UPI ID or name match or closely relate to "${expectedUpiId}"?
4. TAMPERING: Does the image show any signs of editing, Photoshop, overlaid text, or digital manipulation?
5. PHOTO OF SCREEN: Is this a photo taken of another screen/monitor instead of a real screenshot? (blurry edges, camera glare, curved screen, reflection = photo of screen = reject)
6. APP AUTHENTICITY: Does this look like a genuine UPI app (GPAY, PhonePe, Paytm, BHIM, etc.) or a fake/custom UI?

Be STRICT. If you are not confident about ANY check, set verified to false.

Reply ONLY with valid JSON, no markdown, no extra text:
{"verified":boolean,"amountMatch":boolean,"upiMatch":boolean,"statusSuccess":boolean,"suspicious":boolean,"photoOfScreen":boolean,"reason":"one concise sentence explaining the decision"}`

    const apiKey = process.env.GEMINI_API_KEY
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64Image } },
            { text: prompt },
          ],
        }],
        generationConfig: { maxOutputTokens: 400, temperature: 0 },
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Gemini API error:', err)
      return { verified: false, reason: 'AI verification service unavailable.' }
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { verified: false, reason: 'AI returned unreadable response.' }

    const result = JSON.parse(jsonMatch[0])

    // Extra safety: if photo-of-screen detected, override to not verified
    if (result.photoOfScreen) {
      return {
        verified: false,
        amountMatch: result.amountMatch,
        upiMatch: result.upiMatch,
        statusSuccess: result.statusSuccess,
        suspicious: true,
        photoOfScreen: true,
        reason: 'Rejected: image appears to be a photo of a screen, not a real screenshot.',
      }
    }

    return {
      verified:      result.verified === true,
      amountMatch:   result.amountMatch,
      upiMatch:      result.upiMatch,
      statusSuccess: result.statusSuccess,
      suspicious:    result.suspicious,
      photoOfScreen: result.photoOfScreen,
      reason:        result.reason || 'No reason provided.',
    }
  } catch (err) {
    console.error("AI verification failed:", err.message);
    return { verified: false, reason: "AI verification failed: " + err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET SIMPLIFIED DEBTS FOR A GROUP
// ─────────────────────────────────────────────────────────────────────────────
router.get("/simplify/:groupId", protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const [expenses, allSettlements] = await Promise.all([
      Expense.find({ group: req.params.groupId })
        .populate("paidBy", "name email upiId")
        .populate("splits.user", "name email upiId"),
      Settlement.find({ group: req.params.groupId })
        .populate("from", "name email upiId")
        .populate("to",   "name email upiId"),
    ]);

    // Separate by status
    const confirmedSettlements  = allSettlements.filter((s) => s.status === "confirmed");
    const pendingRequests       = allSettlements.filter((s) => s.status === "pending");
    const disputedSettlements   = allSettlements.filter((s) => s.status === "disputed");
    const unresolvedSettlements = allSettlements.filter((s) => s.status === "unresolved");

    if (expenses.length === 0) {
      return res.json({
        transactions: [],
        confirmedSettlements,
        pendingRequests,
        disputedSettlements,
        unresolvedSettlements,
      });
    }

    // Only confirmed settlements reduce the remaining debt
    const rawTransactions = simplifyDebts(expenses, confirmedSettlements);

    const members  = group.members.map((m) => m.user.toString());
    const allUsers = await User.find({ _id: { $in: members } }).select(
      "name email upiId",
    );

    const getUserDetails = (userId) =>
      allUsers.find((u) => u._id.toString() === userId);

    const transactions = rawTransactions.map((t) => ({
      from:   getUserDetails(t.from),
      to:     getUserDetails(t.to),
      amount: t.amount,
    }));

    res.json({
      transactions,
      confirmedSettlements,
      pendingRequests,
      disputedSettlements,
      unresolvedSettlements,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL ACTIVE DISPUTES FOR A GROUP
// Returns pending, disputed, and unresolved settlements for the group
// Used by the Disputes tab in GroupDetail.jsx
// ─────────────────────────────────────────────────────────────────────────────
router.get("/group/:groupId/disputes", protect, async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const settlements = await Settlement.find({
      group: groupId,
      status: { $in: ["pending", "disputed", "unresolved"] },
    })
      .populate("from", "name email upiId")
      .populate("to",   "name email upiId")
      .sort({ updatedAt: -1 });

    const pending    = settlements.filter((s) => s.status === "pending");
    const disputed   = settlements.filter((s) => s.status === "disputed");
    const unresolved = settlements.filter((s) => s.status === "unresolved");

    res.json({ pending, disputed, unresolved });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST SETTLEMENT (payer marks as paid — awaits receiver confirmation)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/settle", protect, async (req, res) => {
  try {
    const { groupId, toUserId, amount, transactionId } = req.body;

    // Block only if there's already an active (pending or disputed) settlement
    const existing = await Settlement.findOne({
      group: groupId,
      from: req.user.id,
      to: toUserId,
      status: { $in: ['pending', 'disputed'] },
    });

    if (existing) {
      return res.status(400).json({
        message:
          existing.status === 'pending'
            ? 'Settlement request already sent. Waiting for receiver to confirm.'
            : 'This payment is currently under dispute. Resolve it before sending a new request.',
      });
    }

    const settlement = await Settlement.create({
      group: groupId,
      from: req.user.id,
      to: toUserId,
      amount,
      status: "pending",
      transactionId: transactionId || "",
    });

    const populated = await Settlement.findById(settlement._id)
      .populate("from", "name email upiId")
      .populate("to", "name email upiId");

    io.to(groupId).emit('settlement_requested', populated);

    // Log activity
    await ActivityLog.create({
      group: groupId,
      actor: req.user.id,
      type: 'settlement_requested',
      meta: { amount, toName: populated.to?.name, toId: toUserId },
    });

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM SETTLEMENT (receiver confirms they received the payment)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/confirm", protect, async (req, res) => {
  try {
    const { groupId, fromUserId } = req.body;

    const settlement = await Settlement.findOne({
      group: groupId,
      from: fromUserId,
      to: req.user.id,   // only the receiver can confirm
      status: "pending",
    });

    if (!settlement) {
      return res.status(404).json({ message: "No pending settlement request found" });
    }

    settlement.status = "confirmed";
    await settlement.save();

    const populated = await Settlement.findById(settlement._id)
      .populate("from", "name email upiId")
      .populate("to", "name email upiId");

    io.to(groupId).emit('settlement_done', populated);

    // Log activity
    await ActivityLog.create({
      group: groupId,
      actor: req.user.id,
      type: 'settlement_confirmed',
      meta: { amount: settlement.amount, fromName: populated.from?.name, fromId: populated.from?._id },
    });

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL / UNDO SETTLEMENT REQUEST (payer only, only while still pending)
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/settle", protect, async (req, res) => {
  try {
    const { groupId, toUserId } = req.body;

    const settlement = await Settlement.findOne({
      group: groupId,
      from: req.user.id,
      to: toUserId,
      status: "pending",   // can only undo a pending request
    });

    if (!settlement) {
      return res.status(404).json({
        message: "No pending settlement request found to cancel",
      });
    }

    await settlement.deleteOne();

    // Notify group
    io.to(groupId).emit("settlement_undone", {
      fromId: req.user.id,
      toId: toUserId,
    });

    res.json({ message: "Settlement request cancelled" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DISPUTE — Receiver rejects the payment claim
// ─────────────────────────────────────────────────────────────────────────────
router.post("/dispute", protect, async (req, res) => {
  try {
    const { settlementId, disputeReason } = req.body;

    const settlement = await Settlement.findById(settlementId)
      .populate("from", "name email upiId")
      .populate("to",   "name email upiId");

    if (!settlement) {
      return res.status(404).json({ message: "Settlement not found" });
    }

    // Only the receiver can dispute
    if (settlement.to._id.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the receiver can dispute a payment" });
    }

    if (settlement.status !== "pending") {
      return res.status(400).json({
        message: `Cannot dispute a settlement with status "${settlement.status}"`,
      });
    }

    settlement.status = "disputed";
    settlement.disputeReason = disputeReason || "No reason provided";
    await settlement.save();

    const populated = await Settlement.findById(settlement._id)
      .populate("from", "name email upiId")
      .populate("to",   "name email upiId");

    io.to(settlement.group.toString()).emit('settlement_disputed', {
      settlementId: settlement._id,
      disputeReason: settlement.disputeReason,
      settlement: populated,
    });

    // Log activity
    await ActivityLog.create({
      group: settlement.group,
      actor: req.user.id,
      type: 'settlement_disputed',
      meta: { amount: settlement.amount, fromName: populated.from?.name, reason: settlement.disputeReason },
    });

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DISPUTE EVIDENCE — Payer submits UTR + screenshot for AI verification
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/dispute/evidence",
  protect,
  uploadMiddleware.single("screenshot"),
  async (req, res) => {
    try {
      const { settlementId, utrNumber } = req.body;

      const settlement = await Settlement.findById(settlementId)
        .populate("from", "name email upiId")
        .populate("to",   "name email upiId");

      if (!settlement) {
        return res.status(404).json({ message: 'Settlement not found' });
      }

      // Only the payer can submit evidence
      if (settlement.from._id.toString() !== req.user.id) {
        return res.status(403).json({ message: 'Only the payer can submit evidence' });
      }

      if (settlement.status !== 'disputed') {
        return res.status(400).json({
          message: `Cannot submit evidence for a settlement with status "${settlement.status}"`,
        });
      }

      // Validate UTR — must be 12–22 digits
      const utrClean = (utrNumber || '').replace(/\D/g, '')
      if (utrClean.length < 12 || utrClean.length > 22) {
        return res.status(400).json({ message: 'UTR / Transaction ID must be 12–22 digits.' });
      }

      // Build evidence object
      const evidenceData = {
        utrNumber: utrNumber || "",
        submittedAt: new Date(),
        aiVerified: null,
        aiReason: "",
        screenshotUrl: "",
        screenshotOriginalName: "",
      };

      let aiResult = { verified: false, reason: "No screenshot uploaded." };

      if (req.file) {
        evidenceData.screenshotUrl = `/uploads/${req.file.filename}`;
        evidenceData.screenshotOriginalName = req.file.originalname;

        // Run AI verification
        const receiverUpiId = settlement.to.upiId || settlement.to.name;
        aiResult = await verifyScreenshotWithAI(
          req.file.path,
          settlement.amount,
          receiverUpiId
        );

        evidenceData.aiVerified = aiResult.verified;
        evidenceData.aiReason   = aiResult.reason;
      }

      settlement.evidence = evidenceData;

      // If AI verified → auto-confirm the settlement
      if (aiResult.verified) {
        settlement.status = "confirmed";
        await settlement.save();

        const populated = await Settlement.findById(settlement._id)
          .populate("from", "name email upiId")
          .populate("to",   "name email upiId");

      io.to(settlement.group.toString()).emit('settlement_resolved', {
        settlementId: settlement._id,
        status: 'confirmed',
        aiVerified: true,
        settlement: populated,
      });

      // Log activity
      await ActivityLog.create({
        group: settlement.group,
        actor: req.user.id,
        type: 'dispute_resolved',
        meta: { amount: settlement.amount, fromName: populated.from?.name, toName: populated.to?.name, method: 'ai_verified' },
      });

      return res.json({ settlement: populated, aiVerified: true, aiReason: aiResult.reason });
      }

      // AI not verified → keep as disputed, notify receiver to review
      await settlement.save();

      const populated = await Settlement.findById(settlement._id)
        .populate("from", "name email upiId")
        .populate("to",   "name email upiId");

      io.to(settlement.group.toString()).emit('settlement_evidence_submitted', {
        settlementId: settlement._id,
        evidence: evidenceData,
        settlement: populated,
      });

      // Log activity
      await ActivityLog.create({
        group: settlement.group,
        actor: req.user.id,
        type: 'evidence_submitted',
        meta: { amount: settlement.amount, toName: populated.to?.name, utrNumber: evidenceData.utrNumber },
      });

      res.json({ settlement: populated, aiVerified: false, aiReason: aiResult.reason });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DISPUTE RESOLVE — Receiver manually accepts or rejects the evidence
// ─────────────────────────────────────────────────────────────────────────────
router.post("/dispute/resolve", protect, async (req, res) => {
  try {
    const { settlementId, accept } = req.body;

    const settlement = await Settlement.findById(settlementId)
      .populate("from", "name email upiId")
      .populate("to",   "name email upiId");

    if (!settlement) {
      return res.status(404).json({ message: "Settlement not found" });
    }

    // Only the receiver can resolve
    if (settlement.to._id.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the receiver can resolve a dispute" });
    }

    if (settlement.status !== "disputed") {
      return res.status(400).json({
        message: `Cannot resolve a settlement with status "${settlement.status}"`,
      });
    }

    settlement.status = accept ? "confirmed" : "unresolved";
    await settlement.save();

    const populated = await Settlement.findById(settlement._id)
      .populate("from", "name email upiId")
      .populate("to",   "name email upiId");

    io.to(settlement.group.toString()).emit('settlement_resolved', {
      settlementId: settlement._id,
      status: settlement.status,
      aiVerified: false,
      resolvedBy: req.user.id,
      settlement: populated,
    });

    // Log activity
    await ActivityLog.create({
      group: settlement.group,
      actor: req.user.id,
      type: 'dispute_resolved',
      meta: {
        amount: settlement.amount,
        fromName: populated.from?.name,
        toName:   populated.to?.name,
        accepted: accept,
        method:   'manual',
      },
    });

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET ACTIVITY LOG FOR A GROUP
// ─────────────────────────────────────────────────────────────────────────────
router.get('/group/:groupId/activity', protect, async (req, res) => {
  try {
    const { groupId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const skip  = parseInt(req.query.skip) || 0;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const isMember = group.members.some(m => m.user.toString() === req.user.id);
    if (!isMember) return res.status(403).json({ message: 'Not a member of this group' });

    const [logs, total] = await Promise.all([
      ActivityLog.find({ group: groupId })
        .populate('actor', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ActivityLog.countDocuments({ group: groupId }),
    ]);

    res.json({ logs, total, hasMore: skip + limit < total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
