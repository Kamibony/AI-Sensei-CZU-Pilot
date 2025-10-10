import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { defineString } from "firebase-functions/params";
import * as GeminiAPI from "./gemini-api";
import * as cors from "cors";
import fetch from "node-fetch";

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();

// Define the deployment region using a Firebase parameter
const DEPLOY_REGION = defineString("DEPLOY_REGION", {
    default: "europe-west1",
    description: "The region to deploy functions to.",
});

const corsHandler = cors({ origin: true });

// --- Helper Functions ---
async function sendTelegramMessage(chatId: number, text: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text }),
        });
        return response.json();
    } catch (error) {
        logger.error("Error sending Telegram message:", error);
        return null;
    }
}

// --- Callable Functions ---
export const getLessonAssistantResponse = onCall(
    { region: DEPLOY_REGION },
    async (request) => {
        const { lessonId, userMessage } = request.data;
        if (!lessonId || !userMessage) {
            throw new HttpsError("invalid-argument", "Missing lessonId or userMessage");
        }

        try {
            const lessonRef = db.collection("lessons").doc(lessonId);
            const lessonDoc = await lessonRef.get();
            if (!lessonDoc.exists) {
                throw new HttpsError("not-found", "Lesson not found");
            }
            const lessonData = lessonDoc.data();
            const prompt = `Based on the lesson "${lessonData?.title}", answer the student's question: "${userMessage}"`;
            const response = await GeminiAPI.generateTextFromPrompt(prompt);
            return { response };
        } catch (error) {
            logger.error("Error in getLessonAssistantResponse:", error);
            throw new HttpsError("internal", "Failed to get AI response");
        }
    }
);

export const sendMessageToStudent = onCall(
    { region: DEPLOY_REGION, secrets: ["TELEGRAM_BOT_TOKEN"] },
    async (request) => {
        const { studentId, message } = request.data;
        if (!studentId || !message) {
            throw new HttpsError("invalid-argument", "Missing studentId or message");
        }

        const studentRef = db.collection("students").doc(studentId);
        const studentDoc = await studentRef.get();
        if (!studentDoc.exists || !studentDoc.data()?.telegramChatId) {
            throw new HttpsError("not-found", "Student or Telegram chat not linked.");
        }
        const chatId = studentDoc.data()?.telegramChatId;
        await sendTelegramMessage(chatId, message);
        return { success: true };
    }
);

export const sendMessageToProfessor = onCall(
    { region: DEPLOY_REGION, secrets: ["TELEGRAM_BOT_TOKEN", "PROFESSOR_TELEGRAM_CHAT_ID"] },
    async (request) => {
        const { studentId, message } = request.data;
        if (!studentId || !message) {
            throw new HttpsError("invalid-argument", "Missing studentId or message");
        }
        const professorChatId = process.env.PROFESSOR_TELEGRAM_CHAT_ID;
        if (!professorChatId) {
             throw new HttpsError("internal", "Professor chat ID not configured.");
        }
        const studentRef = db.collection("students").doc(studentId);
        const studentDoc = await studentRef.get();
        const studentName = studentDoc.exists() ? studentDoc.data()?.name : "Unknown Student";
        
        const fullMessage = `Message from ${studentName} (ID: ${studentId}):\n\n${message}`;
        await sendTelegramMessage(parseInt(professorChatId), fullMessage);
        return { success: true };
    }
);

// --- HTTP Request Functions ---
export const telegramBotWebhook = onRequest(
    { region: DEPLOY_REGION, secrets: ["TELEGRAM_BOT_TOKEN"] },
    (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== 'POST') {
                res.status(405).send('Method Not Allowed');
                return;
            }
    
            const update = req.body;
            if (!update || !update.message) {
                res.status(200).send('OK');
                return;
            }
    
            const message = update.message;
            const chatId = message.chat.id;
            const text = message.text;
    
            try {
                if (text && text.startsWith("/start")) {
                    const token = text.split(' ')[1];
                    if (token) {
                        const q = db.collection("students").where("telegramToken", "==", token).limit(1);
                        const querySnapshot = await q.get();
                        if (!querySnapshot.empty) {
                            const studentDoc = querySnapshot.docs[0];
                            await studentDoc.ref.update({ telegramChatId: chatId });
                            await sendTelegramMessage(chatId, "Váš účet bol úspešne prepojený!");
                        } else {
                            await sendTelegramMessage(chatId, "Neplatný alebo expirovaný token.");
                        }
                    } else {
                        await sendTelegramMessage(chatId, "Pre prepojenie účtu použite príkaz /start s vaším unikátnym tokenom.");
                    }
                    res.status(200).send("OK");
                    return;
                }
    
                const q = db.collection("students").where("telegramChatId", "==", chatId).limit(1);
                const querySnapshot = await q.get();
    
                if (querySnapshot.empty) {
                    await sendTelegramMessage(chatId, "Váš účet nie je prepojený.");
                    res.status(200).send("OK");
                    return;
                }
    
                const studentQuestion = text;
                const prompt = `Si AI Sensei, nápomocný asistent pre študenta. Odpovedz na nasledujúcu otázku stručne a jasne: "${studentQuestion}"`;
                const answer = await GeminiAPI.generateTextFromPrompt(prompt);
                await sendTelegramMessage(chatId, answer);
                res.status(200).send("OK");
    
            } catch (error) {
                logger.error("Error in Telegram webhook:", error);
                await sendTelegramMessage(chatId, "Ospravedlňujem sa, nastala neočakávaná chyba.");
                res.status(500).send("Internal Server Error");
            }
        });
    }
);
