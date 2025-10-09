import { initializeApp } from "firebase-admin/app";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { v4 as uuidv4 } from "uuid";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import axios from "axios";
import cors from "cors";
import * as GeminiAPI from "./gemini-api";
import { z } from "zod";
import {
  generateContent,
  generateContentSchema,
} from "./prompts";

const DEPLOY_REGION = "europe-west1";
const allowedOrigins = [
    "https://ai-sensei-czu-pilot.web.app",
    "http://localhost:5000",
    "http://127.0.0.1:5000"
];

initializeApp();
const db = getFirestore();

export const onStudentCreate = onDocumentCreated(
    { document: "students/{studentId}", region: DEPLOY_REGION },
    async (event) => {
        const snap = event.data;
        if (!snap) return;
        const studentId = event.params.studentId;
        const token = uuidv4();
        try {
            await snap.ref.update({ telegramConnectionToken: token });
        } catch (error) {
            console.error(`Failed to update student ${studentId} with token:`, error);
        }
    }
);

export { generateContent };

// --- NOVÁ INTELIGENTNÁ FUNKCIA PRE ŠTUDENTSKÝ CHAT ---
export const getLessonAssistantResponse = onCall(
    { region: DEPLOY_REGION, cors: allowedOrigins },
    async (request) => {
        const studentId = request.auth?.uid;
        if (!studentId) {
            throw new HttpsError("unauthenticated", "The user is not authenticated.");
        }

        const { lessonId, userQuestion } = request.data;
        if (!lessonId || !userQuestion) {
            throw new HttpsError("invalid-argument", "The function must be called with 'lessonId' and 'userQuestion'.");
        }

        try {
            const lessonDoc = await db.collection("lessons").doc(lessonId).get();
            if (!lessonDoc.exists) {
                throw new HttpsError("not-found", "Lesson not found.");
            }
            const lessonData = lessonDoc.data();

            // Zostavíme kontext pre AI z textu lekcie
            let context = `Kontext z textu lekce:\n${lessonData?.content || "Tato lekce nemá žádný text."}\n\n`;
            
            // Tu by sme v budúcnosti mohli pridať aj obsah RAG súborov, ak sú k lekcii priradené
            
            const prompt = `Jsi AI asistent studenta. Tvým úkolem je odpovědět na otázku studenta POUZE na základě poskytnutého kontextu z lekce. Nepoužívej žádné externí znalosti. Pokud odpověď v textu není, odpověz: "Omlouvám se, ale na tuto otázku neznám odpověď na základě poskytnutých materiálů. Chcete, abych dotaz přeposlal profesorovi?"\n\n${context}\n\nOtázka studenta: "${userQuestion}"`;

            const answer = await GeminiAPI.generateTextFromPrompt(prompt);
            return { answer };

        } catch (error) {
            console.error("getLessonAssistantResponse Cloud Function failed:", error);
            throw new HttpsError("internal", (error as Error).message);
        }
    }
);


const botToken = process.env.TELEGRAM_BOT_TOKEN;
// ... (zvyšok súboru s Telegram funkciami zostáva bez zmeny)
