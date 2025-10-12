import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from './firebase-init.js';

// Odkazy na cloudové funkcie, ktoré reálne existujú na backende
const generateContentFunction = httpsCallable(functions, 'generateContent');
const getAiAssistantResponseFunction = httpsCallable(functions, 'getAiAssistantResponse');

/**
 * Univerzálna funkcia na volanie AI na backende pre generovanie obsahu (pre profesora).
 */
export async function callGenerateContent(data) {
    try {
        const result = await generateContentFunction(data);
        return result.data;
    } catch (error) {
        console.error("Error calling 'generateContent' function:", error);
        return { error: `Backend Error: ${error.message}` };
    }
}

/**
 * Funkcia na volanie AI asistenta pre študentov.
 */
// --- KĽÚČOVÁ ZMENA: Funkcia teraz očakáva jeden objekt s vlastnosťami lessonId a userQuestion ---
export async function getAiAssistantResponse({ lessonId, userQuestion }) {
    try {
        // Voláme správnu backendovú funkciu 'getAiAssistantResponse'
        const result = await getAiAssistantResponseFunction({ lessonId, userQuestion });
        return result.data;
    } catch (error) {
        console.error("Error calling 'getAiAssistantResponse' function:", error);
        return { error: `Backend Error: ${error.message}` };
    }
}
