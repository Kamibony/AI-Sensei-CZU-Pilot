import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
// --- ZMENA: Importujeme celú firebase-init, aby sme mali prístup k AKTUALIZOVANÉMU functions ---
import * as firebaseInit from './firebase-init.js';

// --- ZMENA: Premenné na ukladanie callable funkcií, inicializované na null ---
let _generateContentFunction = null;
let _getAiAssistantResponseFunction = null;
let _generateImageFunction = null;

// --- ZMENA: Funkcia na získanie (alebo vytvorenie) callable funkcie ---
function getGenerateContentCallable() {
    if (!_generateContentFunction) {
        // Získame AKTUÁLNY functions objekt
        console.log("Lazy initializing generateContent callable. Current functions object:", firebaseInit.functions);
        if (!firebaseInit.functions) {
            console.error("CRITICAL: Firebase Functions object is still not available when trying to create generateContent callable!");
            // Môžete tu vyhodiť chybu alebo vrátiť nejakú placeholder funkciu
            throw new Error("Firebase Functions not initialized.");
        }
        _generateContentFunction = httpsCallable(firebaseInit.functions, 'generateContent');
    }
    return _generateContentFunction;
}

// --- ZMENA: Funkcia na získanie (alebo vytvorenie) callable funkcie ---
function getAiAssistantResponseCallable() {
    if (!_getAiAssistantResponseFunction) {
        // Získame AKTUÁLNY functions objekt
        console.log("Lazy initializing getAiAssistantResponse callable. Current functions object:", firebaseInit.functions);
         if (!firebaseInit.functions) {
            console.error("CRITICAL: Firebase Functions object is still not available when trying to create getAiAssistantResponse callable!");
            // Môžete tu vyhodiť chybu alebo vrátiť nejakú placeholder funkciu
            throw new Error("Firebase Functions not initialized.");
        }
        _getAiAssistantResponseFunction = httpsCallable(firebaseInit.functions, 'getAiAssistantResponse');
    }
    return _getAiAssistantResponseFunction;
}

function getGenerateImageCallable() {
    if (!_generateImageFunction) {
        console.log("Lazy initializing generateImage callable. Current functions object:", firebaseInit.functions);
        if (!firebaseInit.functions) {
            console.error("CRITICAL: Firebase Functions object is still not available when trying to create generateImage callable!");
            throw new Error("Firebase Functions not initialized.");
        }
        _generateImageFunction = httpsCallable(firebaseInit.functions, 'generateImage');
    }
    return _generateImageFunction;
}


/**
 * Univerzálna funkcia na volanie AI na backende pre generovanie obsahu (pre profesora).
 */
export async function callGenerateContent(data) {
    try {
        // --- ZMENA: Voláme funkciu na získanie callable ---
        const callableFunc = getGenerateContentCallable();
        const result = await callableFunc(data);
        return result.data;
    } catch (error) {
        console.error("Error calling 'generateContent' function:", error);
        return { error: `Backend Error: ${error.message}` };
    }
}

/**
 * Function to call the AI image generation on the backend.
 */
export async function callGenerateImage(prompt) {
    try {
        const callableFunc = getGenerateImageCallable();
        const result = await callableFunc({ prompt });
        // The backend function is expected to return { imageBase64: '...' }
        return result.data;
    } catch (error) {
        console.error("Error calling 'generateImage' function:", error);
        return { error: `Backend Error: ${error.message}` };
    }
}

/**
 * Funkcia na volanie AI asistenta pre študentov.
 */
export async function getAiAssistantResponse({ lessonId, userQuestion }) {
    try {
        // --- ZMENA: Voláme funkciu na získanie callable ---
        const callableFunc = getAiAssistantResponseCallable();
        const result = await callableFunc({ lessonId, userQuestion });
        return result.data;
    } catch (error) {
        console.error("Error calling 'getAiAssistantResponse' function:", error);
        return { error: `Backend Error: ${error.message}` };
    }
}
