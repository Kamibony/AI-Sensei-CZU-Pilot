import { initializeApp } from "firebase-admin/app";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { v4 as uuidv4 } from "uuid";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getStorage } from "firebase-admin/storage";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import axios from "axios";

initializeApp();

const db = getFirestore();

// --- Auth/User Functions ---

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

        console.log(`Generating Telegram connection token for new student ${studentId}`);

        try {
            await snap.ref.update({ telegramConnectionToken: token });
            console.log(`Successfully set telegramConnectionToken for student ${studentId}`);
        } catch (error) {
            console.error(`Failed to update student ${studentId} with telegramConnectionToken:`, error);
        }
    }
);


// --- AI Functions for the Application ---

export const generateText = onCall(
    { region: "europe-west1", cors: true, secrets: ["GEMINI_API_KEY"] },
    async (request) => {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const generativeModel = genAI.getGenerativeModel({ model: "models/gemini-pro" });

        const prompt = request.data.prompt;

        try {
            const result = await generativeModel.generateContent(prompt);
            const response = result.response;
            const text = response.text();

            return { text };
        } catch (error: unknown) {
            console.error("Error generating text:", error);
            if (error instanceof Error && (error.message.includes("400 Bad Request") || error.message.includes("API_KEY_INVALID"))) {
                throw new HttpsError("unauthenticated", "The provided GEMINI_API_KEY is invalid or missing permissions.");
            }
            const errorMessage = (error instanceof Error) ? error.message : "Unknown error";
            throw new HttpsError("internal", "Error generating text: " + errorMessage);
        }
    }
);

export const generateJson = onCall(
    { region: "europe-west1", cors: true, secrets: ["GEMINI_API_KEY"] },
    async (request) => {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const generativeModel = genAI.getGenerativeModel({ model: "models/gemini-pro" });

        const prompt = request.data.prompt;

        // Instruct the model to return JSON.
        const jsonPrompt = `${prompt}\n\nPlease provide the response in a valid JSON format.`;

        try {
            const result = await generativeModel.generateContent(jsonPrompt);
            const response = result.response;
            const text = response.text().replace(/^```json\n|```$/g, "").trim(); // Strip markdown

            return JSON.parse(text);
        } catch (error: unknown) {
            console.error("Error generating JSON:", error);
            if (error instanceof Error && (error.message.includes("400 Bad Request") || error.message.includes("API_KEY_INVALID"))) {
                throw new HttpsError("unauthenticated", "The provided GEMINI_API_KEY is invalid or missing permissions.");
            }
            const errorMessage = (error instanceof Error) ? error.message : "Unknown error";
            if (error instanceof SyntaxError) {
                throw new HttpsError("internal", "Failed to parse JSON response from model.");
            }
            throw new HttpsError("internal", "Error generating JSON: " + errorMessage);
        }
    }
);


export const generateFromDocument = onCall(
    { region: "europe-west1", cors: true, secrets: ["GEMINI_API_KEY"] },
    async (request) => {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const generativeModel = genAI.getGenerativeModel({ model: "models/gemini-pro" });

        const { filePath, prompt } = request.data;
        if (!filePath || !prompt) {
            throw new HttpsError("invalid-argument", "The function must be called with 'filePath' and 'prompt' arguments.");
        }

        const bucketName = "ai-sensei-czu-pilot.appspot.com"; // Or use process.env.GCLOUD_STORAGE_BUCKET
        const filePart = {
            fileData: {
                mimeType: "application/pdf", // This should be dynamic based on the file type if possible
                fileUri: `gs://${bucketName}/${filePath}`
            }
        };

        try {
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
            console.error("Error generating content from document:", e);
            if (e instanceof Error) {
                if (e.message.includes("400 Bad Request") || e.message.includes("API_KEY_INVALID")) {
                    throw new HttpsError("unauthenticated", "The provided GEMINI_API_KEY is invalid or missing permissions.");
                }
                throw new HttpsError("internal", "An unexpected error occurred while generating content.", e.message);
            }
            throw new HttpsError("internal", "An unexpected error occurred while generating content.");
        }
    }
);

// --- Telegram Bot Functions ---
const botToken = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegramMessage(chatId: string | number, text: string) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        await axios.post(url, {
            chat_id: chatId,
            text: text,
            parse_mode: "Markdown"
        });
    } catch (error) {
        console.error(`Failed to send message to chat_id ${chatId}:`, error);
        // Don't re-throw, just log the error. The caller can decide how to handle it.
    }
}

