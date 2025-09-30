import { initializeApp } from "firebase-admin/app";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { VertexAI } from "@google-cloud/vertexai";

initializeApp();

// --- AI Functions for the Application ---

// Initialize the Vertex AI client
const vertexAI = new VertexAI({
    project: process.env.GCLOUD_PROJECT!,
    location: "europe-west1",
});

const generativeModel = vertexAI.getGenerativeModel({
    model: "gemini-1.0-pro",
});


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
    // NOTE: The original implementation of this function relied on a feature
    // of the newer `@google/genai` SDK that allowed passing a Google Cloud Storage
    // URI directly to the model. The older `@google/generative-ai` SDK does not
    // support this. To restore this functionality, the file would need to be
    // downloaded from Storage and its content (e.g., text from a PDF) extracted
    // before being sent to the model, which is beyond the scope of the current fix.
    console.error("generateFromDocument is not implemented for this SDK version.");
    throw new HttpsError("unimplemented", "Generating content from a document is not currently supported.");
});

// --- Placeholder funkce pro Telegram ---

export const telegramWebhook = onRequest({region: "europe-west1"}, (req, res) => {
  console.log("Telegram webhook called with:", req.body);
  res.status(200).send("Webhook received!");
});

export const sendMessageToStudent = onCall({region: "europe-west1"}, async (request) => {
  const studentId = request.data.studentId;
  const message = request.data.message;
  console.log(`Pretending to send message to student ${studentId}: ${message}`);
  return {status: "Message sent successfully (simulation)"};
});