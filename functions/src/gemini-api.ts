// functions/src/gemini-api.ts

import {
  VertexAI,
  GenerativeModel,
  GenerateContentRequest,
} from "@google-cloud/vertexai";

// 1. Centralized Initialization and Configuration
const REGION = "us-central1";
const vertex_ai = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: REGION });

const MODELS = {
  PRO: "gemini-pro",
  VISION: "gemini-pro-vision"
};

const generativeModel = vertex_ai.getGenerativeModel({ model: MODELS.PRO });
const generativeVisionModel = vertex_ai.getGenerativeModel({ model: MODELS.VISION });

/**
 * A reusable helper to stream responses from a Gemini model.
 * @param model The Vertex AI model instance to use.
 * @param requestBody The request payload for the model.
 * @returns A promise that resolves to the aggregated text response.
 */
async function streamGeminiResponse(model: GenerativeModel, requestBody: GenerateContentRequest): Promise<string> {
  // When running in the emulator, we can't make real API calls.
  // Return a mock response to allow frontend testing.
    if (process.env.FUNCTIONS_EMULATOR === "true") {
        console.log("EMULATOR_MOCK: Bypassing real API call.");
        // Return a mock JSON string for JSON requests, and plain text for others.
        if (requestBody.generationConfig?.responseMimeType === "application/json") {
            return JSON.stringify({ mock: "This is a mock JSON response from the emulator." });
        }
        return "This is a mock text response from the emulator because real API calls are not available locally.";
    }
  try {
    const streamResult = await model.generateContentStream(requestBody);
    let fullText = "";
    for await (const item of streamResult.stream) {
      if (item.candidates && item.candidates[0].content.parts[0].text) {
        fullText += item.candidates[0].content.parts[0].text;
      }
    }
    return fullText;
  } catch (error) {
    console.error("Error streaming Gemini response:", error);
    throw new Error("Failed to get a valid response from the Gemini API.");
  }
}

// 2. Export High-Level Functions for Your Application Logic
export async function generateTextFromPrompt(prompt: string): Promise<string> {
  const request: GenerateContentRequest = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };
  return await streamGeminiResponse(generativeModel, request);
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
  const rawJsonText = await streamGeminiResponse(generativeModel, request);
  try {
    return JSON.parse(rawJsonText);
  } catch (_e) { // Changed 'e' to '_e' to satisfy the linter
    console.error("Failed to parse JSON from Gemini:", rawJsonText);
    throw new Error("Model returned invalid JSON.");
  }
}

export async function generateTextFromDocument(filePath: string, prompt: string): Promise<string> {
    const bucketName = "ai-sensei-czu-pilot.appspot.com";
    const request: GenerateContentRequest = {
        contents: [
            {
                role: "user",
                parts: [
                    { fileData: { mimeType: "application/pdf", fileUri: `gs://${bucketName}/${filePath}` } },
                    { text: prompt },
                ],
            },
        ],
    };
    return await streamGeminiResponse(generativeVisionModel, request);
}