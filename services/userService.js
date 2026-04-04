const userDao = require("../dao/userDao");
const messageDao = require("../dao/userDao");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const {
  getAIReply,
  rewriteWithAI,
  generateSuggestions,
  generateAutoReply,
  summarizeChatWithAI,
  askAssistantWithAI,
  generateImageWithAI,
  textToSpeechWithDeepgram,
  speechToTextWithDeepgram,
  voiceAgentWithAI,
  documentAnalyzerWithGroq,
  imageUnderstandingWithGemini
} = require("./aiService");
const { sendNotification } = require("./firebaseService");
const { logEvent } = require("./eventLogger");
const {
  buildPublicMediaUrl,
  normalizeMediaUrlForWrite,
  normalizeUserMediaFields,
  toPublicHttpsUrl
} = require("../utils/mediaUrl");
const AI_BOT_USER_ID = 9999;
const MAX_AI_CONTEXT_MESSAGES = 20;
const AUTO_REPLY_DELAY_MS = Number(process.env.AUTO_REPLY_DELAY_MS || 10000);
const CHATTR_AI_NAME = String(process.env.CHATTR_AI_NAME || "Chattr AI").trim() || "Chattr AI";

const normalizeEventUserId = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const resolveEventUserId = (options = {}) => {
  return (
    normalizeEventUserId(options?.userId) ||
    normalizeEventUserId(options?.user_id) ||
    normalizeEventUserId(options?.sender_id) ||
    null
  );
};

const computeDurationMs = (startedAtMs) => {
  if (!Number.isFinite(startedAtMs)) {
    return null;
  }
  return Math.max(0, Date.now() - startedAtMs);
};

function getChattrAiAvatarUrl() {
  const configuredAvatar = String(process.env.CHATTR_AI_AVATAR_URL || "").trim();
  if (configuredAvatar) {
    return toPublicHttpsUrl(configuredAvatar);
  }
  return buildPublicMediaUrl("/uploads/profile-images/chattr-ai.svg");
}

function buildChattrAiUser(overrides = {}) {
  return normalizeUserMediaFields({
    id: AI_BOT_USER_ID,
    name: CHATTR_AI_NAME,
    email: "chattr.ai@system.local",
    about: "Your AI assistant",
    avatar: getChattrAiAvatarUrl(),
    is_ai: 1,
    ...overrides
  });
}

function triggerAutoReply(senderId, receiverId, message) {
  setTimeout(async () => {
    try {
      const latestMessages = await messageDao.getMessages(senderId, receiverId);
      const lastMessage = latestMessages[latestMessages.length - 1];

      if (!lastMessage) {
        return;
      }

      if (Number(lastMessage.sender_id) !== Number(senderId)) {
        return;
      }

      const aiReply = await generateAutoReply(message);

      await messageDao.sendMessage({
        sender_id: receiverId,
        receiver_id: senderId,
        message: `(Auto): ${aiReply}`
      });
    } catch (error) {
      console.error("Auto reply error:", error);
    }
  }, AUTO_REPLY_DELAY_MS);
}


exports.getUsers = async () => {
  const users = (await userDao.getUsers()).map((user) => normalizeUserMediaFields(user));
  const aiIndex = users.findIndex((user) => Number(user?.id) === AI_BOT_USER_ID);

  if (aiIndex >= 0) {
    users[aiIndex] = buildChattrAiUser(users[aiIndex]);
    return users;
  }

  return [buildChattrAiUser(), ...users];
};

exports.getUserById = async (userId) => {
  if (Number(userId) === AI_BOT_USER_ID) {
    const existingAiUser = await userDao.getUserById(AI_BOT_USER_ID);
    return buildChattrAiUser(existingAiUser || {});
  }

  const user = await userDao.getUserById(userId);
  return normalizeUserMediaFields(user);
};

