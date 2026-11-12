import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Run once before deploying the unique MentorConversation.user index.
 * Keep the API server stopped while this migration runs.
 */
async function migrateMentorConversations() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required.");
  }

  await mongoose.connect(process.env.MONGO_URI);
  const collection = mongoose.connection.collection("mentorconversations");

  const duplicateGroups = await collection.aggregate([
    { $sort: { lastActiveAt: 1, updatedAt: 1 } },
    { $group: { _id: "$user", documents: { $push: "$$ROOT" } } },
    { $match: { "documents.1": { $exists: true } } },
  ]).toArray();

  let mergedCount = 0;
  for (const group of duplicateGroups) {
    const documents = group.documents;
    const keeper = documents[documents.length - 1];
    const mergedMessages = documents
      .flatMap((doc) => doc.messages || [])
      .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0))
      .slice(-60);
    const duplicateIds = documents
      .filter((doc) => String(doc._id) !== String(keeper._id))
      .map((doc) => doc._id);

    await collection.updateOne(
      { _id: keeper._id },
      {
        $set: {
          messages: mergedMessages,
          lastActiveAt: keeper.lastActiveAt || new Date(),
        },
        $unset: {
          activeRequestId: "",
          activeRequestExpiresAt: "",
        },
      }
    );
    if (duplicateIds.length) {
      await collection.deleteMany({ _id: { $in: duplicateIds } });
      mergedCount += duplicateIds.length;
    }
  }

  await collection.createIndex({ user: 1 }, { unique: true, name: "user_1" });
  console.log("Mentor conversation migration complete. Duplicate documents merged:", mergedCount);
}

migrateMentorConversations()
  .catch((error) => {
    console.error("Mentor conversation migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
