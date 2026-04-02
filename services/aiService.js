const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const { buildPublicMediaUrl } = require("../utils/mediaUrl");

function getModeInstruction(mode) {
  const value = String(mode || "").toLowerCase().trim();

  if (value === "funny") {
    return `
You are Chattr AI in funny mode.

Personality:
- Humorous, playful, slightly sarcastic
- Add light jokes when appropriate
- Keep replies short and entertaining

Rules:
- Do NOT over-explain
- Keep it casual
- Make user smile 😄`;
  }

  if (value === "professional") {
    return `
You are Chattr AI in professional mode.

Personality:
- Formal, polite, clear
- Well-structured responses
- Business-like tone

Rules:
- No slang
- No emojis
- Keep it concise and professional`;
  }

  if (value === "smart" || value === "assistant") {
    return `
You are Chattr AI, a smart assistant inside a chat app.

Personality:
- Helpful, natural, and efficient
- Short and conversational
- Slightly witty

Capabilities:
- Answer questions
- Help write messages
- Give suggestions

Rules:
- Keep replies short
- No robotic tone
- No long essays unless asked`;
  }

  return `
You are Chattr AI in friendly mode.

Personality:
- Warm, natural, conversational
- Like a close friend chatting
- Slightly expressive

Rules:
- Keep replies short
- Use light emojis occasionally
- Be engaging but not too much`;
}

async function getAIReply(message, contextMessages = []) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) {
    throw { message: "GROQ_API_KEY is not set" };
  }

  const normalizedContext = Array.isArray(contextMessages)
    ? contextMessages
      .filter((item) => item && (item.role === "user" || item.role === "assistant"))
      .map((item) => ({
        role: item.role,
        content: String(item.content || "")
      }))
      .filter((item) => item.content.trim().length > 0)
    : [];

  const promptMessages =
    normalizedContext.length > 0
      ? normalizedContext
      : [
        {
          role: "user",
          content: String(message || "")
        }
      ];

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `
              You are Chattr AI, a smart, friendly, and slightly witty assistant inside a modern chat app.

                Your personality:
                - Talk like a real human, not like a robot
                - Keep replies short and conversational (1–3 lines max)
                - Be helpful but casual
                - Add light humor when appropriate
                - Never sound too formal or robotic

                Chat style:
                - Use natural texting tone (like WhatsApp)
                - Avoid long paragraphs
                - Sometimes use emojis (but not too many)
                - If user is casual, match their tone
                - If user is serious, respond appropriately

                Rules:
                - Do NOT say "As an AI..."
                - Do NOT give long essays unless asked
                - Keep it engaging and human-like

                You are chatting inside a mobile app, not writing an article.
`
        },
        ...promptMessages
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMessage =
      data && data.error && data.error.message
        ? data.error.message
        : "Groq API request failed";
    throw { message: errorMessage };
  }

  const text = data?.choices?.[0]?.message?.content;

  return text || "Sorry, I could not generate a response right now.";
}

async function rewriteWithAI(message, mode = "") {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_REWRITE_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) {
    throw { message: "GROQ_API_KEY is not set" };
  }

  const modeInstruction = getModeInstruction(mode);
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `
Rewrite the user's message in a clearer, more natural, and polished way.

Rules:
- Keep original meaning
- Keep it short
- Improve tone and clarity
- No explanation, only rewritten text

${modeInstruction}
          `
        },
        {
          role: "user",
          content: String(message || "")
        }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMessage =
      data && data.error && data.error.message
        ? data.error.message
        : "Groq API request failed";
    throw { message: errorMessage };
  }

  const rewrittenText = data?.choices?.[0]?.message?.content;
  return rewrittenText || String(message || "");
}

