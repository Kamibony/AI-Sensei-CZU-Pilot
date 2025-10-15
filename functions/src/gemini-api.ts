import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-functions.js";

const functions = getFunctions();

/**
 * Volá Cloud Function na získanie odpovede od AI asistenta.
 * @param {object} data - Objekt obsahujúci lessonId a userQuestion.
 * @returns {Promise<any>} - Sľub, ktorý sa vyrieši s odpoveďou od funkcie.
 */
export async function getAiAssistantResponse(data) {
  try {
    const callGetAiAssistantResponse = httpsCallable(functions, 'getAiAssistantResponse');
    const result = await callGetAiAssistantResponse(data);
    return result.data;
  } catch (error) {
    console.error("Chyba pri volaní getAiAssistantResponse:", error);
    throw error;
  }
}
