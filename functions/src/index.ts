import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
  generateContentForLesson,
  createQuizForLesson,
  createTestForLesson,
  createPodcastForLesson,
  createPresentationForLesson,
} from "./gemini-api";
import {db} from "./firebase-admin-init";

// Nastavenie regiónu pre všetky funkcie
const europeWest1 = functions.region("europe-west1");

// Inicializácia Firebase Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * Generates content for a lesson based on a prompt.
 */
export const generateContent = europeWest1.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "The function must be called while authenticated.",
      );
    }
    const {lessonId, prompt} = data;
    if (!lessonId || !prompt) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing lessonId or prompt.",
      );
    }
    try {
      const generatedContent = await generateContentForLesson(prompt);
      await db.collection("lessons").doc(lessonId).update({
        content: generatedContent,
      });
      return {success: true, content: generatedContent};
    } catch (error) {
      console.error("Error in generateContent function:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to generate content.",
      );
    }
  },
);

/**
 * Creates a quiz for a given lesson content.
 */
export const createQuiz = europeWest1.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }
  const {lessonId, lessonContent} = data;
  if (!lessonId || !lessonContent) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing lessonId or lessonContent.",
    );
  }
  try {
    const quiz = await createQuizForLesson(lessonContent);
    await db.collection("lessons").doc(lessonId).update({
      quiz: quiz,
    });
    return {success: true, quiz: quiz};
  } catch (error) {
    console.error("Error in createQuiz function:", error);
    throw new functions.https.HttpsError("internal", "Failed to create quiz.");
  }
});

/**
 * Creates a test for a given lesson content.
 */
export const createTest = europeWest1.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }
  const {lessonId, lessonContent} = data;
  if (!lessonId || !lessonContent) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing lessonId or lessonContent.",
    );
  }
  try {
    const test = await createTestForLesson(lessonContent);
    await db.collection("lessons").doc(lessonId).update({
      test: test,
    });
    return {success: true, test: test};
  } catch (error) {
    console.error("Error in createTest function:", error);
    throw new functions.https.HttpsError("internal", "Failed to create test.");
  }
});

/**
 * Creates a podcast for a given lesson content.
 */
export const createPodcast = europeWest1.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }
  const {lessonId, lessonContent} = data;
  if (!lessonId || !lessonContent) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing lessonId or lessonContent.",
    );
  }
  try {
    const podcast = await createPodcastForLesson(lessonContent);
    await db.collection("lessons").doc(lessonId).update({
      podcast: podcast,
    });
    return {success: true, podcast: podcast};
  } catch (error) {
    console.error("Error in createPodcast function:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to create podcast.",
    );
  }
});

/**
 * Creates a presentation for a given lesson content.
 */
export const createPresentation = europeWest1.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "The function must be called while authenticated.",
      );
    }
    const {lessonId, lessonContent} = data;
    if (!lessonId || !lessonContent) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing lessonId or lessonContent.",
      );
    }
    try {
      const presentation = await createPresentationForLesson(lessonContent);
      await db.collection("lessons").doc(lessonId).update({
        presentation: presentation,
      });
      return {success: true, presentation: presentation};
    } catch (error) {
      console.error("Error in createPresentation function:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to create presentation.",
      );
    }
  },
);

/**
 * Sends a message from the professor to a student and updates conversation.
 */
export const sendMessageToStudent = europeWest1.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated to send messages.",
      );
    }

    const {studentId, text} = data;
    if (!studentId || !text) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "studentId and text are required.",
      );
    }

    try {
      const studentDoc = await db.collection("students").doc(studentId).get();
      if (!studentDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Student not found");
      }
      const studentData = studentDoc.data();
      const studentName = studentData?.name || "Unknown Student";

      const message = {
        text: text,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        senderId: "professor",
      };

      const conversationRef = db.collection("conversations").doc(studentId);
      const messagesRef = conversationRef.collection("messages");

      await messagesRef.add(message);

      await conversationRef.set({
        studentId: studentId,
        studentName: studentName,
        lastMessage: text,
        lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        professorHasUnread: false, // Professor just sent a message
        studentHasUnread: true, // Mark as unread for the student
      }, {merge: true});

      return {success: true};
    } catch (error) {
      console.error("Error sending message to student:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to send message.",
      );
    }
  },
);
