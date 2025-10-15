import { VertexAI } from "@google-cloud/vertexai";

// Kontrola, či sú povinné premenné prostredia nastavené
if (!process.env.GCLOUD_PROJECT) {
    throw new Error("Premenná prostredia GCLOUD_PROJECT je povinná.");
}

// Inicializácia Vertex AI pre serverové prostredie
const vertex_ai = new VertexAI({
  project: process.env.GCLOUD_PROJECT,
  location: "europe-west1", // Tvoj región zostáva nezmenený
});

// Názov modelu, ktorý si chcel zachovať
const model = "gemini-2.5-pro"; // Tvoj model zostáva nezmenený

const generativeModel = vertex_ai.getGenerativeModel({
  model: model,
  generationConfig: {
    maxOutputTokens: 2048,
    temperature: 0.5,
    topP: 1,
  },
});

/**
 * Generuje textovú odpoveď na základe daného promptu pomocou Gemini API.
 * @param prompt Textový vstup pre model.
 * @returns Vygenerovaný text ako string.
 */
export async function generateTextFromPrompt(prompt: string): Promise<string> {
  try {
    const resp = await generativeModel.generateContent(prompt);
    const responseText = resp.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    return responseText || "";
  } catch (error) {
    console.error("Error generating text from prompt:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to generate text from Gemini API: ${error.message}`);
    }
    throw new Error("An unknown error occurred while calling the Gemini API.");
  }
}

/**
 * Generuje JSON objekt na základe daného promptu.
 * @param prompt Textový vstup pre model.
 * @returns Vygenerovaný objekt.
 */
export async function generateJsonFromPrompt(prompt: string): Promise<any> {
    try {
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;
        const text = response.candidates?.[0].content.parts[0].text || "{}";

        // Odstráni ```json a ``` z odpovede modelu
        const cleanedText = text.replace(/^```json\s*|```\s*$/g, "").trim();

        return JSON.parse(cleanedText);
    } catch (error) {
        console.error("Error generating JSON from prompt:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to generate JSON from Gemini API: ${error.message}`);
        }
        throw new Error("An unknown error occurred while calling the Gemini API to generate JSON.");
    }
}
