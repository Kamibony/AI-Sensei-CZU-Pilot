import * as functions from "firebase-functions";
import {
  generateJsonFromPrompt,
  generateTextFromPrompt,
} from "./gemini-api";
import {db} from "./firebase-admin-init";

// Nastavenie CORS pre všetky funkcie v tomto súbore
const cors = require("cors")({origin: true});

/**
 * Cloud Function na získanie odpovede od AI asistenta.
 * Očakáva `lessonId` a `userQuestion` v tele požiadavky.
 */
export const getAiAssistantResponse = functions.https.onRequest(
  (request, response) => {
    cors(request, response, async () => {
      try {
        const {lessonId, userQuestion} = request.body;

        if (!lessonId || !userQuestion) {
          response.status(400).send("Chýbajú potrebné parametre.");
          return;
        }

        // Získanie dát lekcie z Firestore
        const lessonDoc = await db.collection("lessons").doc(lessonId).get();
        if (!lessonDoc.exists) {
          response.status(404).send("Lekcia nebola nájdená.");
          return;
        }

        const lessonData = lessonDoc.data();
        if (!lessonData) {
          response.status(500).send("Nepodarilo sa načítať dáta lekcie.");
          return;
        }


        // Príprava promptu pre Gemini
        const prompt = `
        Context: ${lessonData.content}
        Otázka: ${userQuestion}
        Odpoveď:
      `;

        const result = await generateTextFromPrompt(prompt);
        response.send({success: true, response: result});
      } catch (error) {
        console.error("Chyba v getAiAssistantResponse:", error);
        response.status(500).send({success: false, error: "Interná chyba servera."});
      }
    });
  }
);

/**
 * Cloud Function na generovanie otázok k lekcii.
 * Očakáva `lessonId` v tele požiadavky.
 */
export const generateQuestions = functions.https.onRequest(
  (request, response) => {
    cors(request, response, async () => {
      try {
        const {lessonId} = request.body;
        if (!lessonId) {
          response.status(400).send("Chýba lessonId.");
          return;
        }

        // Získanie obsahu lekcie
        const lessonDoc = await db.collection("lessons").doc(lessonId).get();
        if (!lessonDoc.exists) {
          response.status(404).send("Lekcia nebola nájdená.");
          return;
        }
        const lessonContent = lessonDoc.data()?.content;

        // Prompt pre generovanie otázok
        const prompt = `
        Na základe nasledujúceho textu vygeneruj 5 otázok s možnosťami a označ správnu odpoveď:
        ${lessonContent}
      `;

        const questionsJson = await generateJsonFromPrompt(prompt);
        response.send({success: true, questions: questionsJson});
      } catch (error) {
        console.error("Chyba pri generovaní otázok:", error);
        response.status(500).send({success: false, error: "Interná chyba servera."});
      }
    });
  }
);
