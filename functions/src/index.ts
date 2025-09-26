/**
 * Import necessary modules from Firebase SDKs.
 */
import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  onRequest,
  onCall,
  HttpsOptions,
  CallableRequest,
} from "firebase-functions/v2/https";
// Import 'isAxiosError' directly as suggested by the linter
import axios, {isAxiosError} from "axios";

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();

// Define reusable options for functions, including the region.
const functionOptions: HttpsOptions = {
  region: "europe-west1",
};

/**
 * Webhook for Telegram to receive messages from users.
 */
export const telegramWebhook = onRequest(
    functionOptions,
    async (request, response) => {
      logger.info("Telegram webhook called!", {body: request.body});

      const update = request.body;
      if (!update || !update.message) {
        response.status(200).send("OK - No message found");
        return;
      }

      const {message} = update;
      const chatId = message.chat.id;
      const text = message.text || "";
      const username = message.from.username || "unknown";

      try {
        // Save interaction to Firestore
        await db.collection("studentInteractions").add({
          type: "telegram_message",
          studentId: `telegram:${chatId}`,
          telegramUsername: username,
          data: {
            text: text,
          },
          timestamp: new Date(),
        });

        logger.info(`Message from ${username} (${chatId}) saved.`);
        response.status(200).send("Message processed successfully");
      } catch (error) {
        logger.error("Error processing Telegram message:", error);
        response.status(500).send("Internal Server Error");
      }
    },
);

/**
 * Callable function to send a message from the professor's dashboard to a student.
 */
export const sendMessageToStudent = onCall(
    functionOptions,
    async (request: CallableRequest<{chatId: string, text: string}>) => {
      logger.info("sendMessageToStudent called!", {data: request.data});

      const {chatId, text} = request.data;
      const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;

      if (!telegramBotToken) {
        logger.error("TELEGRAM_BOT_TOKEN is not set in environment variables.");
        throw new Error("Bot token is not configured on the server.");
      }

      if (!chatId || !text) {
        throw new Error("Missing 'chatId' or 'text' in the request data.");
      }

      const telegramApiUrl =
        `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;

      try {
        await axios.post(telegramApiUrl, {
          chat_id: chatId,
          text: text,
        });

        logger.info(`Message sent to chatId ${chatId}`);
        return {success: true, message: "Message sent successfully."};
      } catch (error) {
        // Use the directly imported 'isAxiosError'
        logger.error("Error sending message via Telegram:", error);
        if (isAxiosError(error) && error.response) {
          logger.error("Telegram API response:", error.response.data);
        }
        throw new Error("Failed to send message via Telegram.");
      }
    },
);

