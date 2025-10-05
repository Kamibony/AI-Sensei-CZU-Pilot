import { initializeApp } from "firebase-admin/app";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
// import { v4 as uuidv4 } from "uuid";
import { getStorage } from "firebase-admin/storage";
import { /* getFirestore, FieldValue */ } from "firebase-admin/firestore";
import axios, { AxiosError } from "axios";

// --- CORS Configuration ---
const allowedOrigins = [
    "https://ai-sensei-czu-pilot.web.app",
    "http://localhost:5000",
    "http://127.0.0.1:5000"
];

initializeApp();
// const db = getFirestore();

// --- Auth/User Functions (Unchanged) ---
export const onStudentCreate = onDocumentCreated(
    { document: "students/{studentId}", region: "europe-west1" },
    async (_event) => {
        // Temporarily disabled for diagnostic purposes
        console.log("onStudentCreate called, but is temporarily disabled.");
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
    }
);

// --- Creative Functions (Refactored) ---
export const getLessonKeyTakeaways = onCall(
    { region: "europe-west1", cors: allowedOrigins, secrets: ["GEMINI_API_KEY"] },
    async (request) => {
        const { lessonText } = request.data;
        if (!lessonText) {
            throw new HttpsError("invalid-argument", "The function must be called with 'lessonText'.");
        }

        const prompt = `Based on the following lesson text, please identify and summarize the top 3 key takeaways. Present them as a numbered list.\n\n---\n\n${lessonText}`;
        const requestBody = { contents: [{ parts: [{ text: prompt }] }] };
        const takeaways = await callGemini("gemini-1.5-flash", requestBody);
        return { takeaways };
    }
);

export const getAiAssistantResponse = onCall(
    { region: "europe-west1", cors: allowedOrigins, secrets: ["GEMINI_API_KEY"] },
    async (request) => {
        const { lessonText, userQuestion } = request.data;
        if (!lessonText || !userQuestion) {
            throw new HttpsError("invalid-argument", "The function must be called with 'lessonText' and 'userQuestion'.");
        }

        const prompt = `You are an AI assistant for a student. Your task is to answer the student's question based *only* on the provided lesson text. Do not use any external knowledge. If the answer is not in the text, say that you cannot find the answer in the provided materials.\n\nLesson Text:\n---\n${lessonText}\n---\n\nStudent's Question: "${userQuestion}"`;
        const requestBody = { contents: [{ parts: [{ text: prompt }] }] };
        const answer = await callGemini("gemini-1.5-flash", requestBody);
        return { answer };
    }
);

// --- Telegram Bot Functions (Unchanged) ---
// const botToken = process.env.TELEGRAM_BOT_TOKEN;

/*
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
*/

export const telegramBotWebhook = onRequest(
    { region: "europe-west1", cors: allowedOrigins, secrets: ["TELEGRAM_BOT_TOKEN"] },
    async (req, res) => {
        // Temporarily disabled for diagnostic purposes
        console.log("telegramBotWebhook called, but is temporarily disabled.");
        res.status(200).send("OK - Temporarily disabled for diagnostics.");
    }
);

export const sendMessageToStudent = onCall(
    { region: "europe-west1", cors: allowedOrigins },
    async (_request) => {
        // Temporarily disabled for diagnostic purposes
        console.log("sendMessageToStudent called, but is temporarily disabled.");
        return { status: "success", message: "Temporarily disabled for diagnostics." };
    }
);

export const sendMessageToProfessor = onCall(
    { region: "europe-west1", cors: allowedOrigins },
    async (_request) => {
        // Temporarily disabled for diagnostic purposes
        console.log("sendMessageToProfessor called, but is temporarily disabled.");
        return { status: "success", message: "Temporarily disabled for diagnostics." };
    }
);