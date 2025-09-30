import { initializeApp } from "firebase-admin/app";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';

initializeApp();

// --- AI Functions for the Application ---

feature/update-firebase-functions
// Initialize the single, shared Generative AI client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const generativeModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
 main


export const generateText = onCall({ region: "europe-west1" }, async (request) => {
    const prompt = request.data.prompt;

    try {
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        return { text };
    } catch (error) {
        console.error("Error generating text:", error);
        const errorMessage = (error instanceof Error) ? error.message : "Unknown error";
        throw new HttpsError("internal", "Error generating text: " + errorMessage);
    }
});

export const generateJson = onCall({ region: "europe-west1" }, async (request) => {
    const prompt = request.data.prompt;

    // Instruct the model to return JSON.
    const jsonPrompt = `${prompt}\n\nPlease provide the response in a valid JSON format.`;

    try {
        const result = await generativeModel.generateContent(jsonPrompt);
        const response = result.response;
        const text = response.text().replace(/^```json\n|```$/g, "").trim(); // Strip markdown

        return JSON.parse(text);
    } catch (error) {
        console.error("Error generating JSON:", error);
        const errorMessage = (error instanceof Error) ? error.message : "Unknown error";
        if (error instanceof SyntaxError) {
             throw new HttpsError("internal", "Failed to parse JSON response from model.");
        }
        throw new HttpsError("internal", "Error generating JSON: " + errorMessage);
    }
});


export const generateFromDocument = onCall({ region: "europe-west1" }, async (request) => {
 feature/update-firebase-functions
 main
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

 feature/update-firebase-functions
        const result = await generativeModel.generateContent({
 main
            contents: [{ role: "user", parts: [filePart, { text: prompt }] }],
        });

        return { text: result.response.text() };

    } catch (e) {
        const error = e as Error;
        console.error("Error generating content from document:", error);
        throw new HttpsError("internal", "An unexpected error occurred while generating content.", error.message);
    }
});

// --- Telegram Bot Functions ---

export const telegramWebhook = onCall({ region: "europe-west1" }, async (request) => {
    const message = request.data.message;
    if (!message) {
        console.log("Not a message, skipping.");
        return { status: "ok" };
    }

    const chatId = message.chat.id;
    const studentId = message.text.split(' ')[1]; // Example: /start <studentId>

    if (!studentId) {
        console.warn("Student ID not provided with /start command.");
        return { status: "error", message: "Student ID missing." };
    }

    // Save the chat_id to the student's document in Firestore
    try {
        await getFirestore().collection('students').doc(studentId).set({
            telegramChatId: chatId
        }, { merge: true });

        // Respond to the user
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        await axios.post(url, {
            chat_id: chatId,
            text: "Hello! You have been successfully connected to AI Sensei."
        });
 feature/update-firebase-functions

        return { status: "success" };

 main
    } catch (error) {
        console.error("Error saving chat ID:", error);
        throw new HttpsError("internal", "Could not save chat ID.");
    }
});

export const sendMessageToStudent = onCall({ region: "europe-west1" }, async (request) => {
    const { studentId, text } = request.data;
    if (!studentId || !text) {
        throw new HttpsError("invalid-argument", "The function must be called with 'studentId' and 'text'.");
    }

    try {
        // Retrieve the student's chat_id from Firestore
        const studentDoc = await getFirestore().collection('students').doc(studentId).get();
        if (!studentDoc.exists) {
            throw new HttpsError("not-found", "Student not found.");
        }

        const chatId = studentDoc.data()?.telegramChatId;
        if (!chatId) {
            throw new HttpsError("failed-precondition", "Student has not connected their Telegram account.");
        }

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

        await axios.post(url, {
            chat_id: chatId,
            text: text,
            parse_mode: "Markdown"
        });

        return { status: "success" };

    } catch (error) {
        console.error("Error sending message:", error);
        throw new HttpsError("internal", "Failed to send message.", error);
    }
});