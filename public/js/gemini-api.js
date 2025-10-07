import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from './firebase-init.js'; // Import services directly

// The functions service is imported directly, so we can define the callables right away.
const generateTextFunction = httpsCallable(functions, 'generateText');
const generateJsonFunction = httpsCallable(functions, 'generateJson');
const generateFromDocumentFunction = httpsCallable(functions, 'generateFromDocument');

export async function callGeminiApi(prompt, systemInstruction = null) {
    try {
        const result = await generateTextFunction({ prompt, systemInstruction });
        return result.data;
    } catch (error) {
        console.error("Error calling 'generateText' function:", error);
        return { error: `Backend Error: ${error.message}` };
    }
}

export async function callGeminiForJson(prompt, schema) {
    try {
        const result = await generateJsonFunction({ prompt, schema });
        return result.data;
    } catch (error) {
        console.error("Error calling 'generateJson' function:", error);
        return { error: `Backend Error during JSON generation: ${error.message}` };
    }
}

export async function callGenerateFromDocument(filePath, prompt) {
    try {
        const result = await generateFromDocumentFunction({ filePath, prompt });
        return result.data;
    } catch (error) {
        console.error("Error calling 'generateFromDocument' function:", error);
        return { error: `Backend Error during document generation: ${error.message}` };
    }
}