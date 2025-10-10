import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from './firebase-init.js';

// Odkaz na JEDINÚ, zjednotenú cloudovú funkciu
const generateContentFunction = httpsCallable(functions, 'generateContent');

/**
 * Univerzálna funkcia na volanie AI na backende.
 * @param {object} data - Objekt obsahujúci contentType, promptData a voliteľne filePaths.
 * @returns {Promise<object>} - Sľub, ktorý vráti vygenerovaný obsah alebo objekt s chybou.
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