export const telegramBotWebhook = onRequest(
    { region: "europe-west1", cors: true },
    async (req, res) => {
        // Telegram sends a POST request
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
                telegramConnectionToken: FieldValue.delete() // Remove the token
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
    { region: "europe-west1", cors: true },
    async (request) => {
        const { studentId, text } = request.data;
        if (!studentId || !text) {
            throw new HttpsError("invalid-argument", "The function must be called with 'studentId' and 'text'.");
        }

        // Get student's chat ID
        const studentDoc = await db.collection("students").doc(studentId).get();
        if (!studentDoc.exists) {
            throw new HttpsError("not-found", "Student not found.");
        }

        const chatId = studentDoc.data()?.telegramChatId;
        if (!chatId) {
            throw new HttpsError("failed-precondition", "Student has not connected their Telegram account via the bot.");
        }

        // Send the message
        await sendTelegramMessage(chatId, text);

        return { status: "success" };
    }
);

export const sendMessageToProfessor = onCall(
    { region: "europe-west1", cors: true },
    async (request) => {
        const { lessonId, text } = request.data;
        const studentId = request.auth?.uid;

        if (!studentId) {
            throw new HttpsError("unauthenticated", "The user is not authenticated.");
        }
        if (!lessonId || !text) {
            throw new HttpsError("invalid-argument", "The function must be called with 'lessonId' and 'text'.");
        }

        // For this simple case, we assume a single professor and hardcode their chat ID.
        // In a real application, you would look this up, perhaps from a 'courses' or 'professors' collection.
        const professorTelegramChatId = process.env.PROFESSOR_TELEGRAM_CHAT_ID;
        if (!professorTelegramChatId) {
            console.error("PROFESSOR_TELEGRAM_CHAT_ID is not set in environment variables.");
            throw new HttpsError("internal", "The professor's chat ID is not configured.");
        }

        // Optional: Fetch student and lesson details to make the message more informative for the professor.
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

// --- New Creative Functions for Student View ---

export const getLessonKeyTakeaways = onCall(
    { region: "europe-west1", cors: true, secrets: ["GEMINI_API_KEY"] },
    async (request) => {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const generativeModel = genAI.getGenerativeModel({ model: "models/gemini-pro" });

        const { lessonText } = request.data;
        if (!lessonText) {
            throw new HttpsError("invalid-argument", "The function must be called with 'lessonText'.");
        }

        const prompt = `Based on the following lesson text, please identify and summarize the top 3 key takeaways. Present them as a numbered list.\n\n---\n\n${lessonText}`;

        try {
            const result = await generativeModel.generateContent(prompt);
            const response = result.response;
            const text = response.text();
            return { takeaways: text };
        } catch (error: unknown) {
            console.error("Error generating key takeaways:", error);
            if (error instanceof Error && (error.message.includes("400 Bad Request") || error.message.includes("API_KEY_INVALID"))) {
                throw new HttpsError("unauthenticated", "The provided GEMINI_API_KEY is invalid or missing permissions.");
            }
            throw new HttpsError("internal", "Could not generate key takeaways from the text.");
        }
    }
);

export const getAiAssistantResponse = onCall(
    { region: "europe-west1", cors: true, secrets: ["GEMINI_API_KEY"] },
    async (request) => {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const generativeModel = genAI.getGenerativeModel({ model: "models/gemini-pro" });

        const { lessonText, userQuestion } = request.data;
        if (!lessonText || !userQuestion) {
            throw new HttpsError("invalid-argument", "The function must be called with 'lessonText' and 'userQuestion'.");
        }

        const prompt = `You are an AI assistant for a student. Your task is to answer the student's question based *only* on the provided lesson text. Do not use any external knowledge. If the answer is not in the text, say that you cannot find the answer in the provided materials.\n\nLesson Text:\n---\n${lessonText}\n---\n\nStudent's Question: "${userQuestion}"`;

        try {
            const result = await generativeModel.generateContent(prompt);
            const response = result.response;
            const text = response.text();
            return { answer: text };
        } catch (error: unknown) {
            console.error("Error getting AI assistant response:", error);
            if (error instanceof Error && (error.message.includes("400 Bad Request") || error.message.includes("API_KEY_INVALID"))) {
                throw new HttpsError("unauthenticated", "The provided GEMINI_API_KEY is invalid or missing permissions.");
            }
            throw new HttpsError("internal", "Could not get an answer from the AI assistant.");
        }
    }
);