exports.registerUser = async (data) => {
  const name = data?.name?.trim?.();
  const email = data?.email?.trim?.();
  const password = data?.password;

  if (!name) {
    throw { statusCode: 400, message: "name is required" };
  }

  if (!email) {
    throw { statusCode: 400, message: "email is required" };
  }

  if (!password) {
    throw { statusCode: 400, message: "password is required" };
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = {
    name,
    email,
    password: hashedPassword
  };

  const result = await userDao.createUser(user);
  await logEvent(result.insertId, "user_registered", { email });
  return {
    message: "User registered successfully",
    userId: result.insertId
  };
};

exports.createUser = async (data) => {
  return exports.registerUser(data);
};

exports.loginUser = async (data) => {

  const user = await userDao.getUserByEmail(data.email);

  if (!user) {
    await logEvent(null, "login_failed", {
      email: data?.email || "",
      reason: "user_not_found"
    });
    throw { message: "User not found" };
  }

  const passwordMatch = await bcrypt.compare(
    data.password,
    user.password
  );

  if (!passwordMatch) {
    await logEvent(user.id, "login_failed", {
      email: user.email,
      reason: "invalid_password"
    });
    throw { message: "Invalid password" };
  }

  const token = jwt.sign(
    { id: user.id, email: user.email },
    "chat_secret_key",
    { expiresIn: "1d" }
  );

  await logEvent(user.id, "login_success", { email: user.email });
  return {
    token,
    user: normalizeUserMediaFields(user)
  };

};

exports.sendMessage = async (data) => {
    const autoReplyEnabled =
      data?.autoReplyEnabled ??
      data?.aiFeatures?.autoReplyEnabled ??
      false;

    const autoReplyForUserId =
      data?.aiFeatures?.autoReplyForUserId ??
      data?.receiver_id;

    if (Number(data.receiver_id) === AI_BOT_USER_ID) {
      const aiStartTimeMs = Date.now();
      const userMessageResult = await messageDao.sendMessage({
        sender_id: data.sender_id,
        receiver_id: data.receiver_id,
        message: data.message
      });
      await logEvent(data.sender_id, "message_sent_ai", {
        receiverId: data.receiver_id,
        messageId: userMessageResult.insertId
      });

      const conversation = await messageDao.getMessages(data.sender_id, AI_BOT_USER_ID);
      const aiContext = conversation
        .slice(-MAX_AI_CONTEXT_MESSAGES)
        .map((item) => ({
          role: Number(item.sender_id) === AI_BOT_USER_ID ? "assistant" : "user",
          content: item.message
        }));

      const aiReply = await getAIReply(data.message, aiContext);

      const aiMessageResult = await messageDao.sendMessage({
        sender_id: AI_BOT_USER_ID,
        receiver_id: data.sender_id,
        message: aiReply
      });
      await logEvent(resolveEventUserId(data), "ai_tool_used", {
        tool: "chat_message_reply",
        durationMs: computeDurationMs(aiStartTimeMs),
        mode: null
      });
      await logEvent(AI_BOT_USER_ID, "ai_reply_sent", {
        receiverId: data.sender_id,
        messageId: aiMessageResult.insertId
      });

      return {
        isAIFlow: true,
        userMessage: {
          id: userMessageResult.insertId,
          sender_id: data.sender_id,
          receiver_id: data.receiver_id,
          message: data.message
        },
        aiMessage: {
          id: aiMessageResult.insertId,
          sender_id: AI_BOT_USER_ID,
          receiver_id: data.sender_id,
          message: aiReply
        }
      };
    }

    const result = await messageDao.sendMessage(data);
    await logEvent(data.sender_id, "message_sent", {
      receiverId: data.receiver_id,
      messageId: result.insertId
    });

    try {
      const receiver = await userDao.getUserById(data.receiver_id);
      if (receiver?.fcm_token) {
        await sendNotification(receiver.fcm_token, data.message);
        await logEvent(data.sender_id, "notification_sent", {
          receiverId: Number(data.receiver_id),
          messageId: result.insertId,
          channel: "fcm"
        });
      }
    } catch (pushError) {
      console.log("Push notification error:", pushError?.message || pushError);
    }

    if (
      autoReplyEnabled === true &&
      Number(data.receiver_id) !== AI_BOT_USER_ID &&
      Number(autoReplyForUserId) === Number(data.receiver_id)
    ) {
      triggerAutoReply(data.sender_id, data.receiver_id, data.message);
    }
  
    return {
      message: "Message sent",
      messageId: result.insertId
    };
  
  };

  exports.getMessages = async (senderId, receiverId) => {

    const messages = await messageDao.getMessages(senderId, receiverId);
    return messages;
  
  };

exports.uploadProfileImage = async (userId, imagePath) => {
    const normalizedImagePath = normalizeMediaUrlForWrite(imagePath);
    const numericUserId = Number(userId);

    const result = await userDao.updateProfileImage(numericUserId, normalizedImagePath);

    if (!result.affectedRows) {
      throw { message: "User not found" };
    }

    await logEvent(numericUserId, "profile_image_updated", {
      imagePath: normalizedImagePath
    });

    return {
      message: "Profile image uploaded successfully",
      imagePath: normalizedImagePath,
      avatar: normalizedImagePath,
      profileImage: normalizedImagePath,
      imageUrl: normalizedImagePath
    };

  };

exports.updateAbout = async (userId, about) => {
  const numericUserId = Number(userId);

  const result = await userDao.updateAbout(numericUserId, about);

  if (!result.affectedRows) {
    throw { message: "User not found" };
  }

  await logEvent(numericUserId, "about_updated", {
    aboutLength: typeof about === "string" ? about.length : 0
  });

  return {
    message: "About updated successfully",
    about
  };

};

exports.updateFcmToken = async (userId, fcmToken) => {

  const result = await userDao.updateFcmToken(userId, fcmToken);

  if (!result.affectedRows) {
    throw { message: "User not found" };
  }

  return {
    message: "FCM token updated successfully",
    userId: Number(userId),
    hasToken: Boolean(fcmToken)
  };

};

exports.deleteAccount = async (userId, is_delete) => {

  const result = await userDao.deleteAccount(userId, is_delete);

  if (!result.affectedRows) {
    throw { message: "User not found" };
  }

  return {
    message: "Account deleted successfully",
    is_delete
  };

};

exports.rewriteMessage = async (message, mode = "", options = {}) => {
  const aiStartTimeMs = Date.now();
  const rewrittenMessage = await rewriteWithAI(message, mode);
  await logEvent(resolveEventUserId(options), "ai_tool_used", {
    tool: "rewrite_message",
    durationMs: computeDurationMs(aiStartTimeMs),
    mode: mode || null
  });

  return {
    message: "Message rewritten successfully",
    rewrittenMessage
  };
};

exports.suggestReplies = async (message, mode = "", options = {}) => {
  const aiStartTimeMs = Date.now();
  const suggestions = await generateSuggestions(message, mode);
  await logEvent(resolveEventUserId(options), "ai_tool_used", {
    tool: "suggest_replies",
    durationMs: computeDurationMs(aiStartTimeMs),
    mode: mode || null
  });

  return {
    message: "Suggestions generated successfully",
    suggestions
  };
};

exports.summarizeChat = async (chatText, mode = "", options = {}) => {
  const aiStartTimeMs = Date.now();
  const summary = await summarizeChatWithAI(chatText, mode);
  await logEvent(resolveEventUserId(options), "ai_tool_used", {
    tool: "summarize_chat",
    durationMs: computeDurationMs(aiStartTimeMs),
    mode: mode || null
  });
  return {
    message: "Chat summarized successfully",
    summary
  };
};

exports.askAI = async (prompt, mode = "", options = {}) => {
  const aiStartTimeMs = Date.now();
  const answer = await askAssistantWithAI(prompt, mode);
  await logEvent(resolveEventUserId(options), "ai_tool_used", {
    tool: "ask_ai",
    durationMs: computeDurationMs(aiStartTimeMs),
    mode: mode || null
  });
  return {
    message: "AI response generated successfully",
    answer
  };
};

exports.generateImage = async (prompt, options = {}) => {
  const aiStartTimeMs = Date.now();
  const result = await generateImageWithAI(prompt, options);
  await logEvent(resolveEventUserId(options), "ai_tool_used", {
    tool: "generate_image",
    durationMs: computeDurationMs(aiStartTimeMs),
    mode: options?.mode || null
  });
  return {
    message: "Image generated successfully",
    ...result
  };
};

exports.textToSpeech = async (text, options = {}) => {
  const aiStartTimeMs = Date.now();
  const result = await textToSpeechWithDeepgram(text, options);
  await logEvent(resolveEventUserId(options), "ai_tool_used", {
    tool: "text_to_speech",
    durationMs: computeDurationMs(aiStartTimeMs),
    model: options?.model || null
  });
  return {
    message: "Audio generated successfully",
    ...result
  };
};

exports.speechToText = async (audioBuffer, mimeType, options = {}) => {
  const aiStartTimeMs = Date.now();
  const result = await speechToTextWithDeepgram(audioBuffer, mimeType, options);
  await logEvent(resolveEventUserId(options), "ai_tool_used", {
    tool: "speech_to_text",
    durationMs: computeDurationMs(aiStartTimeMs),
    model: options?.model || null
  });
  return {
    message: "Transcription completed successfully",
    ...result
  };
};

exports.voiceAgent = async (audioBuffer, mimeType, options = {}) => {
  const aiStartTimeMs = Date.now();
  const result = await voiceAgentWithAI(audioBuffer, mimeType, options);
  await logEvent(resolveEventUserId(options), "ai_tool_used", {
    tool: "voice_agent",
    durationMs: computeDurationMs(aiStartTimeMs),
    mode: options?.mode || null
  });
  return {
    message: "Voice agent response generated successfully",
    ...result
  };
};

exports.documentAnalyzer = async (fileBuffer, mimeType, prompt, options = {}) => {
  const aiStartTimeMs = Date.now();
  const result = await documentAnalyzerWithGroq(fileBuffer, mimeType, prompt);
  await logEvent(resolveEventUserId(options), "ai_tool_used", {
    tool: "document_analyzer",
    durationMs: computeDurationMs(aiStartTimeMs),
    mimeType: mimeType || null
  });
  return {
    message: "Document analysis completed successfully",
    ...result
  };
};

exports.imageUnderstanding = async (fileBuffer, mimeType, prompt, options = {}) => {
  const aiStartTimeMs = Date.now();
  const result = await imageUnderstandingWithGemini(fileBuffer, mimeType, prompt);
  await logEvent(resolveEventUserId(options), "ai_tool_used", {
    tool: "image_understanding",
    durationMs: computeDurationMs(aiStartTimeMs),
    mimeType: mimeType || null
  });
  return {
    message: "Image understanding completed successfully",
    ...result
  };
};

exports.createPayment = async (data) => {
  const userId = Number(data?.user_id);
  const amount = Number(data?.amount);
  const status = String(data?.status || "").trim().toLowerCase();
  const transactionId = String(data?.transaction_id || "").trim();

  if (!Number.isFinite(userId) || userId <= 0) {
    throw { message: "user_id is required and must be a valid number", statusCode: 400 };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw { message: "amount is required and must be greater than 0", statusCode: 400 };
  }

  if (!status) {
    throw { message: "status is required", statusCode: 400 };
  }

  if (!transactionId) {
    throw { message: "transaction_id is required", statusCode: 400 };
  }

  await logEvent(userId, "premium_checkout_started", {
    amount: amount.toFixed(2),
    status,
    transactionId
  });

  const result = await userDao.createPayment({
    user_id: userId,
    amount: amount.toFixed(2),
    status,
    transaction_id: transactionId
  });

  if (["success", "succeeded", "completed", "paid", "active"].includes(status)) {
    await logEvent(userId, "premium_activated", {
      amount: amount.toFixed(2),
      transactionId
    });
  }

  return {
    message: "Payment saved successfully",
    paymentId: result.insertId
  };
};

exports.getPremiumStatus = async (userId) => {
  const numericUserId = Number(userId);
  if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
    throw { message: "userId must be a valid number", statusCode: 400 };
  }

  const isPremium = await userDao.getPremiumStatus(numericUserId);
  return {
    userId: numericUserId,
    isPremium
  };
};

