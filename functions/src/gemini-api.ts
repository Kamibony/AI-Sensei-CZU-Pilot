// functions/src/gemini-api.ts

import { VertexAI } from "@google-cloud/vertexai";

// 1. Centralized Initialization and Configuration
const REGION = "europe-west1";
const vertex_ai = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: REGION });

const MODELS = {
  PRO: "gemini-1.5-pro-001",
  VISION: "gemini-1.5-pro-vision-001"
};

const generativeModel = vertex_ai.getGenerativeModel({ model: MODELS.PRO });
const generativeVisionModel = vertex_ai.getGenerativeModel({ model: MODELS.VISION });

/**
 * A reusable helper to stream responses from a Gemini model.
 * @param model The Vertex AI model instance to use.
 * @param requestBody The request payload for the model.
 * @returns A promise that resolves to the aggregated text response.
 */
async function streamGeminiResponse(model: any, requestBody: any): Promise<string> {
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
  const request = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  return await streamGeminiResponse(generativeModel, request);
}

export async function generateJsonFromPrompt(prompt: string): Promise<any> {
  const jsonPrompt = `${prompt}\n\nPlease provide the response in a valid JSON format.`;
  const request = {
    contents: [{ parts: [{ text: jsonPrompt }] }],
    generationConfig: {
        responseMimeType: "application/json",
    },
  };
  const rawJsonText = await streamGeminiResponse(generativeModel, request);
  try {
    return JSON.parse(rawJsonText);
  } catch (e) {
    console.error("Failed to parse JSON from Gemini:", rawJsonText);
    throw new Error("Model returned invalid JSON.");
  }
}

export async function generateTextFromDocument(filePath: string, prompt: string): Promise<string> {
    const bucketName = "ai-sensei-czu-pilot.appspot.com";
    const request = {
        contents: [
            {
                parts: [
                    { fileData: { mimeType: "application/pdf", fileUri: `gs://${bucketName}/${filePath}` } },
                    { text: prompt },
                ],
            },
        ],
    };
    return await streamGeminiResponse(generativeVisionModel, request);
}