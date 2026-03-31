const userHandler = require("../controllers/userController");
const { USER } = require("../constants/messages");
const { createUser } = require("../services/userService");

module.exports = async function (fastify, opts) {
  fastify.post("/signup", async (request, reply) => {
    const { name, email, password } = request.body;

    await createUser({ name, email, password });

    return { message: "Signup successful" };
  });

  fastify.get(USER.GET_USERS, userHandler.getUsers);
  fastify.post(USER.REGISTER, userHandler.registerUser);
  fastify.post(USER.DELETE_ACCOUNT, userHandler.deleteAccount);
  fastify.post(USER.LOGIN, userHandler.loginUser);
  fastify.post(USER.SEND_MESSAGE, userHandler.sendMessage);
  fastify.post(USER.CREATE_STATUS, userHandler.createStatus);
  fastify.post(USER.DELETE_STATUS, userHandler.deleteStatus);
  fastify.post(USER.MARK_STATUS_VIEW, userHandler.markStatusView);
  fastify.post(USER.AI_REWRITE, userHandler.aiRewrite);
  fastify.post(USER.AI_GENERATE_REPLIES, userHandler.aiGenerateReplies);
  fastify.post(USER.AI_SUMMARIZE_CHAT, userHandler.aiSummarizeChat);
  fastify.post(USER.AI_ASK, userHandler.aiAsk);
  fastify.post(USER.AI_GENERATE_IMAGE, userHandler.aiGenerateImage);
  fastify.post(USER.AI_TEXT_TO_SPEECH, userHandler.aiTextToSpeech);
  fastify.post(USER.AI_SPEECH_TO_TEXT, userHandler.aiSpeechToText);
  fastify.post(USER.AI_VOICE_AGENT, userHandler.aiVoiceAgent);
  fastify.post(USER.AI_DOCUMENT_ANALYZER, userHandler.aiDocumentAnalyzer);
  fastify.post(USER.AI_IMAGE_UNDERSTANDING, userHandler.aiImageUnderstanding);
  fastify.get(USER.GET_STATUS_POSTS, userHandler.getStatusPosts);
  fastify.get(USER.GET_STATUS_VIEWS, userHandler.getStatusViews);
  fastify.post(USER.REWRITE_MESSAGE, userHandler.rewriteMessage);
  fastify.post(USER.SUGGEST_REPLIES, userHandler.suggestReplies);
  fastify.get(USER.RECEIVE_MESSAGE, userHandler.getMessages);
  fastify.post(USER.UPLOAD_PROFILE_IMAGE, userHandler.uploadProfileImage);
  fastify.post(USER.UPLOAD_STATUS_MEDIA, userHandler.uploadStatusMedia);
  fastify.post(USER.UPDATE_ABOUT, userHandler.updateAbout);
  fastify.post(USER.UPDATE_FCM_TOKEN, userHandler.updateFcmToken);
  fastify.post(USER.CREATE_PAYMENT, userHandler.createPayment);
  fastify.get(USER.GET_PREMIUM_STATUS, userHandler.getPremiumStatus);
};
