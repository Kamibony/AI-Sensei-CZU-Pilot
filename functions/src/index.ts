import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as GeminiAPI from "./gemini-api.js";
import cors from "cors";
import fetch from "node-fetch";

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();

const corsHandler = cors({ origin: true });

// --- Helper Functions ---
async function sendTelegramMessage(chatId: number, text: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
        logger.error("TELEGRAM_BOT_TOKEN is not set.");
        return;
    }
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text }),
        });
    } catch (error) {
        logger.error("Error sending Telegram message:", error);
    }
}

// --- ZJEDNOTENÁ FUNKCIA PRE VŠETKY AI OPERÁCIE ---
export const generateContent = onCall({ region: "europe-west1" }, async (request) => {
    const { contentType, promptData, filePaths } = request.data;

    if (!contentType || !promptData) {
        throw new HttpsError("invalid-argument", "Missing contentType or promptData.");
    }

    try {
        let finalPrompt = promptData.userPrompt;
        const isJson = ['presentation', 'quiz', 'test', 'post'].includes(contentType);

        if (isJson) {
            switch(contentType) {
                case 'presentation':
                    finalPrompt = `Vytvoř prezentaci na téma "${promptData.userPrompt}" s přesně ${promptData.slideCount || 5} slidy. Odpověď musí být JSON objekt s klíčem 'slides', který obsahuje pole objektů, kde každý objekt má klíče 'title' (string) a 'points' (pole stringů).`;
                    break;
                case 'quiz':
                    finalPrompt = `Vytvoř kvíz na základě zadání: "${promptData.userPrompt}". Odpověď musí být JSON objekt s klíčem 'questions', který obsahuje pole objektů, kde každý objekt má klíče 'question_text' (string), 'options' (pole stringů) a 'correct_option_index' (number).`;
                    break;
                case 'test':
                    finalPrompt = `Vytvoř test na téma "${promptData.userPrompt}" s ${promptData.questionCount || 5} otázkami. Obtížnost: ${promptData.difficulty || 'Střední'}. Typy otázek: ${promptData.questionTypes || 'Mix'}. Odpověď musí být JSON objekt s klíčem 'questions', který obsahuje pole objektů, kde každý objekt má klíče 'question_text' (string), 'type' (string), 'options' (pole stringů) a 'correct_option_index' (number).`;
                    break;
                case 'post':
                     finalPrompt = `Vytvoř sérii ${promptData.episodeCount || 3} podcast epizod na téma "${promptData.userPrompt}". Odpověď musí být JSON objekt s klíčem 'episodes', který obsahuje pole objektů, kde každý objekt má klíče 'title' (string) a 'script' (string).`;
                     break;
            }
        }
        
        if (filePaths && filePaths.length > 0) {
            return isJson 
                ? await GeminiAPI.generateJsonFromDocuments(filePaths, finalPrompt)
                : { text: await GeminiAPI.generateTextFromDocuments(filePaths, finalPrompt) };
        } else {
            return isJson
                ? await GeminiAPI.generateJsonFromPrompt(finalPrompt)
                : { text: await GeminiAPI.generateTextFromPrompt(finalPrompt) };
        }

    } catch (error) {
        logger.error(`Error in generateContent for type ${contentType}:`, error);
        let message = "An unknown error occurred.";
        if (error instanceof Error) {
            message = error.message;
        }
        throw new HttpsError("internal", `Failed to generate content: ${message}`);
    }
});

export const getAiAssistantResponse = onCall(
    { region: "europe-west1" },
    async (request) => {
        const { lessonId, userQuestion } = request.data;
        if (!lessonId || !userQuestion) {
            throw new HttpsError("invalid-argument", "Missing lessonId or userQuestion");
        }
        try {
            const lessonRef = db.collection("lessons").doc(lessonId);
            const lessonDoc = await lessonRef.get();
            if (!lessonDoc.exists) {
                throw new HttpsError("not-found", "Lesson not found");
            }
            const lessonData = lessonDoc.data();
            const prompt = `Based on the lesson "${lessonData?.title}", answer the student's question: "${userQuestion}"`;
            const answer = await GeminiAPI.generateTextFromPrompt(prompt);
            return { answer };
        } catch (error) {
            logger.error("Error in getAiAssistantResponse:", error);
            let message = "Failed to get AI response";
            if (error instanceof Error) {
                message = error.message;
            }
            throw new HttpsError("internal", message);
        }
    }
);