async function generateSuggestions(message, mode = "") {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_SUGGEST_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) {
    throw { message: "GROQ_API_KEY is not set" };
  }

  const modeInstruction = getModeInstruction(mode);
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `
Generate 3 short reply suggestions for a message.

Rules:
- Very short (1 line each)
- Natural texting style
- Different tones
- Return ONLY JSON array

Example:
["Yes 👍", "On my way", "Can't make it"]

${modeInstruction}
          `
        },
        {
          role: "user",
          content: String(message || "")
        }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMessage =
      data && data.error && data.error.message
        ? data.error.message
        : "Groq API request failed";
    throw { message: errorMessage };
  }

  const text = data?.choices?.[0]?.message?.content || "[]";

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
  } catch (error) {
    const match = text.match(/\[.*\]/s);
    if (!match) {
      return [];
    }

    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
  }
}

async function generateAutoReply(message) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_AUTOREPLY_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) {
    throw { message: "GROQ_API_KEY is not set" };
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `
Generate a short auto-reply for a chat message.

Rules:
- Keep it very short
- Sound natural
- Casual tone
- No explanation
          `
        },
        {
          role: "user",
          content: String(message || "")
        }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMessage =
      data && data.error && data.error.message
        ? data.error.message
        : "Groq API request failed";
    throw { message: errorMessage };
  }

  const text = data?.choices?.[0]?.message?.content;
  return text || "Got it.";
}

async function summarizeChatWithAI(chatText, mode = "") {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_SUMMARIZE_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) {
    throw { message: "GROQ_API_KEY is not set" };
  }

  const modeInstruction = getModeInstruction(mode);
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `
Summarize the conversation in a short and clear way.

Rules:
- Max 2–3 lines
- Highlight key topics
- Keep it simple
- No extra explanation

${modeInstruction}
          `
        },
        {
          role: "user",
          content: String(chatText || "")
        }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const errorMessage =
      data && data.error && data.error.message
        ? data.error.message
        : "Groq API request failed";
    throw { message: errorMessage };
  }

  return data?.choices?.[0]?.message?.content || "No summary available.";
}

async function askAssistantWithAI(prompt, mode = "") {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_ASK_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) {
    throw { message: "GROQ_API_KEY is not set" };
  }

  const modeInstruction = getModeInstruction(mode || "smart");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: modeInstruction
        },
        {
          role: "user",
          content: String(prompt || "")
        }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const errorMessage =
      data && data.error && data.error.message
        ? data.error.message
        : "Groq API request failed";
    throw { message: errorMessage };
  }

  return data?.choices?.[0]?.message?.content || "No response available.";
}

async function extractTextForGroqDocument(fileBuffer, mimeType) {
  const normalizedMime = String(mimeType || "").toLowerCase();
  const rawBuffer = Buffer.from(fileBuffer || []);

  if (normalizedMime === "application/pdf") {
    const extractHeuristicPdfText = () => {
      const latin = rawBuffer.toString("latin1");
      const printableRuns = latin.match(/[A-Za-z0-9][\x20-\x7E]{15,}/g) || [];
      const filtered = printableRuns
        .filter(
          (line) =>
            !/^(obj|endobj|stream|endstream|xref|trailer|startxref|\/Type|\/Filter)/i.test(
              line.trim()
            )
        )
        .join("\n")
        .replace(/\s+/g, " ")
        .trim();
      return filtered;
    };

    try {
      const parsed = await pdfParse(rawBuffer);
      const pdfText = String(parsed?.text || "").replace(/\u0000/g, "").trim();
      if (!pdfText) {
        throw new Error("empty-pdf-text");
      }
      return pdfText;
    } catch (error) {
      const fallbackText = extractHeuristicPdfText();
      if (fallbackText && fallbackText.length >= 120) {
        return fallbackText;
      }
      throw {
        statusCode: 422,
        message:
          "Unable to read this PDF. If it is a scanned/image-only PDF, convert it to selectable text or upload TXT/CSV."
      };
    }
  }

  if (
    normalizedMime === "application/msword" ||
    normalizedMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    throw {
      statusCode: 422,
      message:
        "DOC/DOCX parsing is not enabled in Groq mode yet. Please export as TXT/PDF/CSV and retry."
    };
  }

  const text = rawBuffer.toString("utf8");
  const cleaned = text.replace(/\u0000/g, "").trim();
  if (!cleaned) {
    throw { statusCode: 422, message: "Uploaded file appears empty or unreadable." };
  }

  return cleaned;
}

