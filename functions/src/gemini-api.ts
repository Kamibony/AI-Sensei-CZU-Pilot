// functions/src/gemini-api.ts

import {
  VertexAI,
  GenerateContentRequest,
  HarmCategory,
  HarmBlockThreshold,
} from "@google-cloud/vertexai";

// --- KONFIGURACE MODELU ---
const GCLOUD_PROJECT = process.env.GCLOUD_PROJECT;
if (!GCLOUD_PROJECT) {
    throw new Error("GCLOUD_PROJECT environment variable not set.");
}

const vertex_ai = new VertexAI({ project: GCLOUD_PROJECT });

const model = vertex_ai.getGenerativeModel({
    model: "gemini-1.5-pro-preview-0409",
    // Konfigurace bezpečnosti pro model
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ],
});

// --- HLAVNÍ FUNKCE PRO KOMUNIKACI S GEMINI ---
async function streamGeminiResponse(requestBody: GenerateContentRequest): Promise<string> {
    const functionName = requestBody.generationConfig?.responseMimeType === "application/json"
        ? "generateJson"
        : "generateText";

    // --- MOCK PRO EMULÁTOR ---
    if (process.env.FUNCTIONS_EMULATOR === "true") {
        console.log(`EMULATOR_MOCK for ${functionName}: Bypassing real API call.`);
        if (functionName === "generateJson") {
            return JSON.stringify({ mock: "This is a mock JSON response from the emulator." });
        }
        return `This is a mock response from the emulator for a text prompt.`;
    }

    // --- VOLÁNÍ SKUTEČNÉHO API ---
    try {
        console.log(`[gemini-api:${functionName}] Sending request to Vertex AI...`);
        const streamResult = await model.generateContentStream(requestBody);
        let fullText = "";

        // Sestavení kompletní odpovědi z streamu
        for await (const item of streamResult.stream) {
            // Zkontrolujeme, zda existují kandidáti a text v odpovědi
            if (item.candidates && item.candidates[0].content.parts[0].text) {
                fullText += item.candidates[0].content.parts[0].text;
            }
        }

        console.log(`[gemini-api:${functionName}] Successfully received and aggregated stream response.`);
        return fullText;

    } catch (error) {
        console.error(`[gemini-api:${functionName}] Error calling Vertex AI API:`, error);

        // Vylepšené chybové hlášení
        if (error instanceof Error) {
            throw new Error(`Vertex AI API call failed: ${error.message}`);
        }
        throw new Error("An unknown error occurred while communicating with the Vertex AI API.");
    }
}

// --- EXPORTOVANÉ FUNKCE PRO POUŽITÍ V CLOUD FUNCTIONS ---

/**
 * Generuje text na základě textového promptu.
 * @param prompt Textový vstup pro model.
 * @returns Vygenerovaný text.
 */
export async function generateTextFromPrompt(prompt: string): Promise<string> {
  const request: GenerateContentRequest = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };
  return await streamGeminiResponse(request);
}

/**
 * Generuje JSON objekt na základě textového promptu.
 * @param prompt Textový vstup pro model s instrukcemi pro JSON.
 * @returns JSON objekt.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateJsonFromPrompt(prompt: string): Promise<any> {
  const jsonPrompt = `${prompt}\n\nPlease provide the response in a valid JSON format.`;
  const request: GenerateContentRequest = {
    contents: [{ role: "user", parts: [{ text: jsonPrompt }] }],
    generationConfig: {
        responseMimeType: "application/json",
    },
  };

  const rawJsonText = await streamGeminiResponse(request);

  try {
    const parsedJson = JSON.parse(rawJsonText);
    console.log("[gemini-api:generateJson] Successfully parsed JSON response.");
    return parsedJson;
  } catch (e) {
    console.error("[gemini-api:generateJson] Failed to parse JSON from Gemini response:", rawJsonText);
    throw new Error("Model returned a malformed JSON string.");
  }
}

/**
 * Generuje text na základě obsahu souboru a textového promptu.
 * @param filePath Cesta k souboru ve Firebase Storage (např. 'courses/courseId/media/filename.pdf').
 * @param prompt Textový vstup pro model.
 * @returns Vygenerovaný text.
 */
export async function generateTextFromDocument(filePath: string, prompt: string): Promise<string> {
    const bucketName = `${GCLOUD_PROJECT}.appspot.com`;
    const fileUri = `gs://${bucketName}/${filePath}`;
    console.log(`[gemini-api:generateTextFromDocument] Generating from document. URI: ${fileUri}`);

    const request: GenerateContentRequest = {
        contents: [
            {
                role: "user",
                parts: [
                    { fileData: { mimeType: "application/pdf", fileUri: fileUri } },
                    { text: prompt },
                ],
            },
        ],
    };
    return await streamGeminiResponse(request);
}