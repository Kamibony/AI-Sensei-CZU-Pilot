// functions/src/gemini-api.ts

import {
  VertexAI,
  GenerativeModel,
  GenerateContentRequest,
} from "@google-cloud/vertexai";

const vertex_ai = new VertexAI({ project: process.env.GCLOUD_PROJECT });

const model = vertex_ai.getGenerativeModel({ model: "gemini-1.5-pro-preview-0409" });

async function streamGeminiResponse(requestBody: GenerateContentRequest): Promise<string> {
    if (process.env.FUNCTIONS_EMULATOR === "true") {
        console.log("EMULATOR_MOCK: Bypassing real API call.");
        if (requestBody.generationConfig?.responseMimeType === "application/json") {
            return JSON.stringify({ mock: "This is a mock JSON response from the emulator." });
        }
        return "This is a mock response from the emulator.";
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
    return JSON.parse(rawJsonText);
  } catch (_e) {
    console.error("Failed to parse JSON from Gemini:", rawJsonText);
    throw new Error("Model returned invalid JSON.");
  }
}

export async function generateTextFromDocument(filePath: string, prompt: string): Promise<string> {
    const bucketName = process.env.GCLOUD_PROJECT + ".appspot.com";
    console.log(`[gemini-api] Generating from document. Bucket: ${bucketName}, Path: ${filePath}`);

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
    return await streamGeminiResponse(request);
}