async function documentAnalyzerWithGroq(fileBuffer, mimeType, prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  const model =
    process.env.GROQ_DOC_MODEL ||
    process.env.GROQ_ASK_MODEL ||
    process.env.GROQ_MODEL ||
    "llama-3.3-70b-versatile";

  if (!apiKey) {
    throw { message: "GROQ_API_KEY is not set" };
  }

  const documentText = await extractTextForGroqDocument(fileBuffer, mimeType);
  const maxChars = Number(process.env.GROQ_DOC_MAX_CHARS || 16000);
  const clipped = documentText.slice(0, maxChars);
  const userPrompt =
    (typeof prompt === "string" && prompt.trim()) ||
    "Analyze this document and provide key points clearly.";

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a document analysis assistant. Return concise and structured analysis with key points, findings, and actionable insights."
        },
        {
          role: "user",
          content:
            `${userPrompt}\n\n` +
            "Document content starts below:\n" +
            "-----\n" +
            `${clipped}\n` +
            "-----"
        }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const errorMessage =
      data?.error?.message ||
      data?.message ||
      "Groq API request failed";
    throw { message: errorMessage };
  }

  const output = data?.choices?.[0]?.message?.content?.trim();
  return {
    output: output || "No analysis returned.",
    model
  };
}

async function generateImageWithAI(prompt, options = {}) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const imageModel = process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell";

  if (!accountId) {
    throw { message: "CLOUDFLARE_ACCOUNT_ID is not set" };
  }
  if (!apiToken) {
    throw { message: "CLOUDFLARE_API_TOKEN is not set" };
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${imageModel}`;
  const payload = {
    prompt: String(prompt || "")
  };

  if (options.negative_prompt) payload.negative_prompt = String(options.negative_prompt);
  if (options.width) payload.width = Number(options.width);
  if (options.height) payload.height = Number(options.height);
  if (options.steps) payload.steps = Number(options.steps);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok || data?.success === false) {
    const errorMessage =
      data?.errors?.[0]?.message ||
      data?.result?.error ||
      data?.error ||
      "Cloudflare image generation failed";
    throw { message: errorMessage };
  }

  const imageBase64 = data?.result?.image || data?.result?.images?.[0];
  if (!imageBase64) {
    throw { message: "Cloudflare did not return image data" };
  }

  const uploadsDir = path.join(process.cwd(), "uploads", "ai-images");
  fs.mkdirSync(uploadsDir, { recursive: true });
  const fileName = `ai-${Date.now()}-${Math.floor(Math.random() * 100000)}.png`;
  const filePath = path.join(uploadsDir, fileName);
  fs.writeFileSync(filePath, imageBase64, "base64");

  const imageUrl = buildPublicMediaUrl(`/uploads/ai-images/${fileName}`);

  return { imageUrl };
}

async function textToSpeechWithDeepgram(text, options = {}) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  const model =
    options.model ||
    options.voice ||
    process.env.DEEPGRAM_TTS_MODEL ||
    "aura-2-thalia-en";

  if (!apiKey) {
    throw { message: "DEEPGRAM_API_KEY is not set" };
  }

  const url = `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: String(text || "")
    })
  });

  if (!response.ok) {
    let errorMessage = "Deepgram TTS request failed";
    try {
      const errorJson = await response.json();
      errorMessage = errorJson?.err_msg || errorJson?.message || errorMessage;
    } catch (error) {
      // Ignore JSON parse errors for non-JSON bodies
    }
    throw { message: errorMessage };
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const uploadsDir = path.join(process.cwd(), "uploads", "ai-audio");
  fs.mkdirSync(uploadsDir, { recursive: true });
  const fileName = `tts-${Date.now()}-${Math.floor(Math.random() * 100000)}.mp3`;
  const filePath = path.join(uploadsDir, fileName);
  fs.writeFileSync(filePath, buffer);

  const audioUrl = buildPublicMediaUrl(`/uploads/ai-audio/${fileName}`);

  return { audioUrl, model };
}

