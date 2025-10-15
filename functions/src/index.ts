import * as functions from "firebase-functions";
import admin from "firebase-admin";
import {
  generateTextFromPrompt,
  generateContentForQuiz,
  generateContentForTest,
  generateContentForPodcast,
  generatePresentationContent,
} from "./gemini-api";
import cors from "cors";

// Inicializácia CORS handlera s povolením pre tvoju webovú aplikáciu
// DÔLEŽITÉ: Uistite sa, že URL adresa presne zodpovedá adrese vašej hosťovanej aplikácie
const corsHandler = cors({ origin: "https://ai-sensei-czu-pilot.web.app" });

admin.initializeApp();
const db = admin.firestore();

/**
 * Získa odpoveď od AI asistenta pre študenta.
 * Táto funkcia je typu onRequest a používa CORS handler na povolenie volaní z webu.
 */
export const getAiAssistantResponse = functions.region("europe-west1").https.onRequest((request, response) => {
    // Aplikujeme CORS handler na požiadavku
    corsHandler(request, response, async () => {
        if (request.method !== "POST") {
            response.status(405).send({ error: "Method Not Allowed" });
            return;
        }

        const { lessonId, userQuestion } = request.body.data;

        if (!lessonId || !userQuestion) {
            response.status(400).send({ error: "Chýba ID lekcie alebo otázka používateľa." });
            return;
        }

        try {
            const lessonDoc = await db.collection("lessons").doc(lessonId).get();
            if (!lessonDoc.exists) {
                response.status(404).send({ error: "Lekcia nebola nájdená." });
                return;
            }
            const lessonContent = JSON.stringify(lessonDoc.data()?.content);
            const prompt = `Kontext: Si AI asistent pre študentov. Nasleduje obsah lekcie: ${lessonContent}. Otázka od študenta znie: "${userQuestion}". Odpovedz na otázku stručne a jasne v kontexte danej lekcie.`;

            const generatedText = await generateTextFromPrompt(prompt);
            response.status(200).send({ data: { text: generatedText } });
        } catch (error) {
            console.error("Chyba vo funkcii getAiAssistantResponse:", error);
            response.status(500).send({ error: "Nepodarilo sa získať odpoveď od AI." });
        }
    });
});


/**
 * Generuje textový obsah pre lekciu.
 * Toto je onCall funkcia, ktorú volá profesorský panel, a preto nepotrebuje manuálny CORS.
 */
export const generateContent = functions.region("europe-west1").https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Musíte byť prihlásený.");
    }
    const { prompt } = data;
    if (!prompt) {
      throw new functions.https.HttpsError("invalid-argument", "Chýba text pre AI.");
    }
    try {
      const generatedText = await generateTextFromPrompt(prompt);
      // Jednoduché rozdelenie na odseky
      const blocks = generatedText.split("\n\n").map((p) => ({
        type: "paragraph",
        data: { text: p },
      }));
      return { content: blocks };
    } catch (error) {
      console.error("Chyba pri generovaní obsahu:", error);
      throw new functions.https.HttpsError("internal", "Nepodarilo sa vygenerovať obsah.");
    }
  },
);

/**
 * Generuje obsah pre kvíz.
 */
export const createQuiz = functions.region("europe-west1").https.onCall(
  async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Musíte byť prihlásený.");
    const { prompt } = data;
    if (!prompt) throw new functions.https.HttpsError("invalid-argument", "Chýba text pre AI.");
    try {
      const quizContent = await generateContentForQuiz(prompt);
      return { quiz: quizContent };
    } catch (error) {
      console.error("Chyba pri vytváraní kvízu:", error);
      throw new functions.https.HttpsError("internal", "Nepodarilo sa vytvoriť kvíz.");
    }
  },
);

/**
 * Generuje obsah pre test.
 */
export const createTest = functions.region("europe-west1").https.onCall(
  async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Musíte byť prihlásený.");
    const { prompt } = data;
    if (!prompt) throw new functions.https.HttpsError("invalid-argument", "Chýba text pre AI.");
    try {
      const testContent = await generateContentForTest(prompt);
      return { test: testContent };
    } catch (error) {
      console.error("Chyba pri vytváraní testu:", error);
      throw new functions.https.HttpsError("internal", "Nepodarilo sa vytvoriť test.");
    }
  },
);

/**
 * Generuje obsah pre podcast.
 */
export const createPodcast = functions.region("europe-west1").https.onCall(
  async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Musíte byť prihlásený.");
    const { prompt } = data;
    if (!prompt) throw new functions.https.HttpsError("invalid-argument", "Chýba text pre AI.");
    try {
      const podcastContent = await generateContentForPodcast(prompt);
      return { podcast: podcastContent };
    } catch (error) {
      console.error("Chyba pri vytváraní podcastu:", error);
      throw new functions.https.HttpsError("internal", "Nepodarilo sa vytvoriť podcast.");
    }
  },
);

/**
 * Generuje obsah pre prezentáciu.
 */
export const createPresentation = functions.region("europe-west1").https.onCall(
  async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Musíte byť prihlásený.");
    const { prompt } = data;
    if (!prompt) throw new functions.https.HttpsError("invalid-argument", "Chýba text pre AI.");
    try {
      const presentationContent = await generatePresentationContent(prompt);
      return { presentation: presentationContent };
    } catch (error) {
      console.error("Chyba pri vytváraní prezentácie:", error);
      throw new functions.https.HttpsError("internal", "Nepodarilo sa vytvoriť prezentáciu.");
    }
  },
);

/**
 * Generuje obsah na základe nahraných súborov (placeholder).
 */
export const generateContentBasedOnFiles = functions.region("europe-west1").https.onCall(
  async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Musíte byť prihlásený.");
    // TODO: Implementovať logiku na spracovanie súborov
    return { success: true, message: "Funkcia zatiaľ nie je implementovaná." };
  }
);
