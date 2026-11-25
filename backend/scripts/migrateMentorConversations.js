import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Convert the legacy one-conversation-per-user collection to multi-session
 * storage. Run once before deploying the multi-session backend, with the API
 * server stopped so it cannot recreate the old unique index during migration.
 *
 * Existing conversation documents and their message histories are preserved.
 */
async function migrateMentorConversations() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required.");
  }

  await mongoose.connect(process.env.MONGO_URI);
  const collection = mongoose.connection.collection("mentorconversations");

  let indexes = [];
  try {
    indexes = await collection.indexes();
  } catch (error) {
    if (error.code !== 26 && error.codeName !== "NamespaceNotFound") throw error;
  }

  const uniqueUserIndex = indexes.find(
    (index) => index.name === "user_1" && index.unique === true,
  );
  if (uniqueUserIndex) {
    await collection.dropIndex("user_1");
    console.log("Dropped legacy unique MentorConversation.user index.");
  }

  const now = new Date();
  const defaults = await collection.updateMany(
    {
      $or: [
        { title: { $exists: false } },
        { title: null },
        { title: "" },
        { archivedAt: { $exists: false } },
      ],
    },
    [
      {
        $set: {
          title: {
            $cond: [
              { $or: [{ $eq: ["$title", null] }, { $eq: ["$title", ""] }, { $not: ["$title"] }] },
              "New conversation",
              "$title",
            ],
          },
          archivedAt: { $ifNull: ["$archivedAt", null] },
          lastActiveAt: { $ifNull: ["$lastActiveAt", "$updatedAt"] },
          updatedAt: { $ifNull: ["$updatedAt", now] },
        },
      },
    ],
  );

  // The server is stopped during migration, so any persisted lease belongs
  // to a request that cannot still be running. Clear it to avoid a stale 409
  // immediately after the updated backend starts.
  const clearedLeases = await collection.updateMany(
    {
      $or: [
        { activeRequestId: { $exists: true } },
        { activeRequestExpiresAt: { $exists: true } },
      ],
    },
    {
      $unset: {
        activeRequestId: "",
        activeRequestExpiresAt: "",
      },
    },
  );

  await collection.createIndex(
    { user: 1, archivedAt: 1, updatedAt: -1 },
    { name: "user_1_archivedAt_1_updatedAt_-1" },
  );
  await collection.createIndex(
    { user: 1, updatedAt: -1 },
    { name: "user_1_updatedAt_-1" },
  );

  const total = await collection.countDocuments();
  console.log(
    "Multi-session mentor migration complete. Documents preserved:",
    total,
    "Documents updated with defaults:",
    defaults.modifiedCount,
    "Stale request leases cleared:",
    clearedLeases.modifiedCount,
  );
}

migrateMentorConversations()
  .catch((error) => {
    console.error("Mentor conversation migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