async function speechToTextWithDeepgram(audioBuffer, mimeType, options = {}) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  const model = options.model || process.env.DEEPGRAM_STT_MODEL || "nova-2";

  if (!apiKey) {
    throw { message: "DEEPGRAM_API_KEY is not set" };
  }

  if (!audioBuffer || !audioBuffer.length) {
    throw { message: "Audio buffer is empty" };
  }

  const url =
    `https://api.deepgram.com/v1/listen` +
    `?model=${encodeURIComponent(model)}` +
    `&smart_format=true` +
    `&punctuate=true`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": mimeType || "audio/wav"
    },
    body: audioBuffer
  });

  const data = await response.json();
  if (!response.ok) {
    const errorMessage =
      data?.err_msg ||
      data?.message ||
      data?.error ||
      "Deepgram speech-to-text request failed";
    throw { message: errorMessage };
  }

  const transcript =
    data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

  return {
    transcript,
    model,
    raw: data
  };
}

async function voiceAgentWithAI(audioBuffer, mimeType, options = {}) {
  const sttModel = options.stt_model || process.env.DEEPGRAM_STT_MODEL || "nova-2";
  const ttsModel = options.tts_model || process.env.DEEPGRAM_TTS_MODEL || "aura-2-thalia-en";
  const mode = options.mode || "smart";

  const sttResult = await speechToTextWithDeepgram(audioBuffer, mimeType, { model: sttModel });
  const transcript = String(sttResult?.transcript || "").trim();

  if (!transcript) {
    return {
      transcript: "",
      aiText: "I could not hear any clear speech. Please try again.",
      audioUrl: null,
      sttModel,
      ttsModel
    };
  }

  const aiText = await askAssistantWithAI(transcript, mode);
  const ttsResult = await textToSpeechWithDeepgram(aiText, { model: ttsModel });

  return {
    transcript,
    aiText,
    audioUrl: ttsResult.audioUrl,
    sttModel,
    ttsModel
  };
}

async function runGeminiWithFile(prompt, fileBuffer, mimeType, model) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw { message: "GEMINI_API_KEY is not set" };
  }

  const base64Data = Buffer.from(fileBuffer).toString("base64");
  const primaryModel = model || process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const fallbackModels = (process.env.GEMINI_FALLBACK_MODELS || "gemini-2.5-flash,gemini-1.5-flash")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const modelsToTry = [primaryModel, ...fallbackModels.filter((item) => item !== primaryModel)];

  const isQuotaError = (statusCode, errorText) => {
    const value = String(errorText || "").toLowerCase();
    return (
      statusCode === 429 ||
      value.includes("quota") ||
      value.includes("rate limit") ||
      value.includes("resource_exhausted")
    );
  };

  let lastErrorMessage = "Gemini request failed";

  for (let index = 0; index < modelsToTry.length; index += 1) {
    const geminiModel = modelsToTry[index];
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent` +
      `?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: String(prompt || "") },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    if (response.ok) {
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p) => p?.text || "").join("\n").trim();
      return {
        output: text || "No result from Gemini.",
        model: geminiModel,
        raw: data
      };
    }

    const errorMessage =
      data?.error?.message ||
      data?.message ||
      "Gemini request failed";
    lastErrorMessage = errorMessage;

    const shouldTryNext =
      isQuotaError(response.status, errorMessage) && index < modelsToTry.length - 1;
    if (!shouldTryNext) {
      throw { message: errorMessage };
    }
  }

  throw { message: lastErrorMessage };
}

async function documentAnalyzerWithGemini(fileBuffer, mimeType, prompt) {
  const model = process.env.GEMINI_DOC_MODEL || process.env.GEMINI_MODEL || "gemini-1.5-flash";
  return runGeminiWithFile(
    prompt || "Analyze this document and provide key points clearly.",
    fileBuffer,
    mimeType,
    model
  );
}

async function imageUnderstandingWithGemini(fileBuffer, mimeType, prompt) {
  const model = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || "gemini-1.5-flash";
  return runGeminiWithFile(
    prompt || "Understand this image and explain what it contains.",
    fileBuffer,
    mimeType,
    model
  );
}

module.exports = {
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
  documentAnalyzerWithGemini,
  imageUnderstandingWithGemini
};
