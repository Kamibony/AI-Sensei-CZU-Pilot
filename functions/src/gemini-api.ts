// functions/src/gemini-api.ts

import {
  VertexAI,
  GenerateContentRequest,
  HarmCategory,
  HarmBlockThreshold,
  Part,
} from "@google-cloud/vertexai";
import { getStorage } from "firebase-admin/storage";

// --- KONFIGURACE MODELU ---
const GCLOUD_PROJECT = process.env.GCLOUD_PROJECT;
if (!GCLOUD_PROJECT) {
    throw new Error("GCLOUD_PROJECT environment variable not set.");
}

const LOCATION = "europe-west1"; 
const vertex_ai = new VertexAI({ project: GCLOUD_PROJECT, location: LOCATION });

const model = vertex_ai.getGenerativeModel({
    model: "gemini-2.5-pro", 
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ],
});

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

export async function generateTextFromPrompt(prompt: string): Promise<string> {
  const request: GenerateContentRequest = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };
  return await streamGeminiResponse(request);
}

export async function generateJsonFromPrompt(prompt: string): Promise<unknown> {
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
    return parsedJson;
  } catch (_e) {
    console.error("[gemini-api:generateJson] Failed to parse JSON from Gemini response:", rawJsonText);
    throw new Error("Model returned a malformed JSON string.");
  }
}

// --- FINÁLNE OPRAVENÁ FUNKCIA ---
export async function generateTextFromDocuments(filePaths: string[], prompt: string): Promise<string> {
    // ZMENA: Namiesto skladania názvu si necháme Admin SDK nájsť predvolený bucket.
    const bucket = getStorage().bucket();
    
    const parts: Part[] = [];

    for (const filePath of filePaths) {
        const file = bucket.file(filePath);
        console.log(`[gemini-api:generateTextFromDocuments] Reading file from gs://${bucket.name}/${filePath}`);

        const [fileBuffer] = await file.download();
        
        parts.push({
            inlineData: {
                mimeType: "application/pdf",
                data: fileBuffer.toString("base64"),
            }
        });
    }

    parts.push({ text: prompt });

    const request: GenerateContentRequest = {
        contents: [{ role: "user", parts: parts }],
    };

    return await streamGeminiResponse(request);
}
