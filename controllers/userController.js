const userService = require("../services/userService");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const { buildPublicMediaUrl } = require("../utils/mediaUrl");

ffmpeg.setFfmpegPath(ffmpegPath);

exports.getUsers = async (request, reply) => {
  try {
    const users = await userService.getUsers();
    return users;
  } catch (error) {
    const statusCode =
      Number(error?.statusCode) >= 400 && Number(error?.statusCode) < 600
        ? Number(error.statusCode)
        : 500;
    reply.code(statusCode).send({
      message: error?.message || "Document analysis failed"
    });
  }
};

exports.registerUser = async (request, reply) => {
  try {
    const user = await userService.registerUser(request.body);
    return user;
  } catch (error) {
    const statusCode =
      Number(error?.statusCode) >= 400 && Number(error?.statusCode) < 600
        ? Number(error.statusCode)
        : 500;
    reply.code(statusCode).send({
      message: error?.message || "Unable to register user"
    });
  }
};

  exports.loginUser = async (request, reply) => {

    console.log("LOGIN HIT");
    console.log("BODY:", request.body);
  
    try {
  
      const result = await userService.loginUser(request.body);
  
      console.log("SERVICE RESULT:", result);
  
      reply.send(result);
  
    } catch (error) {
  
      console.log("LOGIN ERROR:", error);
  
      reply.code(400).send(error);
  
    }
  };

  exports.sendMessage = async (req, reply) => {
    try {
      const data = req.body;
      console.log("sendMessagesendMessage", data);
  
      const result = await userService.sendMessage(data);

      if (result && result.isAIFlow) {
        if (req.server && req.server.io) {
          req.server.io.to(String(data.sender_id)).emit("new-message", result.userMessage);
          req.server.io.to(String(data.sender_id)).emit("new-message", result.aiMessage);
        }
        return result.aiMessage;
      }
  
      const newMessage = {
        id: result.insertId || result.messageId,
        sender_id: data.sender_id,
        receiver_id: data.receiver_id,
        message: data.message
      };
      const room = String(data.receiver_id);
      const members = req.server.io.sockets.adapter.rooms.get(room);
      console.log("room members", room, members ? [...members] : []);
      console.log("emit io namespace:", req.server.io.of("/").name);
      
      if (req.server && req.server.io && data.receiver_id) {
        console.log("EMITTING MESSAGE TO ROOM:", data.receiver_id);
        req.server.io.to(String(data.receiver_id)).emit("new-message", newMessage);
        req.server.io.to(String(data.sender_id)).emit("new-message", newMessage);
      }
  
      return newMessage;
  
    } catch (error) {
      reply.code(500).send(error);
    }
  };

exports.getMessages = async (req, reply) => {

    try {
  
      const { senderId, receiverId } = req.params;
      const messages = await userService.getMessages(senderId, receiverId);
      return messages;
    } catch (error) {
      reply.code(500).send(error);
  
    }
  
  };