exports.createStatus = async (data) => {
  const userId = data?.user_id ?? data?.userId;
  const mediaUrlValue = data?.media_url ?? data?.mediaUrl;
  const textContentValue = data?.text_content ?? data?.textContent;
  const expiresAtValue = data?.expires_at ?? data?.expiresAt;

  if (userId === undefined || userId === null || userId === "") {
    throw { message: "user_id is required", statusCode: 400 };
  }

  if (Number.isNaN(Number(userId))) {
    throw { message: "user_id must be a valid number", statusCode: 400 };
  }

  const mediaUrl = normalizeMediaUrlForWrite(mediaUrlValue);
  const textContent = typeof textContentValue === "string" ? textContentValue.trim() : "";

  if (!mediaUrl && !textContent) {
    throw { message: "Either media_url or text_content is required", statusCode: 400 };
  }

  let expiresAtDate;
  if (expiresAtValue === undefined || expiresAtValue === null || expiresAtValue === "") {
    expiresAtDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  } else {
    expiresAtDate = new Date(expiresAtValue);
    if (Number.isNaN(expiresAtDate.getTime())) {
      throw { message: "expires_at is invalid", statusCode: 400 };
    }
  }

  const expiresAt =
    expiresAtDate
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

  const result = await userDao.createStatusPost({
    user_id: Number(userId),
    media_url: mediaUrl || null,
    text_content: textContent || null,
    expires_at: expiresAt
  });

  await logEvent(Number(userId), "status_uploaded", {
    statusId: result.insertId,
    hasMedia: Boolean(mediaUrl),
    hasText: Boolean(textContent)
  });

  return {
    message: "Status created successfully",
    statusId: result.insertId,
    user_id: Number(userId),
    media_url: mediaUrl || null,
    text_content: textContent || null,
    expires_at: expiresAt
  };
};

