import * as functions from "firebase-functions";
import admin from "firebase-admin";
import {
  generateJsonFromPrompt,
  generateTextFromPrompt
} from "./gemini-api.js";

// Nastavenie regiónu pre všetky funkcie
const europeWest1 = functions.region("europe-west1");

// OPRAVA: Odstránená problematická podmienka. Priama inicializácia je v poriadku.
admin.initializeApp();

const db = admin.firestore();

// --- Funkcie volané z frontendu ---

/**
 * Generuje obsah pre lekciu na základe textového promptu.
 */
export const generateContent = europeWest1.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Musíte byť prihlásený.");
    }
    const { lessonId, prompt } = data;
    if (!lessonId || !prompt) {
      throw new functions.https.HttpsError("invalid-argument", "Chýba lessonId alebo prompt.");
    }
    try {
      const generatedContent = await generateTextFromPrompt(prompt);
      await db.collection("lessons").doc(lessonId).update({
        content: generatedContent,
      });
      return { success: true, content: generatedContent };
    } catch (error) {
      console.error("Chyba vo funkcii generateContent:", error);
      throw new functions.https.HttpsError("internal", "Nepodarilo sa vygenerovať obsah.");
    }
  },
);

/**
 * Vytvorí kvíz pre danú lekciu.
 */
export const createQuiz = europeWest1.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Musíte byť prihlásený.");
  }
  const {lessonId, lessonContent} = data;
  if (!lessonId || !lessonContent) {
    throw new functions.https.HttpsError("invalid-argument", "Chýba lessonId alebo lessonContent.");
  }
  try {
    const prompt = `Na základe nasledujúceho obsahu lekcie vytvor JSON objekt pre kvíz s 5 otázkami. Každá otázka by mala mať 4 možnosti a správnu odpoveď. Štruktúra JSON by mala byť pole objektov, kde každý objekt má "question", "options" (pole reťazcov) a "correctAnswer" (reťazec). Obsah lekcie: "${lessonContent}"`;
    const quiz = await generateJsonFromPrompt(prompt);
    await db.collection("lessons").doc(lessonId).update({ quiz });
    return {success: true, quiz};
  } catch (error) {
    console.error("Chyba vo funkcii createQuiz:", error);
    throw new functions.https.HttpsError("internal", "Nepodarilo sa vytvoriť kvíz.");
  }
});

/**
 * Vytvorí test pre danú lekciu.
 */
export const createTest = europeWest1.https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Musíte byť prihlásený.");
    }
    const {lessonId, lessonContent} = data;
    if (!lessonId || !lessonContent) {
        throw new functions.https.HttpsError("invalid-argument", "Chýba lessonId alebo lessonContent.");
    }
    try {
        const prompt = `Na základe nasledujúceho obsahu lekcie vytvor JSON objekt pre test. Test by mal obsahovať 5 otázok s výberom z viacerých možností (každá so 4 možnosťami) a 2 otvorené otázky. Štruktúra JSON by mala byť objekt s dvoma kľúčmi: "multipleChoice" (pole objektov otázok ako v kvíze) a "openEnded" (pole reťazcov predstavujúcich otázky). Obsah lekcie: "${lessonContent}"`;
        const test = await generateJsonFromPrompt(prompt);
        await db.collection("lessons").doc(lessonId).update({ test });
        return { success: true, test };
    } catch (error) {
        console.error("Chyba vo funkcii createTest:", error);
        throw new functions.https.HttpsError("internal", "Nepodarilo sa vytvoriť test.");
    }
});

/**
 * Vytvorí podcast (textový skript) pre danú lekciu.
 */
export const createPodcast = europeWest1.https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Musíte byť prihlásený.");
    }
    const {lessonId, lessonContent} = data;
    if (!lessonId || !lessonContent) {
        throw new functions.https.HttpsError("invalid-argument", "Chýba lessonId alebo lessonContent.");
    }
    try {
        const prompt = `Na základe nasledujúceho obsahu lekcie napíš scenár pre 3-minútový vzdelávací podcast. Scenár by mal byť pútavý a ľahko zrozumiteľný pre študentov. Formátuj ho ako jednoduchý text, v prípade potreby s jasnými označeniami rečníka (napr. MODERÁTOR:). Obsah lekcie: "${lessonContent}"`;
        const podcast = await generateTextFromPrompt(prompt);
        await db.collection("lessons").doc(lessonId).update({ podcast });
        return { success: true, podcast };
    } catch (error) {
        console.error("Chyba vo funkcii createPodcast:", error);
        throw new functions.https.HttpsError("internal", "Nepodarilo sa vytvoriť podcast.");
    }
});

/**
 * Vytvorí prezentáciu (JSON štruktúru) pre danú lekciu.
 */
export const createPresentation = europeWest1.https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Musíte byť prihlásený.");
    }
    const {lessonId, lessonContent} = data;
    if (!lessonId || !lessonContent) {
        throw new functions.https.HttpsError("invalid-argument", "Chýba lessonId alebo lessonContent.");
    }
    try {
        const prompt = `Na základe nasledujúceho obsahu lekcie vytvor JSON objekt predstavujúci prezentáciu s 5 snímkami. Každá snímka by mala mať "title" (reťazec) a "content" (pole reťazcov pre odrážky). Obsah lekcie: "${lessonContent}"`;
        const presentation = await generateJsonFromPrompt(prompt);
        await db.collection("lessons").doc(lessonId).update({ presentation });
        return { success: true, presentation };
    } catch (error) {
        console.error("Chyba vo funkcii createPresentation:", error);
        throw new functions.https.HttpsError("internal", "Nepodarilo sa vytvoriť prezentáciu.");
    }
});


/**
 * Pošle správu od profesora študentovi a aktualizuje konverzáciu.
 */
export const sendMessageToStudent = europeWest1.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Pre odoslanie správy musíte byť prihlásený.",
      );
    }

    const {studentId, text} = data;
    if (!studentId || !text) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "studentId a text sú povinné.",
      );
    }

    try {
      const studentDoc = await db.collection("students").doc(studentId).get();
      if (!studentDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Študent sa nenašiel.");
      }
      const studentData = studentDoc.data();
      const studentName = studentData?.name || "Neznámy študent";

      const message = {
        text: text,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        senderId: "professor",
      };

      const conversationRef = db.collection("conversations").doc(studentId);
      await conversationRef.collection("messages").add(message);
      await conversationRef.set({
        studentId: studentId,
        studentName: studentName,
        lastMessage: text,
        lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        professorHasUnread: false,
        studentHasUnread: true,
      }, {merge: true});

      return {success: true};
    } catch (error) {
      console.error("Chyba pri odosielaní správy študentovi:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Nepodarilo sa odoslať správu.",
      );
    }
  },
);
