import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from './firebase-init.js';

const functionMap = {
    text: httpsCallable(functions, 'generateContent'),
    presentation: httpsCallable(functions, 'createPresentation'),
    quiz: httpsCallable(functions, 'createQuiz'),
    test: httpsCallable(functions, 'createTest'),
    podcast: httpsCallable(functions, 'createPodcast'),
};

const getAiAssistantResponseFunction = httpsCallable(functions, 'getAiAssistantResponse');

export async function callGenerateContent(data) {
    const { contentType } = data;
    const targetFunction = functionMap[contentType];

    if (!targetFunction) {
        const errorMessage = `Neznámý typ obsahu: '${contentType}'`;
        console.error(errorMessage);
        return { error: errorMessage };
    }

    try {
        const result = await targetFunction(data);
        return result.data;
    } catch (error) {
        console.error(`Chyba při volaní funkce '${contentType}':`, error);
        return { error: `Backend Error: ${error.message}` };
    }
}

export async function getAiAssistantResponse({ lessonId, userQuestion }) {
    try {
        const result = await getAiAssistantResponseFunction({ lessonId, userQuestion });
        return result.data;
    } catch (error) {
        console.error("Chyba při volaní 'getAiAssistantResponse' funkce:", error);
        return { error: `Backend Error: ${error.message}` };
    }
}
