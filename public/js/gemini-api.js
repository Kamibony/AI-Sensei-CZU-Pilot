import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from './firebase-init.js';

// A single, unified callable function, matching the refactored backend.
const generateContentFunction = httpsCallable(functions, 'generateContent');

/**
 * Calls the single 'generateContent' backend function.
 *
 * @param {object} data - The data payload.
 * @param {string} data.contentType - The type of content to generate (e.g., 'presentation', 'text').
 * @param {object} data.promptData - The data for building the prompt on the backend.
 * @param {string} data.promptData.userPrompt - The raw user input.
 * @param {string[]} [data.filePaths] - Optional array of file paths for RAG.
 * @returns {Promise<object>} A promise that resolves with the generated content or an error object.
 */
export async function callGenerateContent(data) {
    try {
        const result = await generateContentFunction(data);
        // The backend now returns the validated data directly.
        return result.data;
    } catch (error) {
        console.error("Error calling 'generateContent' function:", error);
        // Pass a structured error back to the handler.
        return {
            error: `Backend Error: ${error.message}`,
            details: error.details
        };
    }
}