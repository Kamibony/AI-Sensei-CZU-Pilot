// functions/src/gemini-api.ts

import { VertexAI, Part, GenerateContentRequest } from "@google-cloud/vertexai";
// OPRAVA: Odstránili sme nepotrebné importy, ktoré spôsobovali problémy

// --- FINÁLNA OPRAVA: Necháme knižnicu, aby si našla oprávnenia automaticky,
// čo je štandardné a správne správanie po oprave cyklickej závislosti.
const vertex_ai = new VertexAI({
    project: 'ai-sensei-czu-pilot',
    location: 'europe-west1',
});

// Váš overený a funkčný model
const modelName = 'gemini-2.5-pro'; 

// --- Kód funkcií zostáva nezmenený ---

export async function generateTextFromPrompt(prompt: string): Promise<string> {
    try {
        const generativeModel = vertex_ai.getGenerativeModel({ model: modelName });
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;

        if (!response || !response.candidates || response.candidates.length === 0 || !response.candidates[0].content.parts[0].text) {
            throw new Error("AI nevrátila platnou odpověď.");
        }
        return response.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error("Chyba při generování textu:", error);
        throw new Error("Nepodařilo se vygenerovat text.");
    }
}

export async function generateJsonFromPrompt(prompt: string): Promise<any> {
    try {
        const generativeModel = vertex_ai.getGenerativeModel({ model: modelName });
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;

        if (!response || !response.candidates || response.candidates.length === 0 || !response.candidates[0].content.parts[0].text) {
            throw new Error("AI nevrátila platnou odpověď pro JSON.");
        }
        const responseText = response.candidates[0].content.parts[0].text;
        const cleanedJson = responseText.replace(/```json/g, "").replace(/```g, "").trim();
        return JSON.parse(cleanedJson);
    } catch (error)
 {
        console.error("Chyba při generování JSON:", error);
        throw new Error("Nepodařilo se vygenerovat JSON.");
    }
}

export async function generateTextFromDocuments(filePaths: string[], prompt: string): Promise<string> {
    try {
        const fileParts: Part[] = filePaths.map(path => ({
            fileData: { mimeType: "application/pdf", fileUri: `gs://${path}` }
        }));
        
        const request: GenerateContentRequest = {
            contents: [{ role: "user", parts: [{ text: prompt }, ...fileParts] }]
        };
        
        const generativeModel = vertex_ai.getGenerativeModel({ model: modelName });
        const result = await generativeModel.generateContent(request);
        const response = result.response;

        if (!response || !response.candidates || response.candidates.length === 0 || !response.candidates[0].content.parts[0].text) {
            throw new Error("AI nevrátila platnou odpověď z dokumentů.");
        }
        return response.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error("Chyba při generování textu z dokumentů:", error);
        throw new Error("Nepodařilo se vygenerovat text z dokumentů.");
    }
}

export async function generateJsonFromDocuments(filePaths: string[], prompt: string): Promise<any> {
    try {
        const fileParts: Part[] = filePaths.map(path => ({
            fileData: { mimeType: "application/pdf", fileUri: `gs://${path}` }
        }));

        const request: GenerateContentRequest = {
            contents: [{ role: "user", parts: [{ text: prompt }, ...fileParts] }]
        };

        const generativeModel = vertex_ai.getGenerativeModel({ model: modelName });
        const result = await generativeModel.generateContent(request);
        const response = result.response;

        if (!response || !response.candidates || response.candidates.length === 0 || !response.candidates[0].content.parts[0].text) {
            throw new Error("AI nevrátila platnou odpověď pro JSON z dokumentů.");
        }
        const responseText = response.candidates[0].content.parts[0].text;
        const cleanedJson = responseText.replace(/```json/g, "").replace(/```g, "").trim();
        return JSON.parse(cleanedJson);
    } catch (error) {
        console.error("Chyba při generování JSON z dokumentů:", error);
        throw new Error("Nepodařilo se vygenerovat JSON z dokumentů.");
    }
}
