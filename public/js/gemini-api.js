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

// --- OPRAVA: Pridané kľúčové slovo "export" pred každú funkciu ---
export async function createQuizForLesson(lessonId, lessonContent) {
    showToast('Vytvářím kvíz, počkejte prosím...');
    return callFirebaseFunction('createQuizForLesson', { lessonId, lessonContent });
}

export async function createTestForLesson(lessonId, lessonContent) {
    showToast('Vytvářím test, počkejte prosím...');
    return callFirebaseFunction('createTestForLesson', { lessonId, lessonContent });
}

export async function createPodcastForLesson(lessonId, lessonContent) {
    showToast('Vytvářím podcast, může to trvat déle...');
    return callFirebaseFunction('createPodcastForLesson', { lessonId, lessonContent });
}

export async function createPresentationForLesson(lessonId, lessonContent) {
    showToast('Vytvářím prezentaci, počkejte prosím...');
    return callFirebaseFunction('createPresentationForLesson', { lessonId, lessonContent });
}

export async function generateContentForLesson(lessonId, prompt) {
    showToast('Generuji text na základě vašeho promptu...');
    return callFirebaseFunction('generateContentForLesson', { lessonId, prompt });
}
