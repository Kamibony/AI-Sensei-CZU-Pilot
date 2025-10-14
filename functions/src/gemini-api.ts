// functions/src/gemini-api.ts

import { VertexAI, Part } from "@google-cloud/vertexai";

// --- OPRAVA: Správny región a model ---
const vertex_ai = new VertexAI({
    project: 'ai-sensei-czu-pilot',
    location: 'europe-west1' // <<< ZMENENÉ Z us-central1
});

const modelName = 'gemini-2.5-pro'; // <<< ZMENENÉ Z gemini-1.0-pro

// Funkcia na generovanie textu z promptu
export async function generateTextFromPrompt(prompt: string): Promise<string> {
    try {
        const generativeModel = vertex_ai.getGenerativeModel({ model: modelName });
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;
        return response.candidates[0].content.parts[0].text || "";
    } catch (error) {
        console.error("Chyba při generování textu:", error);
        throw new Error("Nepodařilo se vygenerovat text.");
    }
}

// Funkcia na generovanie JSON z promptu
export async function generateJsonFromPrompt(prompt: string): Promise<any> {
    try {
        const generativeModel = vertex_ai.getGenerativeModel({ model: modelName });
        const result = await generativeModel.generateContent(prompt);
        const responseText = result.response.candidates[0].content.parts[0].text || "";
        
        // Očistíme text od ```json a ```, aby sme získali platný JSON
        const cleanedJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleanedJson);
    } catch (error) {
        console.error("Chyba při generování JSON:", error);
        throw new Error("Nepodařilo se vygenerovat JSON.");
    }
}

// Funkcia na generovanie textu z dokumentov
export async function generateTextFromDocuments(filePaths: string[], prompt: string): Promise<string> {
    try {
        const fileParts: Part[] = filePaths.map(path => ({
            fileData: { mimeType: "application/pdf", fileUri: `gs://${path}` }
        }));
        
        const generativeModel = vertex_ai.getGenerativeModel({ model: modelName });
        const result = await generativeModel.generateContent([prompt, ...fileParts]);
        const response = result.response;
        return response.candidates[0].content.parts[0].text || "";
    } catch (error) {
        console.error("Chyba při generování textu z dokumentů:", error);
        throw new Error("Nepodařilo se vygenerovat text z dokumentů.");
    }
}

// Funkcia na generovanie JSON z dokumentov
export async function generateJsonFromDocuments(filePaths: string[], prompt: string): Promise<any> {
    try {
        const fileParts: Part[] = filePaths.map(path => ({
            fileData: { mimeType: "application/pdf", fileUri: `gs://${path}` }
        }));

        const generativeModel = vertex_ai.getGenerativeModel({ model: modelName });
        const result = await generativeModel.generateContent([prompt, ...fileParts]);
        const responseText = result.response.candidates[0].content.parts[0].text || "";

        const cleanedJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleanedJson);
    } catch (error) {
        console.error("Chyba při generování JSON z dokumentů:", error);
        throw new Error("Nepodařilo se vygenerovat JSON z dokumentů.");
    }
}
