import {initializeApp} from "firebase-admin/app";
import {onCall, onRequest} from "firebase-functions/v2/https";
import {GoogleGenAI, HarmCategory, HarmBlockThreshold} from "@google/genai";
import {getStorage} from "firebase-admin/storage";
import {Response} from "firebase-functions/v1";

initializeApp();

// Initialize the new SDK. It should automatically use the project's
// default credentials and location when deployed on Cloud Functions.
const genAI = new GoogleGenAI();

// --- AI Funkce pro aplikaci ---

export const generateText = onCall({region: "europe-west1"}, async (request) => {
  const model = "gemini-1.5-flash-001";
  const generativeModel = genAI.getGenerativeModel({
    model: model,
    generationConfig: {
      "maxOutputTokens": 8192,
      "temperature": 1,
      "topP": 0.95,
    },
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
    ],
  });

  const textPart = {
    text: request.data.prompt,
  };

  try {
    const result = await generativeModel.generateContent({
      contents: [{role: "user", parts: [textPart]}],
    });
    return result.response;
  } catch (error) {
    console.error("Error generating text:", error);
    throw new Error("Backend error: " + error);
  }
});

export const generateJson = onCall({region: "europe-west1"}, async (request) => {
  const model = "gemini-1.5-flash-001";
  const generativeModel = genAI.getGenerativeModel({
    model: model,
    generationConfig: {
      "responseMimeType": "application/json",
      "maxOutputTokens": 8192,
      "temperature": 1,
      "topP": 0.95,
    },
    safetySettings: [],
  });

  const textPart = {
    text: request.data.prompt,
  };

  try {
    const result = await generativeModel.generateContent({
      contents: [{role: "user", parts: [textPart]}],
    });
    return result.response;
  } catch (error) {
    console.error("Error generating JSON:", error);
    throw new Error("Backend error: " + error);
  }
});

export const generateFromDocument = onCall({region: "europe-west1"}, async (request) => {
  const model = "gemini-1.5-flash-001";
  const generativeModel = genAI.getGenerativeModel({
    model: model,
  });

  const bucketName = "ai-sensei-czu-pilot.appspot.com";
  const filePath = request.data.filePath;
  const prompt = request.data.prompt;

  const filePart = {
    fileData: {
      mimeType: "application/pdf",
      fileUri: `gs://${bucketName}/${filePath}`,
    },
  };

  try {
    const bucket = getStorage().bucket(bucketName);
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`File not found at gs://${bucketName}/${filePath}`);
    }

    const result = await generativeModel.generateContent({
      contents: [{role: "user", parts: [filePart, {text: prompt}]}],
    });
    return result.response;
  } catch (error) {
    console.error("Error generating from document:", error);
    throw new Error("Backend error: " + error);
  }
});

// --- Placeholder funkce pro Telegram ---

export const telegramWebhook = onRequest({region: "europe-west1"}, (req, res: Response) => {
  console.log("Telegram webhook called with:", req.body);
  res.status(200).send("Webhook received!");
});

export const sendMessageToStudent = onCall({region: "europe-west1"}, async (request) => {
  const studentId = request.data.studentId;
  const message = request.data.message;
  console.log(`Pretending to send message to student ${studentId}: ${message}`);
  return {status: "Message sent successfully (simulation)"};
});