exports.getStatusPosts = async (userId) => {
  if (userId !== undefined && userId !== null && userId !== "" && Number.isNaN(Number(userId))) {
    throw { message: "user_id must be a valid number", statusCode: 400 };
  }

  const statuses = await userDao.getStatusPosts(
    userId === undefined || userId === null || userId === "" ? null : Number(userId)
  );

  return {
    message: "Status posts fetched successfully",
    statuses: statuses.map((status) => ({
      ...status,
      media_url:
        typeof status.media_url === "string"
          ? toPublicHttpsUrl(status.media_url)
          : status.media_url
    }))
  };
};

exports.getStatusViews = async (statusId) => {
  if (statusId === undefined || statusId === null || statusId === "") {
    throw { message: "statusId is required", statusCode: 400 };
  }

  if (Number.isNaN(Number(statusId))) {
    throw { message: "statusId must be a valid number", statusCode: 400 };
  }

  const views = await userDao.getStatusViews(Number(statusId));

  return {
    message: "Status views fetched successfully",
    statusId: Number(statusId),
    totalViews: views.length,
    views: views.map((view) => ({
      ...view,
      viewer_avatar:
        typeof view.viewer_avatar === "string"
          ? toPublicHttpsUrl(view.viewer_avatar)
          : view.viewer_avatar
    }))
  };
};

