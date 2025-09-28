/**
 * Importy potřebných modulů
 */
import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import * as logger from "firebase-functions/logger";
import { HttpsOptions, onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { VertexAI } from "@google-cloud/vertexai";

// Inicializace Firebase a služeb
initializeApp();
const storage = getStorage();

// --- LENIVÁ INICIALIZACE PRO VERTEX AI ---
let vertex_ai: VertexAI | undefined;

// Globální nastavení pro všechny funkce
const functionOptions: HttpsOptions = {
  region: "europe-west1",
  cors: true // Povolí požadavky ze všech zdrojů, včetně lokálního emulátoru
};

// --- FUNKCE PRO TELEGRAM ---
export const telegramWebhook = onRequest(
    functionOptions,
    async (request, response) => {
      logger.info("Telegram webhook called!", { body: request.body });
      response.status(200).send("OK");
    },
);

export const sendMessageToStudent = onCall(
    functionOptions,
    async (request) => {
        logger.info("sendMessageToStudent called!", { data: request.data });
        return { success: true, message: "Message sent successfully." };
    },
);

// --- FUNKCE PRO GEMINI API ---
export const generateText = onCall(functionOptions, async (request) => {
  if (!vertex_ai) {
    vertex_ai = new VertexAI({ project: "ai-sensei-czu-pilot", location: "europe-west1" });
  }
  
  const generativeModel = vertex_ai.getGenerativeModel({ model: "gemini-1.5-flash-preview-0514" });
  
  const { prompt, systemInstruction } = request.data;
  logger.info("Generating text with prompt:", { prompt });

  if (!prompt) {
    throw new HttpsError("invalid-argument", "Prompt is required.");
  }

  try {
    const chat = generativeModel.startChat({
      history: systemInstruction ? [{ role: "user", parts: [{ text: systemInstruction }] }, { role: "model", parts: [{ text: "Rozumím. Jsem připraven." }] }] : [],
    });
    const result = await chat.sendMessage(prompt);
    const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return { text: responseText };
  } catch (error) {
    logger.error("Error generating text from Gemini:", error);
    throw new HttpsError("internal", "Failed to generate text from AI.");
  }
});

export const generateJson = onCall(functionOptions, async (request) => {
    if (!vertex_ai) {
        vertex_ai = new VertexAI({ project: "ai-sensei-czu-pilot", location: "europe-west1" });
    }
    
    const { prompt, schema } = request.data;
    logger.info("Generating JSON with prompt:", { prompt });

    if (!prompt || !schema) {
        throw new HttpsError("invalid-argument", "Prompt and schema are required.");
    }
    
    const generativeModelWithJson = vertex_ai.getGenerativeModel({
        model: "gemini-1.5-flash-preview-0514",
        generationConfig: { responseMimeType: "application/json" },
    });

    try {
        const fullPrompt = `Na základě následujícího zadání vygeneruj JSON objekt, který přesně odpovídá tomuto schématu: ${JSON.stringify(schema)}. Zadání: "${prompt}"`;
        const result = await generativeModelWithJson.generateContent(fullPrompt);
        const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        
        return JSON.parse(responseText);
    } catch (error) {
        logger.error("Error generating JSON from Gemini:", error);
        throw new HttpsError("internal", "Failed to generate JSON from AI.");
    }
});

// --- NOVÁ FUNKCE PRO PRÁCI SE SOUBORY ---
export const generateFromDocument = onCall(functionOptions, async (request) => {
  const { storagePath, userPrompt } = request.data;
  
  if (!storagePath || !userPrompt) {
    throw new HttpsError("invalid-argument", "Chybí 'storagePath' nebo 'userPrompt'.");
  }

  logger.info("Načítám soubor ze Storage:", { path: storagePath });

  try {
    // 1. Stáhneme soubor z Firebase Storage
    const [fileBuffer] = await storage.bucket().file(storagePath).download();
    const documentContent = fileBuffer.toString("utf8");

    logger.info("Soubor načten, obsah odesílám do Gemini.");

    // 2. Sestavíme finální prompt pro Gemini
    const finalPrompt = `Jako expertní asistent vytvoř požadovaný obsah na základě následujícího dokumentu.
    
    --- OBSAH DOKUMENTU ---
    ${documentContent}
    --- KONEC DOKUMENTU ---

    Požadavek uživatele: "${userPrompt}"
    `;

    // 3. Zavoláme Gemini
    if (!vertex_ai) {
      vertex_ai = new VertexAI({ project: "ai-sensei-czu-pilot", location: "europe-west1" });
    }
    const generativeModel = vertex_ai.getGenerativeModel({ model: "gemini-1.5-flash-preview-0514" });
    
    const result = await generativeModel.generateContent(finalPrompt);
    const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return { text: responseText };

  } catch (error) {
    logger.error("Chyba při zpracování souboru a volání Gemini:", error);
    throw new HttpsError("internal", "Nepodařilo se vygenerovat obsah ze souboru.");
  }
});