import { initializeApp } from "firebase-admin/app";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { v4 as uuidv4 } from "uuid";
import { getStorage } from "firebase-admin/storage";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import axios, { AxiosError } from "axios";
import { GoogleAuth } from "google-auth-library";

// --- Vertex AI Response Types ---
interface Part {
    text: string;
}
interface Content {
    parts: Part[];
    role?: string;
}
interface Candidate {
    content: Content;
    finishReason?: string;
    index?: number;
    safetyRatings?: object[];
}
interface StreamedGenerateContentResponse {
    candidates: Candidate[];
}

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

// --- REFACTORED AI FUNCTIONS USING DIRECT AXIOS CALLS TO VERTEX AI ---

const REGION = "europe-west1";
const API_BASE_URL = `https://${REGION}-aiplatform.googleapis.com/v1`;

// Define a type for the request body.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GeminiRequestBody = any;

// Universal helper function to call the Vertex AI Gemini API
async function callGemini(model: string, requestBody: GeminiRequestBody): Promise<string> {
    const projectId = process.env.GCLOUD_PROJECT;
    if (!projectId) {
        throw new HttpsError("internal", "GCLOUD_PROJECT environment variable not set.");
    }

    const url = `${API_BASE_URL}/projects/${projectId}/locations/${REGION}/publishers/google/models/${model}:streamGenerateContent`;

    try {
        // Get application default credentials for authentication
        const auth = new GoogleAuth({
            scopes: "https://www.googleapis.com/auth/cloud-platform",
        });
        const client = await auth.getClient();
        const accessToken = (await client.getAccessToken()).token;

        if (!accessToken) {
            throw new HttpsError("internal", "Failed to obtain access token.");
        }

        const response = await axios.post(url, requestBody, {
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });

        // The response from a streaming endpoint is an array of objects.
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
            // We concatenate the text from all parts of all candidates.
            const fullText = response.data
                .flatMap((chunk: StreamedGenerateContentResponse) => chunk.candidates)
                .flatMap((candidate: Candidate) => candidate.content.parts)
                .map((part: Part) => part.text)
                .join("");

            if (fullText) {
                return fullText;
            }
        }

        console.warn("Gemini API returned an empty or invalid response:", response.data);
        throw new HttpsError("internal", "Invalid or empty response structure from Vertex AI API.");

    } catch (error: unknown) {
        const axiosError = error as AxiosError;
        console.error(`Error calling Vertex AI model ${model}:`, axiosError.response?.data || (error as Error).message);

        if (axios.isAxiosError(error) && error.response) {
            const status = error.response.status;
            const errorDetails = error.response.data as { error?: { message?: string, code?: number, status?: string } };
            const message = errorDetails?.error?.message || "Unknown API error";

            // Remap status codes to HttpsError codes
            if (status === 404) {
                 throw new HttpsError("not-found", `Model '${model}' not found. Verify the model name and the API endpoint. Details: ${message}`);
            }
            if (status === 400) {
                throw new HttpsError("invalid-argument", `Bad request to Vertex AI API: ${message}`);
            }
            if (status === 401 || status === 403) {
                 throw new HttpsError("unauthenticated", `Authentication failed. Ensure the service account has the 'Vertex AI User' role. Details: ${message}`);
            }
        }

        // Generic fallback error
        throw new HttpsError("internal", "An unexpected error occurred while contacting the Vertex AI API.");
    }
}


export const generateText = onCall(
    { region: "europe-west1", cors: allowedOrigins },
    async (request) => {
        const model = "gemini-1.5-flash-001";
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
    { region: "europe-west1", cors: allowedOrigins },
    async (request) => {
        const model = "gemini-1.5-flash-001";
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
    { region: "europe-west1", cors: allowedOrigins },
    async (request) => {
        const { filePath, prompt } = request.data;
        if (!filePath || !prompt) {
            throw new HttpsError("invalid-argument", "The function must be called with 'filePath' and 'prompt' arguments.");
        }

        const model = "gemini-pro-vision";
        const bucketName = "ai-sensei-czu-pilot.appspot.com";

        // Verify the file exists before making the API call
        const file = getStorage().bucket(bucketName).file(filePath);
        const [exists] = await file.exists();
        if (!exists) {
            throw new HttpsError("not-found", `File not found at path: ${filePath}`);
        }

        const requestBody = {
            contents: [
                {
                    parts: [
                        {
                            fileData: {
                                mimeType: "application/pdf",
                                fileUri: `gs://${bucketName}/${filePath}`,
                            },
                        },
                        {
                            text: prompt,
                        },
                    ],
                },
            ],
        };

        const text = await callGemini(model, requestBody);
        return { text };
    }
);


// --- Creative Functions (Refactored) ---
export const getLessonKeyTakeaways = onCall(
    { region: "europe-west1", cors: allowedOrigins },
    async (request) => {
        const { lessonText } = request.data;
        if (!lessonText) {
            throw new HttpsError("invalid-argument", "The function must be called with 'lessonText'.");
        }

        const prompt = `Based on the following lesson text, please identify and summarize the top 3 key takeaways. Present them as a numbered list.\n\n---\n\n${lessonText}`;
        const requestBody = { contents: [{ parts: [{ text: prompt }] }] };
        const takeaways = await callGemini("gemini-1.5-flash-001", requestBody);
        return { takeaways };
    }
);

export const getAiAssistantResponse = onCall(
    { region: "europe-west1", cors: allowedOrigins },
    async (request) => {
        const { lessonText, userQuestion } = request.data;
        if (!lessonText || !userQuestion) {
            throw new HttpsError("invalid-argument", "The function must be called with 'lessonText' and 'userQuestion'.");
        }

        const prompt = `You are an AI assistant for a student. Your task is to answer the student's question based *only* on the provided lesson text. Do not use any external knowledge. If the answer is not in the text, say that you cannot find the answer in the provided materials.\n\nLesson Text:\n---\n${lessonText}\n---\n\nStudent's Question: "${userQuestion}"`;
        const requestBody = { contents: [{ parts: [{ text: prompt }] }] };
        const answer = await callGemini("gemini-1.5-flash-001", requestBody);
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