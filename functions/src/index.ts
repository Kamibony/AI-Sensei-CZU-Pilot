import { initializeApp } from "firebase-admin/app";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';

initializeApp();

const db = getFirestore();

// --- AI Functions for the Application ---

// Initialize the single, shared Generative AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const generativeModel = genAI.getGenerativeModel({ model: "gemini-pro" });


export const generateText = onCall(
    { region: "europe-west1", cors: true },
    async (request) => {
        const prompt = request.data.prompt;

        try {
            const result = await generativeModel.generateContent(prompt);
            const response = result.response;
            const text = response.text();

            return { text };
        } catch (error: any) {
            console.error("Error generating text:", error);
            if (error.message && (error.message.includes('400 Bad Request') || error.message.includes('API_KEY_INVALID'))) {
                throw new HttpsError("unauthenticated", "The provided GEMINI_API_KEY is invalid or missing permissions.");
            }
            const errorMessage = (error instanceof Error) ? error.message : "Unknown error";
            throw new HttpsError("internal", "Error generating text: " + errorMessage);
        }
    }
);

export const generateJson = onCall(
    { region: "europe-west1", cors: true },
    async (request) => {
        const prompt = request.data.prompt;

        // Instruct the model to return JSON.
        const jsonPrompt = `${prompt}\n\nPlease provide the response in a valid JSON format.`;

        try {
            const result = await generativeModel.generateContent(jsonPrompt);
            const response = result.response;
            const text = response.text().replace(/^```json\n|```$/g, "").trim(); // Strip markdown

            return JSON.parse(text);
        } catch (error: any) {
            console.error("Error generating JSON:", error);
            if (error.message && (error.message.includes('400 Bad Request') || error.message.includes('API_KEY_INVALID'))) {
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
    { region: "europe-west1", cors: true },
    async (request) => {
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

        } catch (e: any) {
            const error = e as Error;
            console.error("Error generating content from document:", error);
            if (error.message && (error.message.includes('400 Bad Request') || error.message.includes('API_KEY_INVALID'))) {
                throw new HttpsError("unauthenticated", "The provided GEMINI_API_KEY is invalid or missing permissions.");
            }
            throw new HttpsError("internal", "An unexpected error occurred while generating content.", error.message);
        }
    }
);

export const generateTelegramActivationCode = onCall(
    { region: "europe-west1", cors: true },
    async (request) => {
        const { lessonId } = request.data;
        if (!lessonId) {
            throw new HttpsError("invalid-argument", "The function must be called with a 'lessonId'.");
        }

        // Generate a unique, random 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        try {
            const lessonRef = db.collection('lessons').doc(lessonId);
            await lessonRef.update({ telegramActivationCode: code });

            console.log(`Generated and saved Telegram activation code ${code} for lesson ${lessonId}`);
            return { code };

        } catch (error) {
            console.error(`Error saving Telegram activation code for lesson ${lessonId}:`, error);
            throw new HttpsError("internal", "Could not update the lesson with the new activation code.");
        }
    }
);


// --- Telegram Bot Functions ---
const botToken = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegramMessage(chatId: string, text: string) {
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

export const telegramWebhook = onCall(
    { region: "europe-west1", cors: true },
    async (request) => {
        const message = request.data.message;
        if (!message || !message.text) {
            console.log("Webhook call without a message text, skipping.");
            return { status: "ok", reason: "no_message_text" };
        }

        const chatId = message.chat.id;
        const activationCode = message.text.trim().toUpperCase();
        const studentId = message.from.id.toString(); // Use Telegram user ID as the student identifier

        // 1. Find the lesson with the matching activation code
        const lessonsRef = db.collection('lessons');
        const lessonQuery = await lessonsRef.where('activationCode', '==', activationCode).limit(1).get();

        if (lessonQuery.empty) {
            await sendTelegramMessage(chatId, `❌ Neplatný aktivační kód. Zkontrolujte kód a zkuste to znovu.`);
            throw new HttpsError("not-found", `Activation code ${activationCode} not found.`);
        }

        const lessonDoc = lessonQuery.docs[0];
        const lessonId = lessonDoc.id;
        const lessonTitle = lessonDoc.data().title;

        // 2. Create or update the student document with their chat_id
        const studentRef = db.collection('students').doc(studentId);
        await studentRef.set({
            telegramChatId: chatId,
            telegramUsername: message.from.username || '',
            lastSeen: new Date(),
        }, { merge: true });

        // 3. Create an activation record
        const activationRef = db.collection('lessonActivations').doc(`${lessonId}_${studentId}`);
        await activationRef.set({
            lessonId: lessonId,
            studentId: studentId,
            activatedAt: new Date(),
            isActive: true,
        });

        await sendTelegramMessage(chatId, `✅ Úspěšně jste aktivovali lekci "${lessonTitle}"! Nyní můžete komunikovat s profesorem.`);

        return { status: "success", message: `Lesson ${lessonId} activated for student ${studentId}.` };
    }
);

export const sendMessageToStudent = onCall(
    { region: "europe-west1", cors: true },
    async (request) => {
        const { studentId, lessonId, text } = request.data;
        if (!studentId || !lessonId || !text) {
            throw new HttpsError("invalid-argument", "The function must be called with 'studentId', 'lessonId', and 'text'.");
        }

        // 1. Check for active lesson activation
        const activationRef = db.collection('lessonActivations').doc(`${lessonId}_${studentId}`);
        const activationDoc = await activationRef.get();

        if (!activationDoc.exists || !activationDoc.data()?.isActive) {
            throw new HttpsError("failed-precondition", "Student does not have an active session for this lesson. They must activate it via the Telegram bot first.");
        }

        // 2. Get student's chat ID
        const studentDoc = await db.collection('students').doc(studentId).get();
        if (!studentDoc.exists) {
            throw new HttpsError("not-found", "Student not found.");
        }

        const chatId = studentDoc.data()?.telegramChatId;
        if (!chatId) {
            throw new HttpsError("failed-precondition", "Student has not connected their Telegram account via the bot.");
        }

        // 3. Send the message
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
        const studentDoc = await db.collection('students').doc(studentId).get();
        const lessonDoc = await db.collection('lessons').doc(lessonId).get();

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
    { region: "europe-west1", cors: true },
    async (request) => {
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
        } catch (error: any) {
            console.error("Error generating key takeaways:", error);
            if (error.message && (error.message.includes('400 Bad Request') || error.message.includes('API_KEY_INVALID'))) {
                throw new HttpsError("unauthenticated", "The provided GEMINI_API_KEY is invalid or missing permissions.");
            }
            throw new HttpsError("internal", "Could not generate key takeaways from the text.");
        }
    }
);

export const getAiAssistantResponse = onCall(
    { region: "europe-west1", cors: true },
    async (request) => {
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
        } catch (error: any) {
            console.error("Error getting AI assistant response:", error);
            if (error.message && (error.message.includes('400 Bad Request') || error.message.includes('API_KEY_INVALID'))) {
                throw new HttpsError("unauthenticated", "The provided GEMINI_API_KEY is invalid or missing permissions.");
            }
            throw new HttpsError("internal", "Could not get an answer from the AI assistant.");
        }
    }
);