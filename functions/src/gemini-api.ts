import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-functions.js";

const functions = getFunctions();

/**
 * Volá Cloud Function na získanie odpovede od AI asistenta.
 * @param {object} data - Objekt obsahujúci lessonId a userQuestion.
 * @returns {Promise<any>} - Sľub, ktorý sa vyrieši s odpoveďou od funkcie.
 */
export async function getAiAssistantResponse(data) {
  try {
    // OPRAVA: Názov funkcie musí presne zodpovedať exportovanému názvu v index.ts
    const callGetAiAssistantResponse = httpsCallable(functions, 'getAiAssistantResponse');
    // OPRAVA: Dáta sa posielajú ako jeden objekt, čo Firebase funkcia očakáva
    const result = await callGetAiAssistantResponse(data);
    return result.data;
  } catch (error) {
    console.error("Chyba pri volaní getAiAssistantResponse:", error);
    // Vrátenie štruktúrovanej chybovej odpovede pre lepšie spracovanie na strane klienta
    return { success: false, error: error.message || "Neznáma chyba pri volaní funkcie." };
  }
}
