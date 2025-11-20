import type { GenerateContentRequest, Part } from "@google-cloud/vertexai";
const { getStorage } = require("firebase-admin/storage");
const logger = require("firebase-functions/logger");
const { HttpsError } = require("firebase-functions/v2/https");

// Lazy loaded variables
let VertexAI: any;
let HarmCategory: any;
let HarmBlockThreshold: any;
let vertex_ai: any;
let model: any;
let aiplatform: any;

const LOCATION = "europe-west1";

function getGcloudProject() {
    const GCLOUD_PROJECT = process.env.GCLOUD_PROJECT;
    if (!GCLOUD_PROJECT) {
        throw new Error("GCLOUD_PROJECT environment variable not set.");
    }
    return GCLOUD_PROJECT;
}

function initVertexAI() {
    if (!vertex_ai) {
        try {
            const vertexModule = require("@google-cloud/vertexai");
            VertexAI = vertexModule.VertexAI;
            HarmCategory = vertexModule.HarmCategory;
            HarmBlockThreshold = vertexModule.HarmBlockThreshold;

            vertex_ai = new VertexAI({ project: getGcloudProject(), location: LOCATION });
            model = vertex_ai.getGenerativeModel({
                model: "gemini-1.5-pro-preview-0409",
                safetySettings: [
                    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                ],
            });
            console.log("[GeminiAPI] Vertex AI initialized lazily.");
        } catch (e) {
            logger.error("[GeminiAPI] Failed to initialize Vertex AI:", e);
            throw new HttpsError("internal", "Failed to initialize AI services.");
        }
    }
    return model;
}

async function getEmbeddings(text: string): Promise<number[]> {
    if (process.env.FUNCTIONS_EMULATOR === "true") {
        console.log("EMULATOR_MOCK for getEmbeddings: Returning a mock vector.");
        return Array(768).fill(0).map((_, i) => Math.sin(i));
    }

    // Lazy load aiplatform
    if (!aiplatform) {
        aiplatform = require("@google-cloud/aiplatform");
    }

    const { PredictionServiceClient } = aiplatform.v1;
    const { helpers } = aiplatform;

    const clientOptions = {
        apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`,
    };
    const client = new PredictionServiceClient(clientOptions);
    const instances = [helpers.toValue({ content: text, task_type: "RETRIEVAL_DOCUMENT" })];
    const endpoint = `projects/${getGcloudProject()}/locations/${LOCATION}/publishers/google/models/text-embedding-004`;
    const request = {
        endpoint,
        instances,
    };
    try {
        const [response] = await client.predict(request);
        if (!response || !response.predictions || response.predictions.length === 0) {
            throw new HttpsError("internal", "Received an invalid response from the Vertex AI embedding model.");
        }
        const prediction = response.predictions[0];
        const embeddingsValue = prediction.structValue?.fields?.embeddings;
        if (!embeddingsValue || !embeddingsValue.structValue || !embeddingsValue.structValue.fields) {
            throw new HttpsError("internal", "Could not find embeddings in the Vertex AI response.");
        }
        const embeddingValues = embeddingsValue.structValue.fields.values.listValue?.values;
        if (!embeddingValues) {
            throw new HttpsError("internal", "Could not find embedding values in the Vertex AI response.");
        }
        return embeddingValues.map((v: any) => v.numberValue);
    }
    catch (error) {
        logger.error("[gemini-api:getEmbeddings] Error generating embeddings:", error);
        if (error instanceof Error) {
            throw new HttpsError("internal", `Vertex AI embedding call failed: ${error.message}`);
        }
        throw new HttpsError("internal", "An unknown error occurred while generating embeddings.");
    }
}
exports.getEmbeddings = getEmbeddings;

function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
        throw new Error("Vectors must be of the same length to calculate similarity.");
    }
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        magA += vecA[i] * vecA[i];
        magB += vecB[i] * vecB[i];
    }
    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);
    if (magA === 0 || magB === 0) {
        return 0;
    }
    return dotProduct / (magA * magB);
}
exports.calculateCosineSimilarity = calculateCosineSimilarity;

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

    const generativeModel = initVertexAI(); // Ensure initialized

    try {
        console.log(`[gemini-api:${functionName}] Sending request to Vertex AI with model 'gemini-1.5-pro-preview-0409' in '${LOCATION}'...`);
        const streamResult = await generativeModel.generateContentStream(requestBody);
        let fullText = "";
        for await (const item of streamResult.stream) {
            if (item.candidates && item.candidates[0].content.parts[0].text) {
                fullText += item.candidates[0].content.parts[0].text;
            }
        }
        console.log(`[gemini-api:${functionName}] Successfully received and aggregated stream response.`);
        return fullText;
    }
    catch (error) {
        console.error(`[gemini-api:${functionName}] Error calling Vertex AI API:`, error);
        if (error instanceof Error) {
            throw new Error(`Vertex AI API call failed: ${error.message}`);
        }
        throw new Error("An unknown error occurred while communicating with the Vertex AI API.");
    }
}

async function generateTextFromPrompt(prompt: string): Promise<string> {
    const request: GenerateContentRequest = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
    };
    return await streamGeminiResponse(request);
}
exports.generateTextFromPrompt = generateTextFromPrompt;

async function generateJsonFromPrompt(prompt: string): Promise<any> {
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
    }
    catch (e) {
        logger.error("[gemini-api:generateJson] Failed to parse JSON from Gemini response:", rawJsonText, e);
        throw new HttpsError("internal", "Model returned a malformed JSON string.", { response: rawJsonText });
    }
}
exports.generateJsonFromPrompt = generateJsonFromPrompt;

async function generateTextFromDocuments(filePaths: string[], prompt: string): Promise<string> {
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
exports.generateTextFromDocuments = generateTextFromDocuments;

async function generateJsonFromDocuments(filePaths: string[], prompt: string): Promise<any> {
    const bucket = getStorage().bucket();
    const parts: Part[] = [];
    for (const filePath of filePaths) {
        const file = bucket.file(filePath);
        console.log(`[gemini-api:generateJsonFromDocuments] Reading file from gs://${bucket.name}/${filePath}`);
        const [fileBuffer] = await file.download();
        parts.push({
            inlineData: {
                mimeType: "application/pdf",
                data: fileBuffer.toString("base64"),
            }
        });
    }
    const jsonPrompt = `${prompt}\n\nPlease provide the response in a valid JSON format.`;
    parts.push({ text: jsonPrompt });
    const request: GenerateContentRequest = {
        contents: [{ role: "user", parts: parts }],
        generationConfig: {
            responseMimeType: "application/json",
        },
    };
    const rawJsonText = await streamGeminiResponse(request);
    try {
        const parsedJson = JSON.parse(rawJsonText);
        return parsedJson;
    }
    catch (e) {
        logger.error("[gemini-api:generateJsonFromDocuments] Failed to parse JSON from Gemini response:", rawJsonText, e);
        throw new HttpsError("internal", "Model returned a malformed JSON string.", { response: rawJsonText });
    }
}
exports.generateJsonFromDocuments = generateJsonFromDocuments;
