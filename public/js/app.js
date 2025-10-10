import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from './firebase-init.js';

const generateTextFunction = httpsCallable(functions, 'generateText');
const generateJsonFunction = httpsCallable(functions, 'generateJson');
const generateFromDocumentFunction = httpsCallable(functions, 'generateFromDocument');
const getLessonAssistantResponseFunction = httpsCallable(functions, 'getLessonAssistantResponse');

export async function callGeminiApi(prompt) {
    try {
        const result = await generateTextFunction({ prompt });
        return result.data;
    } catch (error) {
        console.error("Error calling 'generateText' function:", error);
        return { error: `Backend Error: ${error.message}` };
    }
}

export async function callGeminiForJson(prompt) {
    try {
        const result = await generateJsonFunction({ prompt });
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

export async function getLessonAssistantResponse(data) {
    try {
        const result = await getLessonAssistantResponseFunction(data);
        return result.data;
    } catch (error) {
        console.error("Error calling 'getLessonAssistantResponse' function:", error);
        return { error: `Backend Error: ${error.message}` };
    }
}
