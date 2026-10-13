import axios from "./axios";

/**
 * Send a chat message to the AI Financial Mentor
 * @param {string} message
 * @returns {Promise<{ reply: string, toolsUsed: Array, timestamp: string }>}
 */
export async function sendMentorMessage(message) {
  const { data } = await axios.post("/mentor/chat", { message });
  return data;
}

/**
 * Fetch past chat conversation history
 * @returns {Promise<{ messages: Array, conversationId: string }>}
 */
export async function fetchMentorHistory() {
  const { data } = await axios.get("/mentor/history");
  return data;
}

/**
 * Clear the current conversation history
 */
export async function clearMentorHistory() {
  const { data } = await axios.delete("/mentor/history");
  return data;
}

/**
 * Check AI engine connectivity status
 */
export async function checkMentorHealth() {
  const { data } = await axios.get("/mentor/health");
  return data;
}

/**
 * Fetch the user's financial profile and consent status
 */
export async function getMentorProfile() {
  const { data } = await axios.get("/mentor/profile");
  return data;
}

/**
 * Update the user's financial profile (form driven)
 */
export async function updateMentorProfile(profileData) {
  const { data } = await axios.put("/mentor/profile", profileData);
  return data;
}

/**
 * Delete the user's financial profile
 */
export async function deleteMentorProfile() {
  const { data } = await axios.delete("/mentor/profile");
  return data;
}

export default {
  sendMentorMessage,
  fetchMentorHistory,
  clearMentorHistory,
  checkMentorHealth,
  getMentorProfile,
  updateMentorProfile,
  deleteMentorProfile,
};
