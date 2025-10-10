import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from './firebase-init.js';

// Definujeme odkazy na VŠETKY cloudové funkcie, ktoré frontend potrebuje
const generateTextFunction = httpsCallable(functions, 'generateText');
const generateJsonFunction = httpsCallable(functions, 'generateJson');
const generateFromDocumentFunction = httpsCallable(functions, 'generateFromDocument');
const generateJsonFromDocumentFunction = httpsCallable(functions, 'generateJsonFromDocument');
const getLessonKeyTakeawaysFunction = httpsCallable(functions, 'getLessonKeyTakeaways');
// TÁTO FUNKCIA CHÝBALA A SPÔSOBOVALA CHYBU
const getAiAssistantResponseFunction = httpsCallable(functions, 'getAiAssistantResponse');

// --- Funkcie pre Profesora ---
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

export async function callGenerateFromDocument(data) {
    try {
        const result = await generateFromDocumentFunction(data);
        return result.data;
    } catch (error) {
        console.error("Error calling 'generateFromDocument' function:", error);
        return { error: `Backend Error during document generation: ${error.message}` };
    }
}

export async function callGenerateJsonFromDocument(data) {
    try {
        const result = await generateJsonFromDocumentFunction(data);
        return result.data; // Pri JSONe vraciame priamo dáta, nie result.data.text
    } catch (error) {
        console.error("Error calling 'generateJsonFromDocument' function:", error);
        return { error: `Backend Error during JSON document generation: ${error.message}` };
    }
}

// --- Funkcia pre Študenta (TOTO SME DOPLNILI) ---
export async function getLessonAssistantResponse(lessonId, userQuestion, lessonText) {
    try {
        // Voláme správnu cloud funkciu a posielame jej potrebné dáta
        const result = await getAiAssistantResponseFunction({ lessonId, userQuestion, lessonText });
        return result.data; // Očakávame objekt, napr. { answer: '...' }
    } catch (error) {
        console.error("Error calling 'getAiAssistantResponse' function:", error);
        return { error: `Backend Error: ${error.message}` };
    }
}
