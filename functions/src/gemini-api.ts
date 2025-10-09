import {
  VertexAI,
  GenerateContentRequest,
  HarmCategory,
  HarmBlockThreshold,
  Part,
} from "@google-cloud/vertexai";
import { getStorage } from "firebase-admin/storage";
import { ZodError } from "zod";
import { schemas, JsonContentType } from "./schemas";
import { getPromptForContentType, PromptData } from "./prompts";

// --- CONFIGURATION ---
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

/**
 * A custom error class for AI response validation issues.
 */
export class AIVisualizationError extends Error {
    constructor(message: string, public issues?: ZodError["issues"]) {
        super(message);
        this.name = "AIVisualizationError";
    }
}

/**
 * Cleans the raw text response from the AI model.
 * This is crucial because models sometimes wrap JSON in markdown backticks.
 * @param rawText The raw text from the AI.
 * @returns Cleaned text ready for JSON parsing.
 */
function cleanJsonString(rawText: string): string {
    return rawText.replace(/^```json\s*|```$/g, "").trim();
}

/**
 * Handles the actual call to the Gemini API.
 * @param requestBody The complete request body for the API.
 * @returns The raw string response from the API.
 */
async function streamGeminiResponse(requestBody: GenerateContentRequest): Promise<string> {
    const isJson = requestBody.generationConfig?.responseMimeType === "application/json";

    if (process.env.FUNCTIONS_EMULATOR === "true") {
        console.log(`EMULATOR_MOCK for ${isJson ? "JSON" : "Text"}: Bypassing real API call.`);
        if (isJson) {
            // This mock data is specifically for the 'presentation' content type.
            // It is used for local emulator verification to ensure the frontend
            // correctly renders a valid schema-compliant response.
            const mockPresentation = {
                slides: [
                    {
                        title: "Mock Slide 1: Introduction",
                        points: ["This is a point on the first mock slide.", "This is another point."]
                    },
                    {
                        title: "Mock Slide 2: Conclusion",
                        points: ["This is the final point on the second mock slide."]
                    }
                ]
            };
            return JSON.stringify(mockPresentation);
        }
        return "This is a mock response from the emulator for a text prompt.";
    }

    try {
        console.log(`[gemini-api] Sending request to Vertex AI with model 'gemini-2.5-pro' in '${LOCATION}'...`);
        const streamResult = await model.generateContentStream(requestBody);
        let fullText = "";

        for await (const item of streamResult.stream) {
            if (item.candidates && item.candidates[0].content.parts[0].text) {
                fullText += item.candidates[0].content.parts[0].text;
            }
        }

        console.log("[gemini-api] Successfully received and aggregated stream response.");
        return fullText;

    } catch (error) {
        console.error("[gemini-api] Error calling Vertex AI API:", error);
        if (error instanceof Error) {
            throw new Error(`Vertex AI API call failed: ${error.message}`);
        }
        throw new Error("An unknown error occurred while communicating with the Vertex AI API.");
    }
}

/**
 * The single, consolidated function for generating content from the AI.
 * It handles text, JSON, and RAG generation, including response validation.
 *
 * @param contentType The type of content to generate (e.g., 'presentation', 'text').
 * @param promptData Data for constructing the prompt, including the user's input.
 * @param filePaths Optional array of Cloud Storage file paths for RAG.
 * @returns The generated content, either as a string or a validated JSON object.
 */
export async function generateContent(contentType: string, promptData: PromptData, filePaths: string[] = []): Promise<unknown> {
    const isJsonOutput = contentType in schemas;
    const finalPrompt = getPromptForContentType(contentType, promptData);

    const parts: Part[] = [];

    // 1. Prepare file parts for RAG if filePaths are provided
    if (filePaths.length > 0) {
        const bucket = getStorage().bucket();
        for (const filePath of filePaths) {
            const file = bucket.file(filePath);
            console.log(`[gemini-api:generateContent] Reading file from gs://${bucket.name}/${filePath}`);
            try {
                const [fileBuffer] = await file.download();
                parts.push({
                    inlineData: {
                        mimeType: "application/pdf",
                        data: fileBuffer.toString("base64"),
                    }
                });
            } catch (error) {
                 console.error(`[gemini-api:generateContent] Failed to download file: ${filePath}`, error);
                 throw new Error(`Failed to read file for RAG: ${filePath}`);
            }
        }
    }

    // 2. Add the final text prompt
    parts.push({ text: finalPrompt });

    // 3. Construct the request
    const request: GenerateContentRequest = {
        contents: [{ role: "user", parts }],
    };

    if (isJsonOutput) {
        request.generationConfig = {
            responseMimeType: "application/json",
        };
    }

    // 4. Call the AI
    const rawResponse = await streamGeminiResponse(request);

    // 5. Process and validate the response
    if (isJsonOutput) {
        const cleanedResponse = cleanJsonString(rawResponse);
        try {
            const parsedJson = JSON.parse(cleanedResponse);
            const schema = schemas[contentType as JsonContentType];
            const validatedData = schema.parse(parsedJson);
            return validatedData;
        } catch (error) {
            if (error instanceof ZodError) {
                console.error("[gemini-api:generateContent] Zod validation failed:", error.issues);
                throw new AIVisualizationError("AI response did not match the required structure.", error.issues);
            } else {
                console.error("[gemini-api:generateContent] Failed to parse JSON from AI response:", cleanedResponse);
                throw new Error("Model returned a malformed JSON string.");
            }
        }
    } else {
        // For plain text, just return the response.
        return { text: rawResponse };
    }
}