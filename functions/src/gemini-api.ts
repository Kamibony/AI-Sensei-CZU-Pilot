import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from './firebase-init.js';

// Mapa, ktorá priraďuje typ obsahu ku konkrétnej cloudovej funkcii.
const functionMap = {
    text: httpsCallable(functions, 'generateContent'),
    presentation: httpsCallable(functions, 'createPresentation'),
    quiz: httpsCallable(functions,, 'createQuiz'),
    test: httpsCallable(functions, 'createTest'),
    podcast: httpsCallable(functions, 'createPodcast'),
};

// Samostatná referencia na funkciu AI asistenta.
const getAiAssistantResponseFunction = httpsCallable(functions, 'getAiAssistantResponse');

/**
 * Univerzálna funkcia na volanie AI na backende pre generovanie obsahu.
 * Dynamicky vyberie a zavolá správnu Firebase funkciu na základe 'contentType'.
 * * @param {object} data - Objekt obsahujúci dáta pre funkciu, vrátane 'contentType'.
 * @returns {Promise<any>} - Dáta vrátené z cloudovej funkcie.
 */
export async function callGenerateContent(data) {
    const { contentType } = data;
    const targetFunction = functionMap[contentType];

    if (!targetFunction) {
        const errorMessage = `Neznámy typ obsahu: '${contentType}'. Nebola nájdená žiadna zodpovedajúca cloudová funkcia.`;
        console.error(errorMessage);
        // Vráti objekt chyby, aby ho frontend mohol spracovať.
        return { error: errorMessage };
    }

    console.log(`Volám funkciu pre contentType: '${contentType}' s dátami:`, data);

    try {
        const result = await targetFunction(data);
        // Firebase vracia dáta v objekte `data`, preto pristupujeme k result.data.
        return result.data;
    } catch (error) {
        console.error(`Chyba pri volaní cloudovej funkcie pre '${contentType}':`, error);
        // Vráti objekt chyby s detailmi pre lepšie ladenie na frontende.
        return { error: `Backend Error: ${error.message}` };
    }
}

/**
 * Funkcia na volanie AI asistenta pre študentov.
 * * @param {object} data - Objekt obsahujúci { lessonId, userQuestion }.
 * @returns {Promise<any>} - Dáta vrátené z cloudovej funkcie.
 */
export async function getAiAssistantResponse({ lessonId, userQuestion }) {
    try {
        const result = await getAiAssistantResponseFunction({ lessonId, userQuestion });
        return result.data;
    } catch (error) {
        console.error("Chyba pri volaní 'getAiAssistantResponse' funkcie:", error);
        return { error: `Backend Error: ${error.message}` };
    }
}
