import {
  VertexAI,
  GenerateContentRequest,
  HarmCategory,
  HarmBlockThreshold,
  Part,
} from "@google-cloud/vertexai";
import { getStorage } from "firebase-admin/storage";
import mammoth from "mammoth"; // <-- PRIDANÝ IMPORT

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

function getMimeTypeFromPath(filePath: string): string {
    const extension = filePath.split(".").pop()?.toLowerCase();
    switch (extension) {
        case "pdf": return "application/pdf";
        case "png": return "image/png";
        case "jpg": case "jpeg": return "image/jpeg";
        case "webp": return "image/webp";
        // Pre .docx vrátime špeciálny typ, aby sme ho spracovali inak
        case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        default: return "unsupported/type";
    }
}

async function streamGeminiResponse(requestBody: GenerateContentRequest): Promise<string> {
    const functionName = requestBody.generationConfig?.responseMimeType === "application/json"
        ? "generateJson"
        : "generateText";

    if (process.env.FUNCTIONS_EMULATOR === "true") {
        return functionName === "generateJson"
            ? JSON.stringify({ mock: "Mock JSON response." })
            : "Mock text response.";
    }

    try {
        console.log(`[gemini-api:${functionName}] Sending request to Vertex AI...`);
        const streamResult = await model.generateContentStream(requestBody);
        let fullText = "";

        for await (const item of streamResult.stream) {
            fullText += item.candidates?.[0]?.content?.parts?.[0]?.text || "";
        }

        console.log(`[gemini-api:${functionName}] Successfully received and aggregated stream response.`);
        return fullText;

    } catch (error) {
        console.error(`[gemini-api:${functionName}] Error calling Vertex AI API:`, error);
        if (error instanceof Error) {
             if (error.message.includes("unsupported/type")) {
                throw new Error("Nepodporovaný typ souboru. Prosím, použijte PDF, DOCX, PNG, JPG, nebo WEBP.");
            }
            throw new Error(`Vertex AI API call failed: ${error.message}`);
        }
        throw new Error("An unknown error occurred while communicating with the Vertex AI API.");
    }
}

// --- HLAVNÁ FUNKCIA NA SPRACOVANIE DOKUMENTOV ---
async function processDocuments(filePaths: string[]): Promise<Part[]> {
    const bucket = getStorage().bucket();
    const parts: Part[] = [];
    let extractedText = "";

    for (const filePath of filePaths) {
        const file = bucket.file(filePath);
        const mimeType = getMimeTypeFromPath(filePath);
        
        console.log(`[gemini-api:processDocuments] Processing file: ${filePath} with MIME type: ${mimeType}`);

        if (mimeType === "unsupported/type") {
            throw new Error(`Nepodporovaný typ souboru: ${filePath.split("/").pop()}. Prosím, použijte PDF, DOCX, PNG, JPG, nebo WEBP.`);
        }
        
        const [fileBuffer] = await file.download();

        if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            // Extrahujeme text z DOCX a pridáme ho do spoločného textového kontextu
            const textResult = await mammoth.extractRawText({ buffer: fileBuffer });
            extractedText += textResult.value + "\n\n";
        } else {
            // Ostatné podporované typy pošleme priamo ako súbory
            parts.push({
                inlineData: {
                    mimeType: mimeType,
                    data: fileBuffer.toString("base64"),
                }
            });
        }
    }

    // Ak sme extrahovali nejaký text, pridáme ho ako jeden textový part
    if (extractedText) {
        parts.unshift({ text: `Kontext z dokumentů:\n${extractedText}\n---\n` });
    }

    return parts;
}

// --- EXPORTOVANÉ FUNKCIE (teraz používajú 'processDocuments') ---
export async function generateTextFromDocuments(filePaths: string[], prompt: string): Promise<string> {
    const parts = await processDocuments(filePaths);
    parts.push({ text: prompt });
    const request: GenerateContentRequest = { contents: [{ role: "user", parts: parts }] };
    return await streamGeminiResponse(request);
}

export async function generateJsonFromDocuments(filePaths: string[], prompt: string): Promise<unknown> {
    const parts = await processDocuments(filePaths);
    const jsonPrompt = `${prompt}\n\nPlease provide the response in a valid JSON format.`;
    parts.push({ text: jsonPrompt });

    const request: GenerateContentRequest = {
        contents: [{ role: "user", parts: parts }],
        generationConfig: { responseMimeType: "application/json" },
    };
    const rawJsonText = await streamGeminiResponse(request);
    try {
        return JSON.parse(rawJsonText);
    } catch (_e) {
        console.error("Failed to parse JSON:", rawJsonText);
        throw new Error("Model returned a malformed JSON string.");
    }
}

// --- FUNKCIE BEZ DOKUMENTOV (zostávajú bez zmeny) ---
export async function generateTextFromPrompt(prompt: string): Promise<string> {
    const request: GenerateContentRequest = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
    return await streamGeminiResponse(request);
}

export async function generateJsonFromPrompt(prompt: string): Promise<unknown> {
    const request: GenerateContentRequest = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
    };
    const rawJsonText = await streamGeminiResponse(request);
    try {
        return JSON.parse(rawJsonText);
    } catch (_e) {
        console.error("Failed to parse JSON:", rawJsonText);
        throw new Error("Model returned a malformed JSON string.");
    }
}
