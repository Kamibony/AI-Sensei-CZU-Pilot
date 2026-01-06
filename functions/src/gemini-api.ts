import type { GenerateContentRequest, Part } from "@google-cloud/vertexai";
const { getStorage } = require("firebase-admin/storage");
const logger = require("firebase-functions/logger");
const { HttpsError } = require("firebase-functions/v2/https");

// --- KONFIGURACE MODELU ---
const LOCATION = "europe-west1";
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const FIREBASE_CONFIG = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : {};
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || FIREBASE_CONFIG.storageBucket || (PROJECT_ID === "ai-sensei-prod" ? "ai-sensei-prod.firebasestorage.app" : "ai-sensei-czu-pilot.firebasestorage.app");

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
            // INSERT START
            systemInstruction: {
                parts: [{ text: "You are a strict educational assistant. Generate content ONLY based on the provided source text. Do not invent facts outside the context. If information is missing, state it." }]
            },
            generationConfig: {
                temperature: 0.2, // Low creativity for accuracy
            },
            // INSERT END
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            ],
        });
    }
    return model;
}

// --- POMOCNÁ FUNKCIA NA ČISTENIE CESTY ---
function sanitizeStoragePath(path: string, bucketName: string): string {
    if (!path) return "";

    path = decodeURIComponent(path).normalize('NFC'); // SYSTEMIC FIX for special chars

    // 1. Remove gs:// prefix
    let clean = path.replace(/^gs:\/\//, "");
    
    // 2. Remove bucket name if present at the start
    if (clean.startsWith(bucketName)) {
        clean = clean.substring(bucketName.length);
    }
    
    // 3. Remove leading slashes
    clean = clean.replace(/^\/+/, "");
    
    return clean;
}

async function getEmbeddings(text: string): Promise<number[]> {
    if (process.env.FUNCTIONS_EMULATOR === "true") {
        console.log("EMULATOR_MOCK for getEmbeddings: Returning a mock vector.");
        return Array(768).fill(0).map((_, i) => Math.sin(i));
    }

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
        return "This is a mock response from the emulator for a text prompt.";
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
    catch (e) {
        logger.error("[gemini-api:generateJson] Failed to parse JSON from Gemini response:", rawJsonText, e);
        throw new HttpsError("internal", "Model returned a malformed JSON string.", { response: rawJsonText });
    }
}
exports.generateJsonFromPrompt = generateJsonFromPrompt;

async function generateTextFromDocuments(filePaths: string[], prompt: string): Promise<string> {
    const bucket = getStorage().bucket(process.env.STORAGE_BUCKET || STORAGE_BUCKET);
    const parts: Part[] = [];
    let loadedFiles = 0;
    
    // OPRAVA: Iterácia s čistením cesty
    for (const rawPath of filePaths) {
        const cleanPath = sanitizeStoragePath(rawPath, bucket.name);
        const file = bucket.file(cleanPath);
        
        console.log(`[gemini-api:generateTextFromDocuments] Reading file from gs://${bucket.name}/${cleanPath} (Original: ${rawPath})`);
        
        try {
            const [fileBuffer] = await file.download();

            let mimeType = "application/pdf";
            if (cleanPath.toLowerCase().endsWith(".txt")) mimeType = "text/plain";
            if (cleanPath.toLowerCase().endsWith(".json")) mimeType = "application/json";

            parts.push({
                inlineData: {
                    mimeType: mimeType,
                    data: fileBuffer.toString("base64"),
                }
            });
            loadedFiles++;
        } catch (err) {
            logger.warn(`[gemini-api] Failed to download file: ${cleanPath}. Skipping. Error:`, err);
            // Pokračujeme ďalej, nezastavíme celý proces kvoli jednému súboru
        }
    }
    
    if (loadedFiles === 0) {
        throw new HttpsError('not-found', 'Backend could not read any source files. Please check file paths. Attempted path example: ' + (filePaths[0] || 'none'));
    }

    parts.push({ text: prompt });
    const request: GenerateContentRequest = {
        contents: [{ role: "user", parts: parts }],
    };
    return await streamGeminiResponse(request);
}
exports.generateTextFromDocuments = generateTextFromDocuments;

async function generateJsonFromDocuments(filePaths: string[], prompt: string): Promise<any> {
    const bucket = getStorage().bucket(process.env.STORAGE_BUCKET || STORAGE_BUCKET);
    const parts: Part[] = [];
    
    // OPRAVA: Iterácia s čistením cesty
    for (const rawPath of filePaths) {
        const cleanPath = sanitizeStoragePath(rawPath, bucket.name);
        const file = bucket.file(cleanPath);
        
        console.log(`[gemini-api:generateJsonFromDocuments] Reading file from gs://${bucket.name}/${cleanPath} (Original: ${rawPath})`);
        
        try {
            const [fileBuffer] = await file.download();

            let mimeType = "application/pdf";
            if (cleanPath.toLowerCase().endsWith(".txt")) mimeType = "text/plain";
            if (cleanPath.toLowerCase().endsWith(".json")) mimeType = "application/json";

            parts.push({
                inlineData: {
                    mimeType: mimeType,
                    data: fileBuffer.toString("base64"),
                }
            });
        } catch (err) {
             logger.warn(`[gemini-api] Failed to download file: ${cleanPath}. Skipping. Error:`, err);
        }
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

async function generateImageFromPrompt(prompt: string): Promise<string> {
    if (process.env.FUNCTIONS_EMULATOR === "true") {
        console.log("EMULATOR_MOCK for generateImageFromPrompt: Returning a mock base64 image.");
        const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\" width=\"1024\" height=\"1024\"><rect width=\"1024\" height=\"1024\" fill=\"#60A5FA\" /><text x=\"50%\" y=\"50%\" font-size=\"60\" text-anchor=\"middle\" dy=\".3em\" fill=\"white\" font-family=\"sans-serif\">EMULATOR</text></svg>";
        const base64Svg = Buffer.from(svg).toString("base64");
        return base64Svg;
    }

    const aiplatform = require("@google-cloud/aiplatform");
    const { PredictionServiceClient } = aiplatform.v1;
    const { helpers } = aiplatform;

    const clientOptions = {
        apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`,
    };

    const client = new PredictionServiceClient(clientOptions);
    const projectId = getGcloudProject();
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
        console.log("[gemini-api:generateImageFromPrompt] Successfully received image from Imagen.");
        return imageBase64;

    } catch (error: any) {
        console.warn("Imagen generation failed (likely safety). Using fallback.", error.message);

        try {
            const safeRequest = {
                ...request,
                instances: [
                    helpers.toValue({
                        prompt: "Abstract calm educational background, minimalist style, safe content",
                    }),
                ]
            };
            const [fallbackResponse] = await client.predict(safeRequest);

            if (!fallbackResponse || !fallbackResponse.predictions || fallbackResponse.predictions.length === 0) {
                throw new Error("Invalid fallback response");
            }

            const prediction = fallbackResponse.predictions[0];
            const imageBase64 = prediction.structValue?.fields?.bytesBase64Encoded?.stringValue;

            if (!imageBase64) {
                throw new Error("No image in fallback response");
            }
            return imageBase64;
        } catch (fatalError) {
             console.error("Fallback also failed.");
             throw new HttpsError("internal", "Image generation completely failed.");
        }
    }
}
exports.generateImageFromPrompt = generateImageFromPrompt;