exports.markStatusView = async (data) => {
  const statusId = data?.status_id;
  const viewerId = data?.viewer_id;

  if (statusId === undefined || statusId === null || statusId === "") {
    throw { message: "status_id is required", statusCode: 400 };
  }

  if (viewerId === undefined || viewerId === null || viewerId === "") {
    throw { message: "viewer_id is required", statusCode: 400 };
  }

  if (Number.isNaN(Number(statusId)) || Number.isNaN(Number(viewerId))) {
    throw { message: "status_id and viewer_id must be valid numbers", statusCode: 400 };
  }

  const result = await userDao.markStatusView(Number(statusId), Number(viewerId));

  await logEvent(Number(viewerId), "status_viewed", {
    statusId: Number(statusId),
    firstView: Boolean(result.affectedRows)
  });

  return {
    message: result.affectedRows ? "Status marked as viewed" : "Status already viewed",
    status_id: Number(statusId),
    viewer_id: Number(viewerId),
    inserted: Boolean(result.affectedRows)
  };
};

exports.trackNotificationOpened = async (data) => {
  const userId = data?.user_id ?? data?.userId;
  const notificationId = data?.notification_id ?? data?.notificationId ?? null;

  if (userId === undefined || userId === null || userId === "") {
    throw { message: "user_id is required", statusCode: 400 };
  }

  if (Number.isNaN(Number(userId))) {
    throw { message: "user_id must be a valid number", statusCode: 400 };
  }

  await logEvent(Number(userId), "notification_opened", {
    notificationId
  });

  return {
    message: "Notification opened logged successfully",
    user_id: Number(userId),
    notification_id: notificationId
  };
};

