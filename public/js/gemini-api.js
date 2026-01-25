import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from './firebase-init.js';

export const callGenerateContent = async (data) => {
    const generateContent = httpsCallable(functions, 'generateContent');
    return await generateContent(data);
};

export const callGenerateImage = async (data) => {
    const generateImage = httpsCallable(functions, 'generateImage');
    return await generateImage(data);
};

export const getAiAssistantResponse = async (data) => {
    const getResponse = httpsCallable(functions, 'getAiAssistantResponse');
    return await getResponse(data);
};

export const generatePortfolioFeedback = async (data) => {
    const generateFeedback = httpsCallable(functions, 'generatePortfolioFeedback');
    return await generateFeedback(data);
};
