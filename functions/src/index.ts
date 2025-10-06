import { initializeApp } from "firebase-admin/app";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { v4 as uuidv4 } from "uuid";
import { getStorage } from "firebase-admin/storage";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import axios from "axios";
import * as GeminiAPI from "./gemini-api.js";

// --- CENTRALIZOVANÁ KONFIGURACE REGIONU ---
// Všechny funkce budou nasazeny do tohoto regionu, kde je Gemini API dostupné.
const DEPLOY_REGION = "us-central1";

// --- CORS Configuration ---
const allowedOrigins = [
    "https://ai-sensei-czu-pilot.web.app",
    "http://localhost:5000",
    "http://1227.0.0.1:5000"
];

initializeApp();
const db = getFirestore();

// --- Auth/User Functions ---
export const onStudentCreate = onDocumentCreated(
    { document: "students/{studentId}", region: DEPLOY_REGION },
    async (event) => {
        const snap = event.data;
        if (!snap) {
            console.log("No data associated with the event");
            return;
        }
        const studentId = event.params.studentId;
        const token = uuidv4();
        try {
            await snap.ref.update({ telegramConnectionToken: token });
            console.log(`Successfully set telegramConnectionToken for student ${studentId}`);
        } catch (error) {
            console.error(`Failed to update student ${studentId} with telegramConnectionToken:`, error);
        }
    }
);

// --- Refactored AI Functions ---
export const generateText = onCall(
    { region: DEPLOY_REGION, cors: allowedOrigins },
    async (request) => {
        const prompt = request.data.prompt;
        if (!prompt) {
            throw new HttpsError("invalid-argument", "The 'prompt' field is required.");
        }
        try {
            const text = await GeminiAPI.generateTextFromPrompt(prompt);
            return { text };
        } catch (error) {
            console.error("generateText Cloud Function failed:", error);
            throw new HttpsError("internal", (error as Error).message);
        }
    }
);

export const generateJson = onCall(
    { region: DEPLOY_REGION, cors: allowedOrigins },
    async (request) => {
        const prompt = request.data.prompt;
        if (!prompt) {
            throw new HttpsError("invalid-argument", "The 'prompt' field is required.");
        }
        try {
            const json = await GeminiAPI.generateJsonFromPrompt(prompt);
            return json;
        } catch (error) {
            console.error("generateJson Cloud Function failed:", error);
            throw new HttpsError("internal", (error as Error).message);
        }
    }
);

export const generateFromDocument = onCall(
    { region: DEPLOY_REGION, cors: allowedOrigins },
    async (request) => {
        const { filePath, prompt } = request.data;
        if (!filePath || !prompt) {
            throw new HttpsError("invalid-argument", "The function must be called with 'filePath' and 'prompt' arguments.");
        }

        const bucketName = "ai-sensei-czu-pilot.appspot.com";
        const file = getStorage().bucket(bucketName).file(filePath);
        const [exists] = await file.exists();
        if (!exists) {
            throw new HttpsError("not-found", `File not found at path: ${filePath}`);
        }

        try {
            const text = await GeminiAPI.generateTextFromDocument(filePath, prompt);
            return { text };
        } catch (error) {
            console.error("generateFromDocument Cloud Function failed:", error);
            throw new HttpsError("internal", (error as Error).message);
        }
    }
);

export const getLessonKeyTakeaways = onCall(
    { region: DEPLOY_REGION, cors: allowedOrigins },
    async (request) => {
        const { lessonText } = request.data;
        if (!lessonText) {
            throw new HttpsError("invalid-argument", "The function must be called with 'lessonText'.");
        }
        const prompt = `Based on the following lesson text, please identify and summarize the top 3 key takeaways. Present them as a numbered list.\n\n---\n\n${lessonText}`;
        try {
            const takeaways = await GeminiAPI.generateTextFromPrompt(prompt);
            return { takeaways };
        } catch (error) {
            console.error("getLessonKeyTakeaways Cloud Function failed:", error);
            throw new HttpsError("internal", (error as Error).message);
        }
    }
);

export const getAiAssistantResponse = onCall(
    { region: DEPLOY_REGION, cors: allowedOrigins },
    async (request) => {
        const { lessonText, userQuestion } = request.data;
        if (!lessonText || !userQuestion) {
            throw new HttpsError("invalid-argument", "The function must be called with 'lessonText' and 'userQuestion'.");
        }
        const prompt = `You are an AI assistant for a student. Your task is to answer the student's question based *only* on the provided lesson text. Do not use any external knowledge. If the answer is not in the text, say that you cannot find the answer in the provided materials.\n\nLesson Text:\n---\n${lessonText}\n---\n\nStudent's Question: "${userQuestion}"`;
        try {
            const answer = await GeminiAPI.generateTextFromPrompt(prompt);
            return { answer };
        } catch (error) {
            console.error("getAiAssistantResponse Cloud Function failed:", error);
            throw new HttpsError("internal", (error as Error).message);
        }
    }
);


// --- Telegram Bot Functions ---
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

export const telegramBotWebhook = onRequest(
    { region: DEPLOY_REGION, cors: allowedOrigins, secrets: ["TELEGRAM_BOT_TOKEN"] },
    async (req, res) => {
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
            await sendTelegramMessage(chatId, "❌ Neplatný formát odkazu. Použij prosím odkaz, který jsi obdržel na platformě AI Sensei.");
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