exports.trackThemeChanged = async (data) => {
  const userId = data?.user_id ?? data?.userId;
  const theme = typeof data?.theme === "string" ? data.theme.trim() : "";

  if (userId === undefined || userId === null || userId === "") {
    throw { message: "user_id is required", statusCode: 400 };
  }

  if (Number.isNaN(Number(userId))) {
    throw { message: "user_id must be a valid number", statusCode: 400 };
  }

  if (!theme) {
    throw { message: "theme is required", statusCode: 400 };
  }

  await logEvent(Number(userId), "theme_changed", {
    theme
  });

  return {
    message: "Theme changed logged successfully",
    user_id: Number(userId),
    theme
  };
};

exports.trackAppSession = async (data) => {
  const userId = data?.user_id ?? data?.userId;
  const actionRaw = String(data?.action || "").trim().toLowerCase();
  const sessionId = data?.session_id ?? data?.sessionId ?? null;
  const durationRaw = data?.duration_seconds ?? data?.durationSeconds;
  const startedAt = data?.started_at ?? data?.startedAt ?? null;
  const endedAt = data?.ended_at ?? data?.endedAt ?? null;

  if (userId === undefined || userId === null || userId === "") {
    throw { message: "user_id is required", statusCode: 400 };
  }

  if (Number.isNaN(Number(userId))) {
    throw { message: "user_id must be a valid number", statusCode: 400 };
  }

  if (!["start", "end"].includes(actionRaw)) {
    throw { message: "action must be either 'start' or 'end'", statusCode: 400 };
  }

  const durationSeconds =
    durationRaw === undefined || durationRaw === null || durationRaw === ""
      ? null
      : Number(durationRaw);

  if (durationSeconds !== null && (!Number.isFinite(durationSeconds) || durationSeconds < 0)) {
    throw { message: "duration_seconds must be a valid non-negative number", statusCode: 400 };
  }

  const eventType = actionRaw === "start" ? "app_session_started" : "app_session_ended";

  await logEvent(Number(userId), eventType, {
    sessionId,
    durationSeconds,
    startedAt,
    endedAt
  });

  return {
    message: "App session event logged successfully",
    user_id: Number(userId),
    action: actionRaw,
    session_id: sessionId,
    duration_seconds: durationSeconds
  };
};

exports.trackPageTime = async (data) => {
  const userId = data?.user_id ?? data?.userId;
  const page = String(data?.page || data?.screen || "").trim();
  const durationRaw = data?.duration_seconds ?? data?.durationSeconds;
  const sessionId = data?.session_id ?? data?.sessionId ?? null;

  if (userId === undefined || userId === null || userId === "") {
    throw { message: "user_id is required", statusCode: 400 };
  }

  if (Number.isNaN(Number(userId))) {
    throw { message: "user_id must be a valid number", statusCode: 400 };
  }

  if (!page) {
    throw { message: "page is required", statusCode: 400 };
  }

  const durationSeconds = Number(durationRaw);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw { message: "duration_seconds is required and must be a non-negative number", statusCode: 400 };
  }

  await logEvent(Number(userId), "page_time_spent", {
    page,
    durationSeconds,
    sessionId
  });

  return {
    message: "Page time logged successfully",
    user_id: Number(userId),
    page,
    duration_seconds: durationSeconds,
    session_id: sessionId
  };
};

