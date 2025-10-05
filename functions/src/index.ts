import { initializeApp } from "firebase-admin/app";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { v4 as uuidv4 } from "uuid";
import { getStorage } from "firebase-admin/storage";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import axios, { AxiosError } from "axios";

// --- CORS Configuration ---
const allowedOrigins = [
    "https://ai-sensei-czu-pilot.web.app",
    "http://localhost:5000",
    "http://127.0.0.1:5000"
];

initializeApp();
const db = getFirestore();

// --- Auth/User Functions (Unchanged) ---
export const onStudentCreate = onDocumentCreated(
    { document: "students/{studentId}", region: "europe-west1" },
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

// --- REFACTORED AI FUNCTIONS USING DIRECT AXIOS CALLS ---

const API_KEY = process.env.GEMINI_API_KEY;
const API_BASE_URL = "https://generativelanguage.googleapis.com/v1/models/";

// Define a type for the request body
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GeminiRequestBody = any;

// Universal helper function to call the Gemini v1 API
async function callGemini(model: string, requestBody: GeminiRequestBody): Promise<string> {
    if (!API_KEY) {
        throw new HttpsError("internal", "GEMINI_API_KEY is not set in the environment.");
    }
    const url = `${API_BASE_URL}${model}:generateContent?key=${API_KEY}`;
    try {
        const response = await axios.post(url, requestBody, {
            headers: { "Content-Type": "application/json" },
        });

        if (response.data.candidates && response.data.candidates.length > 0) {
            const candidate = response.data.candidates[0];
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                return candidate.content.parts[0].text;
            }
        }
        throw new HttpsError("internal", "Invalid response structure from Gemini API.");
    } catch (error: unknown) {
        console.error(`Error calling Gemini model ${model}:`, (error as AxiosError).response?.data || (error as Error).message);
        if (axios.isAxiosError(error) && error.response) {
            const status = error.response.status;
            const message = (error.response.data as { error?: { message?: string } })?.error?.message || "Unknown API error";
            if (status === 404) {
                throw new HttpsError("not-found", `Model '${model}' not found. Please check the model name.`);
            }
            if (status === 400) {
                throw new HttpsError("invalid-argument", `Bad request to Gemini API: ${message}`);
            }
            if (status === 401 || status === 403) {
                throw new HttpsError("unauthenticated", "The provided GEMINI_API_KEY is invalid or missing permissions.");
            }
        }
        throw new HttpsError("internal", "An unexpected error occurred while contacting the Gemini API.");
    }
}


export const generateText = onCall(
    { region: "europe-west1", cors: allowedOrigins, secrets: ["GEMINI_API_KEY"] },
    async (request) => {
        const model = "gemini-1.5-flash";
        const prompt = request.data.prompt;

        if (!prompt) {
            throw new HttpsError("invalid-argument", "The 'prompt' field is required.");
        }

        const requestBody = {
            contents: [{ parts: [{ text: prompt }] }],
        };

        const text = await callGemini(model, requestBody);
        return { text };
    }
);

export const generateJson = onCall(
    { region: "europe-west1", cors: allowedOrigins, secrets: ["GEMINI_API_KEY"] },
    async (request) => {
        const model = "gemini-1.5-flash";
        const prompt = request.data.prompt;

        if (!prompt) {
            throw new HttpsError("invalid-argument", "The 'prompt' field is required.");
        }

        const jsonPrompt = `${prompt}\n\nPlease provide the response in a valid JSON format.`;

        const requestBody = {
            contents: [{ parts: [{ text: jsonPrompt }] }],
            generationConfig: {
                response_mime_type: "application/json",
            },
        };

        const rawJsonText = await callGemini(model, requestBody);
        try {
            return JSON.parse(rawJsonText);
        } catch (_e) {
            console.error("Failed to parse JSON from Gemini:", rawJsonText);
            throw new HttpsError("internal", "Model returned invalid JSON.");
        }
    }
);

export const generateFromDocument = onCall(
    { region: "europe-west1", cors: allowedOrigins, secrets: ["GEMINI_API_KEY"] },
    async (request) => {
        const { filePath, prompt } = request.data;
        if (!filePath || !prompt) {
            throw new HttpsError("invalid-argument", "The function must be called with 'filePath' and 'prompt' arguments.");
        }

        try {
            const { GoogleGenerativeAI } = await import("@google/generative-ai");
            const genAI = new GoogleGenerativeAI(API_KEY!);
            const generativeModel = genAI.getGenerativeModel({ model: "gemini-pro-vision" });

            const bucketName = "ai-sensei-czu-pilot.appspot.com";
            const filePart = {
                fileData: {
                    mimeType: "application/pdf",
                    fileUri: `gs://${bucketName}/${filePath}`,
                },
            };

            const file = getStorage().bucket(bucketName).file(filePath);
            const [exists] = await file.exists();
            if (!exists) {
                throw new HttpsError("not-found", `File not found at path: ${filePath}`);
            }

            const result = await generativeModel.generateContent({
                contents: [{ role: "user", parts: [filePart, { text: prompt }] }],
            });

            return { text: result.response.text() };
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : "Unknown error";
            console.error("Error in generateFromDocument with SDK:", errorMessage);
            throw new HttpsError("internal", `An error occurred in the vision model function: ${errorMessage}`);
        }

        const prompt = `You are an AI assistant for a student. Your task is to answer the student's question based *only* on the provided lesson text. Do not use any external knowledge. If the answer is not in the text, say that you cannot find the answer in the provided materials.\n\nLesson Text:\n---\n${lessonText}\n---\n\nStudent's Question: "${userQuestion}"`;
        const requestBody = { contents: [{ parts: [{ text: prompt }] }] };
        const answer = await callGemini("gemini-1.5-flash", requestBody);
        return { answer };
    }
);



// --- Telegram Bot Functions (Unchanged) ---
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
    { region: "europe-west1", cors: allowedOrigins, secrets: ["TELEGRAM_BOT_TOKEN"] },
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
    { region: "europe-west1", cors: allowedOrigins, secrets: ["TELEGRAM_BOT_TOKEN"] },
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
    { region: "europe-west1", cors: allowedOrigins, secrets: ["TELEGRAM_BOT_TOKEN", "PROFESSOR_TELEGRAM_CHAT_ID"] },
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