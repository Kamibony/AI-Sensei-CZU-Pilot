import {initializeApp} from "firebase-admin/app";
// ZMĚNA: Odebrali jsme setGlobalOptions
import {onCall, onRequest} from "firebase-functions/v2/https";
import {VertexAI, HarmCategory, HarmBlockThreshold} from "@google-cloud/vertexai";
import {getStorage} from "firebase-admin/storage";
import {Response} from "firebase-functions/v1";

initializeApp();

// --- AI Funkce pro aplikaci ---

// OPRAVA: Přidáváme .region("europe-west1") ke každé funkci
export const generateText = onCall({region: "europe-west1"}, async (request) => {
  const vertex_ai = new VertexAI({
    project: "ai-sensei-czu-pilot",
    location: "europe-west1",
  });

  const model = "gemini-1.5-flash-001";
  const generativeModel = vertex_ai.preview.getGenerativeModel({
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

// OPRAVA: Přidáváme .region("europe-west1") ke každé funkci
export const generateJson = onCall({region: "europe-west1"}, async (request) => {
  const vertex_ai = new VertexAI({
    project: "ai-sensei-czu-pilot",
    location: "europe-west1",
  });

  const model = "gemini-1.5-flash-001";
  const generativeModel = vertex_ai.preview.getGenerativeModel({
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

// OPRAVA: Přidáváme .region("europe-west1") ke každé funkci
export const generateFromDocument = onCall({region: "europe-west1"}, async (request) => {
  const vertex_ai = new VertexAI({
    project: "ai-sensei-czu-pilot",
    location: "europe-west1",
  });

  const model = "gemini-1.5-flash-001";
  const generativeModel = vertex_ai.preview.getGenerativeModel({
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

// OPRAVA: Přidáváme .region("europe-west1") ke každé funkci
export const telegramWebhook = onRequest({region: "europe-west1"}, (req, res: Response) => {
  console.log("Telegram webhook called with:", req.body);
  res.status(200).send("Webhook received!");
});

// OPRAVA: Přidáváme .region("europe-west1") ke každé funkci
export const sendMessageToStudent = onCall({region: "europe-west1"}, async (request) => {
  const studentId = request.data.studentId;
  const message = request.data.message;
  console.log(`Pretending to send message to student ${studentId}: ${message}`);
  return {status: "Message sent successfully (simulation)"};
});