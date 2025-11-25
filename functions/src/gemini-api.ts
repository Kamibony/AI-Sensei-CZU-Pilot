import type { GenerateContentRequest, Part } from "@google-cloud/vertexai";
const { getStorage } = require("firebase-admin/storage");
const logger = require("firebase-functions/logger");
const { HttpsError } = require("firebase-functions/v2/https");

// --- KONFIGURACE MODELU ---
const LOCATION = "europe-west1";
const STORAGE_BUCKET = "ai-sensei-czu-pilot.firebasestorage.app"; // Fallback bucket

// Lazy loading global variables
let vertex_ai: any = null;
let model: any = null;

function getGcloudProject() {
    const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    if (!project) {
        throw new Error("GCLOUD_PROJECT environment variable not set.");
    }
    return project;
}

function getGenerativeModel() {
    if (!model) {
        const { VertexAI, HarmCategory, HarmBlockThreshold } = require("@google-cloud/vertexai");
        vertex_ai = new VertexAI({ project: getGcloudProject(), location: LOCATION });
        model = vertex_ai.getGenerativeModel({
            model: process.env.GEMINI_MODEL || "gemini-2.5-pro",
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            ],
        });
    }
    return model;
}

async function getEmbeddings(text: string): Promise<number[]> {
    if (process.env.FUNCTIONS_EMULATOR === "true") {
        console.log("EMULATOR_MOCK for getEmbeddings: Returning a mock vector.");
        // Return a fixed-size vector of non-zero values for emulator testing
        return Array(768).fill(0).map((_, i) => Math.sin(i));
    }

    // Lazy load aiplatform
    const aiplatform = require("@google-cloud/aiplatform");
    const { PredictionServiceClient } = aiplatform.v1;
    const { helpers } = aiplatform;

    const clientOptions = {
        apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`,
    };
    const client = new PredictionServiceClient(clientOptions);
    const instances = [helpers.toValue({ content: text, task_type: "RETRIEVAL_DOCUMENT" })];
    const projectId = getGcloudProject();
    const endpoint = `projects/${projectId}/locations/${LOCATION}/publishers/google/models/text-embedding-004`;
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
        return 0; // Or throw an error, depending on desired behavior for zero vectors
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
    try {
        const modelId = process.env.GEMINI_MODEL || "gemini-2.5-pro";
        console.log(`[gemini-api:${functionName}] Sending request to Vertex AI with model '${modelId}' in '${LOCATION}'...`);
        const modelInstance = getGenerativeModel();
        const streamResult = await modelInstance.generateContentStream(requestBody);
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
    catch (e) { // <--- ZMENENÉ
        logger.error("[gemini-api:generateJson] Failed to parse JSON from Gemini response:", rawJsonText, e); // <--- ZMENENÉ
        // Hádzanie HttpsError namiesto new Error(), aby sa zabránilo 500 Internal Server Error
        throw new HttpsError("internal", "Model returned a malformed JSON string.", { response: rawJsonText }); // <--- ZMENENÉ
    }
}
exports.generateJsonFromPrompt = generateJsonFromPrompt;
async function generateTextFromDocuments(filePaths: string[], prompt: string): Promise<string> {
    const bucket = getStorage().bucket(process.env.STORAGE_BUCKET || STORAGE_BUCKET);
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
// --- NOVÁ FUNKCIA PRE GENERAVANIE JSON Z DOKUMENTOV ---
async function generateJsonFromDocuments(filePaths: string[], prompt: string): Promise<any> {
    const bucket = getStorage().bucket(process.env.STORAGE_BUCKET || STORAGE_BUCKET);
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
    catch (e) { // <--- ZMENENÉ
        logger.error("[gemini-api:generateJsonFromDocuments] Failed to parse JSON from Gemini response:", rawJsonText, e); // <--- ZMENENÉ
        // Hádzanie HttpsError namiesto new Error(), aby sa zabránilo 500 Internal Server Error
        throw new HttpsError("internal", "Model returned a malformed JSON string.", { response: rawJsonText }); // <--- ZMENENÉ
    }
}
exports.generateJsonFromDocuments = generateJsonFromDocuments;

async function generateImageFromPrompt(prompt: string): Promise<string> {
    if (process.env.FUNCTIONS_EMULATOR === "true") {
        console.log("EMULATOR_MOCK for generateImageFromPrompt: Returning a mock base64 image.");
        // Simple 1024x1024 blue square SVG as a placeholder, to be returned as base64 but NOT wrapped in data:image
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><rect width="1024" height="1024" fill="#60A5FA" /><text x="50%" y="50%" font-size="60" text-anchor="middle" dy=".3em" fill="white" font-family="sans-serif">EMULATOR</text></svg>`;
        const base64Svg = Buffer.from(svg).toString("base64");
        return base64Svg;
    }

    // Lazy load aiplatform, PredictionServiceClient, and helpers
    const aiplatform = require("@google-cloud/aiplatform");
    const { PredictionServiceClient } = aiplatform.v1;
    const { helpers } = aiplatform;

    const clientOptions = {
        apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`,
    };

    const client = new PredictionServiceClient(clientOptions);
    const projectId = getGcloudProject();
    // Note: 'imagen-3.0-generate-001' is a potential future model. Using a stable version for now.
    const endpoint = `projects/${projectId}/locations/${LOCATION}/publishers/google/models/imagegeneration@006`;

    const instances = [
        helpers.toValue({
            prompt: prompt,
        }),
    ];

    const parameters = helpers.toValue({
        sampleCount: 1,
        aspectRatio: "1:1",
    });

    const request = {
        endpoint,
        instances,
        parameters,
    };

    try {
        console.log(`[gemini-api:generateImageFromPrompt] Sending request to Imagen model '${endpoint}'...`);
        const [response] = await client.predict(request);

        if (!response || !response.predictions || response.predictions.length === 0) {
            throw new HttpsError("internal", "Received an invalid response from the Imagen model.");
        }

        const prediction = response.predictions[0];
        const imageBase64 = prediction.structValue?.fields?.bytesBase64Encoded?.stringValue;

        if (!imageBase64) {
            throw new HttpsError("internal", "Could not find image data in the Imagen response.");
        }
        console.log(`[gemini-api:generateImageFromPrompt] Successfully received image from Imagen.`);
        return imageBase64;

    } catch (error) {
        logger.error("[gemini-api:generateImageFromPrompt] Error generating image:", error);
        if (error instanceof Error) {
            throw new HttpsError("internal", `Imagen call failed: ${error.message}`);
        }
        throw new HttpsError("internal", "An unknown error occurred while generating the image.");
    }
}
exports.generateImageFromPrompt = generateImageFromPrompt;
