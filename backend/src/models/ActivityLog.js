import mongoose from 'mongoose'

const activityLogSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
      index: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        'expense_added',
        'expense_deleted',
        'settlement_requested',
        'settlement_confirmed',
        'settlement_disputed',
        'evidence_submitted',
        'dispute_resolved',
        'dispute_rejected',
        'member_added',
        'member_removed',
        'member_left',
        'group_created',
      ],
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
)

export default mongoose.model('ActivityLog', activityLogSchema)
