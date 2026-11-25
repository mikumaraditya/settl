import axios from "./axios";

/**
 * Send a chat message to the AI Financial Mentor
 * @param {string} message
 * @returns {Promise<{ reply: string, toolsUsed: Array, timestamp: string }>}
 */
export async function sendMentorMessage(message, conversationId) {
  const { data } = await axios.post("/mentor/chat", { message, conversationId });
  return data;
}

/**
 * Fetch past chat conversation history
 * @returns {Promise<{ messages: Array, conversationId: string }>}
 */

/**
 * Stream a mentor response and surface server-side tool progress.
 * Resolves with the same payload as sendMentorMessage when the stream completes.
 */
export async function streamMentorMessage(message, { signal, onStatus, conversationId } = {}) {
  const baseURL = axios.defaults.baseURL || "/api";
  const endpoint = new URL(
    `${baseURL.replace(/\/$/, "")}/mentor/chat/stream`,
    window.location.origin
  );

  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ message, conversationId }),
    signal,
  });

  if (!response.ok) {
    let payload = {};
    try { payload = await response.json(); } catch { /* non-JSON error */ }
    const error = new Error(payload.message || "Unable to contact Finn.");
    error.status = response.status;
    throw error;
  }

  if (!response.body) throw new Error("Streaming is not supported by this browser.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = null;

  const handleFrame = (frame) => {
    let eventName = "message";
    const dataLines = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;
    let payload;
    try { payload = JSON.parse(dataLines.join("\n")); }
    catch { return; }

    if (eventName === "status") onStatus?.(payload.message || "Finn is working...");
    if (eventName === "done") completed = payload;
    if (eventName === "error") {
      const error = new Error(payload.message || "Finn could not complete the request.");
      error.status = payload.status || 500;
      throw error;
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      for (const frame of frames) handleFrame(frame);
      if (done) break;
    }
    if (buffer.trim()) handleFrame(buffer);
  } catch (error) {
    if (signal?.aborted) {
      try { await reader.cancel(); } catch { /* already closed */ }
    }
    throw error;
  } finally {
    reader.releaseLock();
  }

  if (!completed) throw new Error("Finn's stream ended before a final response arrived.");
  return completed;
}

export async function fetchMentorHistory(conversationId) {
  const { data } = await axios.get("/mentor/history", {
    params: conversationId ? { conversationId } : undefined,
  });
  return data;
}

/**
 * Clear the current conversation history
 */
export async function clearMentorHistory(conversationId) {
  const { data } = await axios.delete("/mentor/history", {
    params: conversationId ? { conversationId } : undefined,
  });
  return data;
}


/** List the signed-in user's active and archived mentor conversations. */
export async function fetchMentorConversations() {
  const { data } = await axios.get("/mentor/conversations");
  return data;
}

/** Create a new empty mentor conversation. */
export async function createMentorConversation(title = "New conversation") {
  const { data } = await axios.post("/mentor/conversations", { title });
  return data.conversation;
}

/** Rename a conversation owned by the current user. */
export async function renameMentorConversation(conversationId, title) {
  const { data } = await axios.patch(`/mentor/conversations/${conversationId}`, { title });
  return data.conversation;
}

/** Archive a conversation without deleting its messages. */
export async function archiveMentorConversation(conversationId) {
  const { data } = await axios.post(`/mentor/conversations/${conversationId}/archive`);
  return data.conversation;
}

/** Restore an archived conversation. */
export async function unarchiveMentorConversation(conversationId) {
  const { data } = await axios.post(`/mentor/conversations/${conversationId}/unarchive`);
  return data.conversation;
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
  streamMentorMessage,
  fetchMentorHistory,
  clearMentorHistory,
  fetchMentorConversations,
  createMentorConversation,
  renameMentorConversation,
  archiveMentorConversation,
  unarchiveMentorConversation,
  checkMentorHealth,
  getMentorProfile,
  updateMentorProfile,
  deleteMentorProfile,
};
