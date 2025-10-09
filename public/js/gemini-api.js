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

// OPRAVA 1: Explicitne definujeme správnu lokáciu.
const LOCATION = "europe-west1"; 

const vertex_ai = new VertexAI({ project: GCLOUD_PROJECT, location: LOCATION });

// OPRAVA 2: Použijeme správny a Vami overený názov modelu.
const model = vertex_ai.getGenerativeModel({
    model: "gemini-2.5-pro", 
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ],
});

// --- HLAVNÍ FUNKCE PRO KOMUNIKACI S GEMINI (bez zmien) ---
async function streamGeminiResponse(requestBody: GenerateContentRequest): Promise<string> {
    const functionName = requestBody.generationConfig?.responseMimeType === "application/json"
        ? "generateJson"
        : "generateText";

    if (process.env.FUNCTIONS_EMULATOR === "true") {
        console.log(`EMULATOR_MOCK for ${functionName}: Bypassing real API call.`);
        if (functionName === "generateJson") {
            return JSON.stringify({ mock: "This is a mock JSON response from the emulator." });
        }
        return `This is a mock response from the emulator for a text prompt.`;
    }

    try {
        console.log(`[gemini-api:${functionName}] Sending request to Vertex AI with model 'gemini-2.5-pro' in '${LOCATION}'...`);
        const streamResult = await model.generateContentStream(requestBody);
        let fullText = "";

        for await (const item of streamResult.stream) {
            if (item.candidates && item.candidates[0].content.parts[0].text) {
                fullText += item.candidates[0].content.parts[0].text;
            }
        }

        console.log(`[gemini-api:${functionName}] Successfully received and aggregated stream response.`);
        return fullText;

    } catch (error) {
        console.error(`[gemini-api:${functionName}] Error calling Vertex AI API:`, error);
        if (error instanceof Error) {
            throw new Error(`Vertex AI API call failed: ${error.message}`);
        }
        throw new Error("An unknown error occurred while communicating with the Vertex AI API.");
    }
}

// --- EXPORTOVANÉ FUNKCIE (bez zmien) ---

export async function generateTextFromPrompt(prompt: string): Promise<string> {
  const request: GenerateContentRequest = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };
  return await streamGeminiResponse(request);
}

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
  } catch (_e) {
    console.error("[gemini-api:generateJson] Failed to parse JSON from Gemini response:", rawJsonText);
    throw new Error("Model returned a malformed JSON string.");
  }
}

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
