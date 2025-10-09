import { initializeApp } from "firebase-admin/app";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { v4 as uuidv4 } from "uuid";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import axios from "axios";
import cors from "cors";
import * as GeminiAPI from "./gemini-api";

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
            const context = `Kontext z textu lekce:\n${lessonData?.content || "Tato lekce nemá žádný text."}\n\n`;
            
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

async function sendTelegramMessage(chatId: string | number, text: string) {
    if (!botToken) {
        console.error("TELEGRAM_BOT_TOKEN is not set.");
        return;
    }
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        await axios.post(url, {
            chat_id: chatId,
            text: text,
            parse_mode: "Markdown",
        });
    } catch (error) {
        console.error(`Failed to send message to chat_id ${chatId}:`, error);
    }
}

const corsHandler = cors({ origin: true });

export const telegramBotWebhook = onRequest(
    { region: DEPLOY_REGION, secrets: ["TELEGRAM_BOT_TOKEN"] },
    (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== "POST") {
                res.status(405).send("Method Not Allowed");
                return;
            }

            const update = req.body;
            if (!update.message) {
                console.log("Received update without message, skipping.");
                res.status(200).send("OK");
                return;
            }

            const message = update.message;
            const chatId = message.chat.id;
            const text = message.text;

            if (!text || !text.startsWith("/start")) {
                await sendTelegramMessage(chatId, "Ahoj! Jsem AI Sensei bot. Propoj svůj účet s platformou pomocí odkazu, který najdeš na nástěnce.");
                res.status(200).send("OK");
                return;
            }

            const parts = text.split(" ");
            if (parts.length !== 2) {
                await sendTelegramMessage(chatId, "❌ Neplatný formát odkazu. Použij prosím odkaz, ktorý jsi obdržel na platformě AI Sensei.");
                res.status(400).send("Invalid start command format");
                return;
            }

            const token = parts[1];

            try {
                const studentsRef = db.collection("students");
                const q = studentsRef.where("telegramConnectionToken", "==", token).limit(1);
                const querySnapshot = await q.get();

                if (querySnapshot.empty) {
                    console.log(`No student found with token: ${token}`);
                    await sendTelegramMessage(chatId, "❌ Tento propojovací odkaz je neplatný nebo již byl použit. Zkus si vygenerovat nový na svém profilu.");
                    res.status(404).send("Token not found");
                    return;
                }

                const studentDoc = querySnapshot.docs[0];
                const studentId = studentDoc.id;

                await studentDoc.ref.update({
                    telegramChatId: chatId,
                    telegramConnectionToken: FieldValue.delete(),
                });

                console.log(`Successfully connected student ${studentId} with chat ID ${chatId}`);
                await sendTelegramMessage(chatId, "✅ Váš účet byl úspěšně propojen. Nyní můžete komunikovat s profesorem.");

                res.status(200).send("OK");
            } catch (error) {
                console.error("Error processing /start command:", error);
                await sendTelegramMessage(chatId, "Interní chyba serveru. Zkuste to prosím později.");
                res.status(500).send("Internal Server Error");
            }
        });
    }
);

export const sendMessageToStudent = onCall(
    { region: DEPLOY_REGION, cors: allowedOrigins, secrets: ["TELEGRAM_BOT_TOKEN"] },
    async (request) => {
        const { studentId, text } = request.data;
        if (!studentId || !text) {
            throw new HttpsError("invalid-argument", "The function must be called with 'studentId' and 'text'.");
        }

        const studentDoc = await db.collection("students").doc(studentId).get();
        if (!studentDoc.exists) {
            throw new HttpsError("not-found", "Student not found.");
        }

        const chatId = studentDoc.data()?.telegramChatId;
        if (!chatId) {
            throw new HttpsError("failed-precondition", "Student has not connected their Telegram account via the bot.");
        }

        await sendTelegramMessage(chatId, text);

        return { status: "success" };
    }
);

export const sendMessageToProfessor = onCall(
    { region: DEPLOY_REGION, cors: allowedOrigins, secrets: ["TELEGRAM_BOT_TOKEN", "PROFESSOR_TELEGRAM_CHAT_ID"] },
    async (request) => {
        const { lessonId, text } = request.data;
        const studentId = request.auth?.uid;

        if (!studentId) {
            throw new HttpsError("unauthenticated", "The user is not authenticated.");
        }
        if (!lessonId || !text) {
            throw new HttpsError("invalid-argument", "The function must be called with 'lessonId' and 'text'.");
        }

        const professorTelegramChatId = process.env.PROFESSOR_TELEGRAM_CHAT_ID;
        if (!professorTelegramChatId) {
            console.error("PROFESSOR_TELEGRAM_CHAT_ID is not set in environment variables.");
            throw new HttpsError("internal", "The professor's chat ID is not configured.");
        }

        const studentDoc = await db.collection("students").doc(studentId).get();
        const lessonDoc = await db.collection("lessons").doc(lessonId).get();

        const studentEmail = studentDoc.exists ? studentDoc.data()?.email : `Student ID: ${studentId}`;
        const lessonTitle = lessonDoc.exists ? lessonDoc.data()?.title : `Lekce ID: ${lessonId}`;

        const messageToProfessor = `
        📬 *Nová zpráva od studenta*

        *Student:* ${studentEmail}
        *Lekce:* ${lessonTitle}

        *Zpráva:*
        ${text}
        `;

        await sendTelegramMessage(professorTelegramChatId, messageToProfessor);

        return { status: "success", message: "Message sent to professor." };
    }
);
