import { functions } from './firebase-init.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { showToast } from './utils.js';

async function callFirebaseFunction(functionName, data) {
    try {
        const func = httpsCallable(functions, functionName);
        const response = await func(data);
        return response.data;
    } catch (error) {
        console.error(`Error calling function ${functionName}:`, error);
        showToast(`Chyba při volání funkce ${functionName}.`, true);
        return null;
    }
}

// Funkcia pre AI asistenta v chate
async function getAiAssistantResponse(studentId, conversationHistory) {
    return callFirebaseFunction('getAiAssistantResponse', { studentId, conversationHistory });
}

// Funkcie pre generovanie obsahu lekcií
async function createQuizForLesson(lessonId, lessonContent) {
    showToast('Vytvářím kvíz, počkejte prosím...');
    return callFirebaseFunction('createQuizForLesson', { lessonId, lessonContent });
}

async function createTestForLesson(lessonId, lessonContent) {
    showToast('Vytvářím test, počkejte prosím...');
    return callFirebaseFunction('createTestForLesson', { lessonId, lessonContent });
}

async function createPodcastForLesson(lessonId, lessonContent) {
    showToast('Vytvářím podcast, může to trvat déle...');
    return callFirebaseFunction('createPodcastForLesson', { lessonId, lessonContent });
}

async function createPresentationForLesson(lessonId, lessonContent) {
    showToast('Vytvářím prezentaci, počkejte prosím...');
    return callFirebaseFunction('createPresentationForLesson', { lessonId, lessonContent });
}

async function generateContentForLesson(lessonId, prompt) {
    showToast('Generuji text na základě vašeho promptu...');
    return callFirebaseFunction('generateContentForLesson', { lessonId, prompt });
}

// --- FINÁLNA OPRAVA: Export VŠETKÝCH potrebných funkcií ---
export {
    getAiAssistantResponse, // Pridaný chýbajúci export
    createQuizForLesson,
    createTestForLesson,
    createPodcastForLesson,
    createPresentationForLesson,
    generateContentForLesson
};
