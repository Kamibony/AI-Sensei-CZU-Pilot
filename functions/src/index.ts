import { initializeApp } from "firebase-admin/app";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';

initializeApp();

// --- AI Functions for the Application ---

// Helper function to initialize the Generative AI client
const getGenAIClient = () => {
    // Make sure to have GOOGLE_API_KEY set in your environment
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        throw new HttpsError("internal", "Google API Key is not set.");
    }
    return new GoogleGenerativeAI(apiKey);
};


export const generateText = onCall({ region: "europe-west1" }, async (request) => {
    const prompt = request.data.prompt;

    try {
        const result = await generativeModel.generateContent(prompt);
        const response = await result.response;

        // Defensive check for response structure
        if (!response.candidates || !response.candidates[0] || !response.candidates[0].content || !response.candidates[0].content.parts || !response.candidates[0].content.parts[0].text) {
            throw new HttpsError("internal", "Invalid response structure from model.");
        }

        return { text: response.candidates[0].content.parts[0].text };
    } catch (error) {
        console.error("Error generating text:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
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
        const response = await result.response;

        // Defensive check for response structure
        if (!response.candidates || !response.candidates[0] || !response.candidates[0].content || !response.candidates[0].content.parts || !response.candidates[0].content.parts[0].text) {
            throw new HttpsError("internal", "Invalid response structure from model.");
        }

        const text = response.candidates[0].content.parts[0].text;
        return JSON.parse(text);
    } catch (error) {
        console.error("Error generating JSON:", error);
         if (error instanceof HttpsError) {
            throw error;
        }
        const errorMessage = (error instanceof Error) ? error.message : "Unknown error";
        if (error instanceof SyntaxError) {
             throw new HttpsError("internal", "Failed to parse JSON response from model.");
        }
        throw new HttpsError("internal", "Error generating JSON: " + errorMessage);
    }
});


export const generateFromDocument = onCall({ region: "europe-west1" }, async (request) => {
    const client = getGenAIClient();
    const model = client.getGenerativeModel({ model: "gemini-1.5-flash-001" });

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

        const result = await model.generateContent({
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

        return { status: "success" };

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