exports.getUsageInsights = async (userId, query = {}) => {
  if (userId === undefined || userId === null || userId === "") {
    throw { message: "userId is required", statusCode: 400 };
  }

  const numericUserId = Number(userId);
  if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
    throw { message: "userId must be a valid number", statusCode: 400 };
  }

  const fromDateRaw = typeof query?.from === "string" ? query.from.trim() : "";
  const toDateRaw = typeof query?.to === "string" ? query.to.trim() : "";

  const fromDate = fromDateRaw || null;
  const toDate = toDateRaw || null;

  const [appStats, pageStats] = await Promise.all([
    userDao.getAppUsageStats(numericUserId, fromDate, toDate),
    userDao.getPageUsageStats(numericUserId, fromDate, toDate)
  ]);

  const normalizedPageStats = (pageStats || []).map((item) => ({
    page: item.page,
    total_seconds: Number(item.totalSeconds || 0)
  }));

  const mostUsedPage = normalizedPageStats.length
    ? normalizedPageStats[0]
    : null;

  return {
    message: "Usage insights fetched successfully",
    user_id: numericUserId,
    range: {
      from: fromDate,
      to: toDate
    },
    total_app_time_seconds: Number(appStats?.totalSeconds || 0),
    sessions_started: Number(appStats?.sessionsStarted || 0),
    sessions_ended: Number(appStats?.sessionsEnded || 0),
    most_used_page: mostUsedPage,
    page_breakdown: normalizedPageStats
  };
};

exports.getAiToolInsights = async (query = {}) => {
  const userIdRaw = query?.user_id ?? query?.userId ?? null;
  const fromDateRaw = typeof query?.from === "string" ? query.from.trim() : "";
  const toDateRaw = typeof query?.to === "string" ? query.to.trim() : "";

  let userId = null;
  if (userIdRaw !== null && userIdRaw !== undefined && userIdRaw !== "") {
    userId = Number(userIdRaw);
    if (!Number.isFinite(userId) || userId <= 0) {
      throw { message: "user_id must be a valid number", statusCode: 400 };
    }
  }

  const fromDate = fromDateRaw || null;
  const toDate = toDateRaw || null;

  const rows = await userDao.getAiToolInsights({
    userId,
    fromDate,
    toDate
  });

  const toolBreakdown = (rows || []).map((item) => ({
    tool: item.tool,
    usage_count: Number(item.usageCount || 0),
    total_duration_ms: Number(item.totalDurationMs || 0),
    avg_duration_ms: Number(item.avgDurationMs || 0)
  }));

  const mostUsedTool = toolBreakdown.length ? toolBreakdown[0] : null;
  const totalUses = toolBreakdown.reduce((sum, item) => sum + item.usage_count, 0);
  const totalDurationMs = toolBreakdown.reduce((sum, item) => sum + item.total_duration_ms, 0);

  return {
    message: "AI tool insights fetched successfully",
    user_id: userId,
    range: {
      from: fromDate,
      to: toDate
    },
    total_ai_tool_uses: totalUses,
    total_ai_tool_time_ms: totalDurationMs,
    unique_tools: toolBreakdown.length,
    most_used_tool: mostUsedTool,
    tool_breakdown: toolBreakdown
  };
};

exports.deleteStatus = async (data) => {
  const statusId = data?.status_id;
  const userId = data?.user_id;

  if (statusId === undefined || statusId === null || statusId === "") {
    throw { message: "status_id is required", statusCode: 400 };
  }

  if (userId === undefined || userId === null || userId === "") {
    throw { message: "user_id is required", statusCode: 400 };
  }

  if (Number.isNaN(Number(statusId)) || Number.isNaN(Number(userId))) {
    throw { message: "status_id and user_id must be valid numbers", statusCode: 400 };
  }

  const result = await userDao.deleteStatus(Number(statusId), Number(userId));

  if (!result.affectedRows) {
    throw { message: "Status not found or not owned by this user", statusCode: 404 };
  }

  await logEvent(Number(userId), "status_deleted", {
    statusId: Number(statusId)
  });

  return {
    message: "Status deleted successfully",
    status_id: Number(statusId),
    user_id: Number(userId)
  };
};
  
