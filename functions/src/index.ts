import * as functions from "firebase-functions";
// OPRAVA: Zmenený spôsob importu pre firebase-admin
import admin from "firebase-admin"; 
import {
  generateJsonFromPrompt,
  generateTextFromPrompt,
} from "./gemini-api.js";

// Inicializácia Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

const cors = require("cors")({origin: true});

export const getAiAssistantResponse = functions.https.onRequest(
  (request, response) => {
    cors(request, response, async () => {
      try {
        functions.logger.info("Received request for AI assistant response", {
          body: request.body,
        });

        const {lessonId, userQuestion} = request.body.data || request.body;
        
        if (!lessonId || !userQuestion) {
          functions.logger.error("Missing lessonId or userQuestion in request");
          response.status(400).send({
            success: false,
            error: "Chýbajú potrebné parametre: lessonId a userQuestion.",
          });
          return;
        }

        const lessonDoc = await db.collection("lessons").doc(lessonId).get();
        if (!lessonDoc.exists) {
          functions.logger.error(`Lesson with ID ${lessonId} not found`);
          response.status(404).send({success: false, error: "Lekcia nebola nájdená."});
          return;
        }

        const lessonData = lessonDoc.data();
        if (!lessonData || !lessonData.content) {
          functions.logger.error(`Lesson data or content is missing for lesson ID ${lessonId}`);
          response.status(500).send({
            success: false,
            error: "Nepodarilo sa načítať dáta alebo obsah lekcie.",
          });
          return;
        }

        const prompt = `
        You are an AI teaching assistant. Your role is to answer student's questions based on the provided lesson content.
        The answer should be clear, concise, and directly related to the lesson context.
        If the question is outside the scope of the lesson, politely state that you can only answer questions related to the lesson content.

        Lesson Content:
        ---
        ${lessonData.content}
        ---

        Student's Question: "${userQuestion}"

        Your Answer:
      `;

        const result = await generateTextFromPrompt(prompt);
        functions.logger.info("Successfully generated AI response", {
          lessonId,
          userQuestion,
        });
        response.send({success: true, response: result});
      } catch (error) {
        functions.logger.error("Error in getAiAssistantResponse:", error);
        response.status(500).send({success: false, error: "Interná chyba servera."});
      }
    });
  }
);


export const generateQuestions = functions.https.onRequest(
  (request, response) => {
    cors(request, response, async () => {
      try {
        const {lessonId} = request.body;
        if (!lessonId) {
          response.status(400).send("Chýba lessonId.");
          return;
        }

        const lessonDoc = await db.collection("lessons").doc(lessonId).get();
        if (!lessonDoc.exists) {
          response.status(404).send("Lekcia nebola nájdená.");
          return;
        }
        const lessonContent = lessonDoc.data()?.content;

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