exports.uploadProfileImage = async (request, reply) => {
  try {
    const { userId } = request.params;
    const { image } = request.body || {};

    if (!image || typeof image !== "string") {
      return reply.code(400).send({
        message: "Image is required in base64 data URL format"
      });
    }

    const matches = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!matches) {
      return reply.code(400).send({
        message: "Invalid image format. Use data:image/<type>;base64,<data>"
      });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const extension = mimeType.split("/")[1] || "png";

    const uploadsDir = path.join(process.cwd(), "uploads", "profile-images");
    fs.mkdirSync(uploadsDir, { recursive: true });

    const fileName = `user-${userId}-${Date.now()}.${extension}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, base64Data, "base64");

    const imagePath = `/uploads/profile-images/${fileName}`;
    const imageUrl = buildPublicMediaUrl(imagePath);
    const result = await userService.uploadProfileImage(userId, imageUrl);

    return {
      ...result,
      imageUrl
    };
  } catch (error) {
    const statusCode = error && error.message === "User not found" ? 404 : 500;
    reply.code(statusCode).send(error);
  }
};

exports.updateAbout = async (request, reply) => {
  try {
    const { userId } = request.params;
    const { about } = request.body || {};

    if (typeof about !== "string") {
      return reply.code(400).send({
        message: "about is required and must be a string"
      });
    }

    const result = await userService.updateAbout(userId, about.trim());
    return result;
  } catch (error) {
    const statusCode = error && error.message === "User not found" ? 404 : 500;
    reply.code(statusCode).send(error);
  }
};

exports.updateFcmToken = async (request, reply) => {
  try {
    const { userId } = request.params;
    const { fcm_token } = request.body || {};

    if (typeof fcm_token !== "string" && fcm_token !== null) {
      return reply.code(400).send({
        message: "fcm_token is required and must be a string or null"
      });
    }

    const normalizedToken =
      typeof fcm_token === "string" ? fcm_token.trim() : null;

    const result = await userService.updateFcmToken(
      userId,
      normalizedToken || null
    );
    return result;
  } catch (error) {
    const statusCode = error && error.message === "User not found" ? 404 : 500;
    reply.code(statusCode).send(error);
  }
};

exports.deleteAccount = async (request, reply) => {
  try {
    const { userId } = request.params;
    const { is_delete } = request.body || {};
    const result = await userService.deleteAccount(userId, is_delete);
    console.log("deleteAccount controller",result,is_delete)
    return result;
  } catch (error) {
    const statusCode = error && error.message === "User not found" ? 404 : 500;
    reply.code(statusCode).send(error);
  }
};

exports.createPayment = async (request, reply) => {
  try {
    const result = await userService.createPayment(request.body || {});
    return result;
  } catch (error) {
    const statusCode =
      Number(error?.statusCode) >= 400 && Number(error?.statusCode) < 600
        ? Number(error.statusCode)
        : 500;
    reply.code(statusCode).send({
      message: error?.message || "Unable to create payment"
    });
  }
};

exports.getPremiumStatus = async (request, reply) => {
  try {
    const { userId } = request.params || {};
    const result = await userService.getPremiumStatus(userId);
    return result;
  } catch (error) {
    const statusCode =
      Number(error?.statusCode) >= 400 && Number(error?.statusCode) < 600
        ? Number(error.statusCode)
        : 500;
    reply.code(statusCode).send({
      message: error?.message || "Unable to fetch premium status"
    });
  }
};

exports.rewriteMessage = async (request, reply) => {
  try {
    const { message, mode, user_id, userId } = request.body || {};

    if (typeof message !== "string" || !message.trim()) {
      return reply.code(400).send({
        message: "message is required and must be a non-empty string"
      });
    }

    const result = await userService.rewriteMessage(message.trim(), mode, {
      userId: user_id ?? userId
    });
    return result;
  } catch (error) {
    const statusCode =
      Number(error?.statusCode) >= 400 && Number(error?.statusCode) < 600
        ? Number(error.statusCode)
        : 500;
    reply.code(statusCode).send({
      message: error?.message || "Document analysis failed"
    });
  }
};

exports.suggestReplies = async (request, reply) => {
  try {
    const { message, mode, user_id, userId } = request.body || {};

    if (typeof message !== "string" || !message.trim()) {
      return reply.code(400).send({
        message: "message is required and must be a non-empty string"
      });
    }

    const result = await userService.suggestReplies(message.trim(), mode, {
      userId: user_id ?? userId
    });
    return result;
  } catch (error) {
    const statusCode =
      Number(error?.statusCode) >= 400 && Number(error?.statusCode) < 600
        ? Number(error.statusCode)
        : 500;
    reply.code(statusCode).send({
      message: error?.message || "Document analysis failed"
    });
  }
};

exports.aiRewrite = async (request, reply) => {
  try {
    const { message, mode, user_id, userId } = request.body || {};
    if (typeof message !== "string" || !message.trim()) {
      return reply.code(400).send({ message: "message is required and must be a non-empty string" });
    }

    const result = await userService.rewriteMessage(message.trim(), mode, {
      userId: user_id ?? userId
    });
    return result;
  } catch (error) {
    reply.code(500).send(error);
  }
};

exports.aiGenerateReplies = async (request, reply) => {
  try {
    const { message, mode, user_id, userId } = request.body || {};
    if (typeof message !== "string" || !message.trim()) {
      return reply.code(400).send({ message: "message is required and must be a non-empty string" });
    }

    const result = await userService.suggestReplies(message.trim(), mode, {
      userId: user_id ?? userId
    });
    return result;
  } catch (error) {
    reply.code(500).send(error);
  }
};

exports.aiSummarizeChat = async (request, reply) => {
  try {
    const { chatText, messages, mode, user_id, userId } = request.body || {};

    let normalizedText = "";
    if (typeof chatText === "string" && chatText.trim()) {
      normalizedText = chatText.trim();
    } else if (Array.isArray(messages) && messages.length) {
      normalizedText = messages
        .map((m) => {
          const sender = m?.sender || m?.role || "User";
          const content = m?.message || m?.content || "";
          return `${sender}: ${content}`;
        })
        .join("\n");
    }

    if (!normalizedText) {
      return reply.code(400).send({
        message: "chatText or messages[] is required for summarization"
      });
    }

    const result = await userService.summarizeChat(normalizedText, mode, {
      userId: user_id ?? userId
    });
    return result;
  } catch (error) {
    reply.code(500).send(error);
  }
};

exports.aiAsk = async (request, reply) => {
  try {
    const { prompt, mode, user_id, userId } = request.body || {};
    if (typeof prompt !== "string" || !prompt.trim()) {
      return reply.code(400).send({ message: "prompt is required and must be a non-empty string" });
    }

    const result = await userService.askAI(prompt.trim(), mode, {
      userId: user_id ?? userId
    });
    return result;
  } catch (error) {
    reply.code(500).send(error);
  }
};

exports.aiGenerateImage = async (request, reply) => {
  try {
    const { prompt, negative_prompt, width, height, steps, user_id, userId, mode } = request.body || {};

    if (typeof prompt !== "string" || !prompt.trim()) {
      return reply.code(400).send({ message: "prompt is required and must be a non-empty string" });
    }

    const result = await userService.generateImage(prompt.trim(), {
      negative_prompt,
      width,
      height,
      steps,
      mode,
      userId: user_id ?? userId
    });

    return result;
  } catch (error) {
    reply.code(500).send(error);
  }
};

exports.aiTextToSpeech = async (request, reply) => {
  try {
    const { text, voice, model, user_id, userId } = request.body || {};

    if (typeof text !== "string" || !text.trim()) {
      return reply.code(400).send({ message: "text is required and must be a non-empty string" });
    }

    const result = await userService.textToSpeech(text.trim(), {
      voice,
      model,
      userId: user_id ?? userId
    });
    return result;
  } catch (error) {
    reply.code(500).send(error);
  }
};

exports.aiSpeechToText = async (request, reply) => {
  try {
    const part = await request.file();
    if (!part) {
      return reply.code(400).send({ message: "audio file is required" });
    }

    const mime = (part.mimetype || "").toLowerCase();
    if (!mime.startsWith("audio/") && mime !== "application/octet-stream") {
      return reply.code(400).send({ message: "Only audio file is allowed" });
    }

    const audioBuffer = await part.toBuffer();
    if (!audioBuffer || !audioBuffer.length) {
      return reply.code(400).send({ message: "Audio file is empty" });
    }

    const { model, user_id, userId } = request.query || {};
    const result = await userService.speechToText(audioBuffer, mime, {
      model,
      userId: user_id ?? userId
    });
    return result;
  } catch (error) {
    reply.code(500).send(error);
  }
};

exports.aiVoiceAgent = async (request, reply) => {
  try {
    const part = await request.file();
    if (!part) {
      return reply.code(400).send({ message: "audio file is required" });
    }

    const mime = (part.mimetype || "").toLowerCase();
    if (!mime.startsWith("audio/") && mime !== "application/octet-stream") {
      return reply.code(400).send({ message: "Only audio file is allowed" });
    }

    const audioBuffer = await part.toBuffer();
    if (!audioBuffer || !audioBuffer.length) {
      return reply.code(400).send({ message: "Audio file is empty" });
    }

    const { stt_model, tts_model, mode, user_id, userId } = request.query || {};
    const result = await userService.voiceAgent(audioBuffer, mime, {
      stt_model,
      tts_model,
      mode,
      userId: user_id ?? userId
    });
    return result;
  } catch (error) {
    reply.code(500).send(error);
  }
};

exports.aiDocumentAnalyzer = async (request, reply) => {
  try {
    const part = await request.file();
    if (!part) {
      return reply.code(400).send({ message: "document file is required" });
    }

    const mime = (part.mimetype || "").toLowerCase();
    const normalizedMime =
      mime === "text/comma-separated-values" ||
      mime === "application/csv" ||
      mime === "application/x-csv" ||
      mime === "application/vnd.ms-excel"
        ? "text/csv"
        : mime;
    const allowedDocMimes = [
      "application/pdf",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/csv",
      "text/comma-separated-values",
      "application/csv",
      "application/x-csv",
      "application/vnd.ms-excel"
    ];

    if (!allowedDocMimes.includes(normalizedMime)) {
      return reply.code(400).send({ message: `Unsupported document type: ${mime}` });
    }

    const fileBuffer = await part.toBuffer();
    const prompt =
      part.fields?.prompt?.value ||
      part.fields?.question?.value ||
      "Analyze this document and provide key points clearly.";

    const userId = part.fields?.user_id?.value || part.fields?.userId?.value;
    const result = await userService.documentAnalyzer(fileBuffer, normalizedMime, prompt, {
      userId
    });
    return result;
  } catch (error) {
    const statusCode =
      Number(error?.statusCode) >= 400 && Number(error?.statusCode) < 600
        ? Number(error.statusCode)
        : 500;
    reply.code(statusCode).send({
      message: error?.message || "Document analysis failed"
    });
  }
};

exports.aiImageUnderstanding = async (request, reply) => {
  try {
    const part = await request.file();
    if (!part) {
      return reply.code(400).send({ message: "image file is required" });
    }

    const mime = (part.mimetype || "").toLowerCase();
    if (!mime.startsWith("image/")) {
      return reply.code(400).send({ message: "Only image file is allowed" });
    }

    const fileBuffer = await part.toBuffer();
    const prompt =
      part.fields?.prompt?.value ||
      part.fields?.question?.value ||
      "Understand this image and explain what it contains.";

    const userId = part.fields?.user_id?.value || part.fields?.userId?.value;
    const result = await userService.imageUnderstanding(fileBuffer, mime, prompt, {
      userId
    });
    return result;
  } catch (error) {
    reply.code(500).send(error);
  }
};

exports.createStatus = async (request, reply) => {
  try {
    const result = await userService.createStatus(request.body || {});
    return result;
  } catch (error) {
    if (error && error.code === "ER_NO_REFERENCED_ROW_2") {
      return reply.code(400).send({ message: "Invalid user_id. User does not exist." });
    }
    if (error && error.code === "ER_TRUNCATED_WRONG_VALUE") {
      return reply.code(400).send({ message: "Invalid expires_at format." });
    }

    const statusCode = error && error.statusCode ? error.statusCode : 500;
    reply.code(statusCode).send({
      message: error && error.message ? error.message : "Failed to create status"
    });
  }
};

exports.getStatusPosts = async (request, reply) => {
  try {
    const { user_id } = request.query || {};
    const result = await userService.getStatusPosts(user_id);
    return result;
  } catch (error) {
    const statusCode = error && error.statusCode ? error.statusCode : 500;
    reply.code(statusCode).send(error);
  }
};

exports.getStatusViews = async (request, reply) => {
  try {
    const { statusId } = request.params || {};
    const result = await userService.getStatusViews(statusId);
    return result;
  } catch (error) {
    const statusCode = error && error.statusCode ? error.statusCode : 500;
    reply.code(statusCode).send(error);
  }
};

exports.markStatusView = async (request, reply) => {
  try {
    const result = await userService.markStatusView(request.body || {});
    return result;
  } catch (error) {
    const statusCode = error && error.statusCode ? error.statusCode : 500;
    reply.code(statusCode).send(error);
  }
};

exports.deleteStatus = async (request, reply) => {
  try {
    const result = await userService.deleteStatus(request.body || {});
    return result;
  } catch (error) {
    const statusCode = error && error.statusCode ? error.statusCode : 500;
    reply.code(statusCode).send(error);
  }
};

exports.uploadStatusMedia = async (request, reply) => {
  try {
    const part = await request.file();
    if (!part) {
      return reply.code(400).send({ message: "file is required" });
    }

    const mime = part.mimetype || "";
    if (!mime.startsWith("image/") && !mime.startsWith("video/")) {
      return reply.code(400).send({ message: "Only image or video files are allowed" });
    }

    const uploadsDir = path.join(process.cwd(), "uploads", "status-media");
    fs.mkdirSync(uploadsDir, { recursive: true });

    const ext = path.extname(part.filename || "").toLowerCase();
    const isVideo = mime.startsWith("video/");
    const baseName = `status-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const tempExt = ext || (isVideo ? ".mov" : ".jpg");
    const tempInput = path.join(uploadsDir, `${baseName}-raw${tempExt}`);

    await new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(tempInput);
      part.file.pipe(ws);
      ws.on("finish", resolve);
      ws.on("error", reject);
      part.file.on("error", reject);
    });

    let finalFilePath = tempInput;

    if (isVideo) {
      let transcoded = path.join(uploadsDir, `${baseName}.mp4`);
      if (path.resolve(transcoded) === path.resolve(tempInput)) {
        transcoded = path.join(uploadsDir, `${baseName}-out.mp4`);
      }

      await new Promise((resolve, reject) => {
        ffmpeg(tempInput)
          .outputOptions([
            "-c:v libx264",
            "-preset veryfast",
            "-crf 23",
            "-pix_fmt yuv420p",
            "-movflags +faststart",
            "-c:a aac",
            "-b:a 128k",
            "-ar 44100",
            "-ac 2"
          ])
          .format("mp4")
          .on("end", resolve)
          .on("error", reject)
          .save(transcoded);
      });

      if (fs.existsSync(tempInput)) {
        fs.unlinkSync(tempInput);
      }
      finalFilePath = transcoded;
    }

    const fileName = path.basename(finalFilePath);
    const mediaUrl = buildPublicMediaUrl(`/uploads/status-media/${fileName}`);

    return reply.send({
      message: "Upload successful",
      mediaUrl
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ message: "Upload failed" });
  }
};

exports.trackNotificationOpened = async (request, reply) => {
  try {
    const result = await userService.trackNotificationOpened(request.body || {});
    return result;
  } catch (error) {
    const statusCode = error && error.statusCode ? error.statusCode : 500;
    reply.code(statusCode).send(error);
  }
};

exports.trackThemeChanged = async (request, reply) => {
  try {
    const result = await userService.trackThemeChanged(request.body || {});
    return result;
  } catch (error) {
    const statusCode = error && error.statusCode ? error.statusCode : 500;
    reply.code(statusCode).send(error);
  }
};