export const sendMessageToStudent = onCall(
    { region: "europe-west1", secrets: ["TELEGRAM_BOT_TOKEN"] },
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
    { region: "europe-west1", secrets: ["TELEGRAM_BOT_TOKEN", "PROFESSOR_TELEGRAM_CHAT_ID"] },
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
        const studentName = studentDoc.exists ? studentDoc.data()?.name : "Unknown Student";
        const fullMessage = `Message from ${studentName} (ID: ${studentId}):\n\n${message}`;
        await sendTelegramMessage(parseInt(professorChatId), fullMessage);
        return { success: true };
    }
);

export const telegramBotWebhook = onRequest(
    { region: "europe-west1", secrets: ["TELEGRAM_BOT_TOKEN"] },
    (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== 'POST') {
                res.status(405).send('Method Not Allowed');
                return;
            }
            const update = req.body;
            if (!update || !update.message) {
                res.status(200).send('OK'); // Not a message update, ignore
                return;
            }
            const message = update.message;
            const chatId = message.chat.id;
            const text = message.text;

            try {
                // Handle /start command for account linking
                if (text && text.startsWith("/start")) {
                    const token = text.split(' ')[1];
                    if (token) {
                        const q = db.collection("students").where("telegramConnectionToken", "==", token).limit(1);
                        const querySnapshot = await q.get();
                        if (!querySnapshot.empty) {
                            const studentDoc = querySnapshot.docs[0];
                            await studentDoc.ref.update({ telegramChatId: chatId });
                            await sendTelegramMessage(chatId, "Váš účet byl úspešně prepojený! Od teraz môžete klásť otázky k lekciám.");
                        } else {
                            await sendTelegramMessage(chatId, "Neplatný alebo expirovaný token.");
                        }
                    } else {
                        await sendTelegramMessage(chatId, "Pre prepojenie účtu použite príkaz /start s vaším unikátnym tokenom z aplikácie.");
                    }
                    res.status(200).send("OK");
                    return;
                }

                // Find student by their chat ID
                const q = db.collection("students").where("telegramChatId", "==", chatId).limit(1);
                const querySnapshot = await q.get();
                if (querySnapshot.empty) {
                    await sendTelegramMessage(chatId, "Váš účet nie je prepojený. Prosím, prihláste sa do aplikácie a použite váš unikátny link.");
                    res.status(200).send("OK");
                    return;
                }

                const studentDoc = querySnapshot.docs[0];
                const studentData = studentDoc.data();
                const userQuestion = text;

                // Check if student has an active lesson context
                const lessonId = studentData.lastActiveLessonId;
                if (!lessonId) {
                    await sendTelegramMessage(chatId, "Aby som vám mohol odpovedať, otvorte prosím najprv lekciu v aplikácii AI Sensei. Potom sa budem môcť zamerať na jej obsah.");
                    res.status(200).send("OK");
                    return;
                }

                // Fetch the lesson data using the stored ID
                const lessonRef = db.collection("lessons").doc(lessonId);
                const lessonDoc = await lessonRef.get();
                if (!lessonDoc.exists) {
                    await sendTelegramMessage(chatId, "Zdá sa, že lekcia, ktorú ste mali otvorenú, už neexistuje. Otvorte prosím inú lekciu v aplikácii.");
                    res.status(200).send("OK");
                    return;
                }
                
                const lessonData = lessonDoc.data();
                
                // Logic identical to getAiAssistantResponse
                const prompt = `Based on the lesson "${lessonData?.title}", answer the student's question: "${userQuestion}"`;
                const answer = await GeminiAPI.generateTextFromPrompt(prompt);
                
                await sendTelegramMessage(chatId, answer);
                res.status(200).send("OK");

            } catch (error) {
                logger.error("Error in Telegram webhook:", error);
                await sendTelegramMessage(chatId, "Ospravedlňujem sa, nastala neočakávaná chyba pri spracovaní vašej požiadavky.");
                res.status(500).send("Internal Server Error");
            }
        });
    }
);
