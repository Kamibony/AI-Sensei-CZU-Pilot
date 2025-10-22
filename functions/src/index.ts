import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { getStorage } from "firebase-admin/storage";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { generateTextFromPrompt } from "./gemini-api.js"; // <-- OPRAVENÉ

// --- INICIALIZÁCIA ---
admin.initializeApp();

// Definícia konštánt pre databázu a storage
const db = getFirestore();
const storage = getStorage();

// --- POMOCNÁ FUNKCIA PRE MULTI-TENANCY ---

/**
 * Získa professorId pre daného študenta z jeho dokumentu.
 * @param {string} studentUid UID študenta.
 * @return {Promise<string | null>} ID profesora alebo null, ak sa nenájde.
 */
async function getStudentProfessorId(studentUid: string): Promise<string | null> {
  try {
    const studentDocRef = db.collection("students").doc(studentUid);
    const studentDoc = await studentDocRef.get();
    if (!studentDoc.exists) {
      logger.warn(`Student document not found: ${studentUid}`);
      return null;
    }
    return studentDoc.data()?.professorId || null;
  } catch (error) {
    logger.error(`Error fetching student professorId for ${studentUid}`, error);
    return null;
  }
}

// --- NOVÉ FUNKCIE PRE MULTI-TENANCY (PODĽA REPORTU) ---

/**
 * Spracuje registráciu nového používateľa, overí pozývací kód
 * a priradí rolu (custom claim) a vytvorí záznam v DB.
 * Volá sa z frontendu (auth.js) hneď po vytvorení Auth účtu.
 */
export const processRegistration = functions.https.onCall(
  async (data, context) => {
    const { uid, email, inviteCode } = data;

    if (!uid || !email) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing UID or email."
      );
    }

    try {
      // Ak je zadaný pozývací kód
      if (inviteCode) {
        const codeRef = db.collection("invite_codes").doc(inviteCode);
        const codeDoc = await codeRef.get();

        // Overenie platnosti kódu a roly
        if (codeDoc.exists && codeDoc.data()?.role === "professor") {
          // 1. Nastaviť Custom Claim
          await admin.auth().setCustomUserClaims(uid, { role: "professor" });

          // 2. Vytvoriť záznam pre profesora
          await db
            .collection("professors")
            .doc(uid)
            .set({
              email: email,
              createdAt: FieldValue.serverTimestamp(),
              // Tu môžete pridať ďalšie počiatočné nastavenia pre profesora
            });

          // 3. Zmazať použitý kód (aby bol jednorazový)
          await codeRef.delete();

          logger.info(`Professor account created for ${email} using code ${inviteCode}`);
          return { status: "success", role: "professor" };
        } else {
          // Kód je neplatný alebo nie je pre profesora
          logger.warn(`Invalid or non-professor invite code used by ${email}: ${inviteCode}`);
          // Frontend (auth.js) by mal na základe tejto chyby zmazať Auth účet
          throw new functions.https.HttpsError(
            "not-found",
            "Invalid invite code."
          );
        }
      } else {
        // --- Registrácia študenta (bez kódu) ---

        // 1. Nastaviť Custom Claim
        await admin.auth().setCustomUserClaims(uid, { role: "student" });

        // 2. Vytvoriť záznam pre študenta
        await db
          .collection("students")
          .doc(uid)
          .set({
            email: email,
            createdAt: FieldValue.serverTimestamp(),
            professorId: null, // Študent zatiaľ nie je priradený
          });
        
        logger.info(`Student account created for ${email}`);
        return { status: "success", role: "student" };
      }
    } catch (error) {
      logger.error(`Registration processing failed for ${email}`, error);
      // Poslať chybu späť na frontend
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "An error occurred during registration processing."
      );
    }
  }
);

/**
 * Vytvorí nový pozývací kód pre profesora.
 * Môže volať iba Super Admin (profesor@profesor.cz).
 */
export const createInviteCode = functions.https.onCall(
  async (data, context) => {
    // 1. Overenie autentifikácie
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be logged in."
      );
    }

    // 2. Overenie Super Admin roly
    const superAdminEmail = "profesor@profesor.cz"; // Podľa reportu
    if (context.auth.token.email !== superAdminEmail) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only the Super Admin can create invite codes."
      );
    }

    const { code } = data;
    if (!code || typeof code !== "string" || code.length < 6) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Invite code must be a string of at least 6 characters."
      );
    }

    try {
      const codeRef = db.collection("invite_codes").doc(code);
      await codeRef.set({
        role: "professor",
        createdAt: FieldValue.serverTimestamp(),
        createdBy: context.auth.token.email,
      });

      logger.info(`Invite code ${code} created by ${context.auth.token.email}`);
      return { status: "success", code: code };
    } catch (error) {
      logger.error(`Failed to create invite code ${code}`, error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to write invite code to database."
      );
    }
  }
);

// --- UPRAVENÉ EXISTUJÚCE FUNKCIE ---

/**
 * Generuje text lekcie pomocou AI (Refaktorované pre Multi-Tenancy).
 * Volá profesor.
 */
export const generateContent = functions.https.onCall(async (data, context) => {
  // 1. Overenie autentifikácie a roly
  if (!context.auth || context.auth.token.role !== "professor") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only professors can generate lesson content."
    );
  }
  const professorId = context.auth.uid; // Profesor je prihlásený používateľ

  const { prompt, lessonId } = data;
  if (!prompt || !lessonId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing prompt or lessonId."
    );
  }

  try {
    const geminiResponse = await generateTextFromPrompt(prompt); // <-- OPRAVENÉ
    // Tu by podľa reportu mala byť konverzia na HTML pomocou 'marked',
    // ale chýba v package.json. Nechávam pôvodnú logiku (ukladá text).
    // Ak 'marked' pridáte, odkomentujte import a použite ho tu.
    // const htmlContent = marked(geminiResponse);
    const lessonData = {
      text: geminiResponse, // Alebo 'text: htmlContent', ak použijete marked
      // Ďalšie polia...
    };

    // 2. Úprava cesty: Ukladá do subkolekcie profesora
    const lessonRef = db
      .collection("professors")
      .doc(professorId)
      .collection("lessons")
      .doc(lessonId);

    await lessonRef.update(lessonData);
    logger.info(`Content generated for lesson ${lessonId} by professor ${professorId}`);
    return { status: "success", content: lessonData };
  } catch (error) {
    logger.error("Error generating lesson content:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to generate lesson content."
    );
  }
});

/**
 * Získa odpoveď od AI asistenta (Refaktorované pre Multi-Tenancy).
 * Volá študent.
 */
export const getAiAssistantResponse = functions.https.onCall(
  async (data, context) => {
    // 1. Overenie autentifikácie a roly
    if (!context.auth || context.auth.token.role !== "student") {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only students can use the AI assistant."
      );
    }
    const studentId = context.auth.uid; // Študent je prihlásený používateľ

    const { chatHistory } = data; // `studentId` z payloadu sa ignoruje, použije sa UID volajúceho
    if (!chatHistory || !Array.isArray(chatHistory)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing or invalid chatHistory."
      );
    }
    
    // 2. Získanie ID profesora pre študenta
    const professorId = await getStudentProfessorId(studentId);
    if (!professorId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Student is not assigned to any professor."
      );
    }

    // 3. Úprava cesty: Referencia na kolekciu správ daného študenta u daného profesora
    const messagesRef = db
      .collection("professors")
      .doc(professorId)
      .collection("studentInteractions")
      .doc(studentId)
      .collection("messages");

    try {
      // Uloženie správy od používateľa (posledná v histórii)
      const userMessage = chatHistory[chatHistory.length - 1];
      await messagesRef.add({
        text: userMessage.content, // Ukladáme ako 'text'
        role: userMessage.role,    // 'user'
        type: 'ai', // Keďže je to v AI chate
        timestamp: FieldValue.serverTimestamp(),
      });

      // Získanie odpovede od Gemini (existujúca logika)
      const systemPrompt = "Si AI Sensei, ..."; // (Ponechaný pôvodný prompt)
      const fullPrompt = `${systemPrompt}\n\n${chatHistory
        .map((msg: { role: string; content: string }) => `${msg.role}: ${msg.content}`)
        .join("\n")}\nAI:`;
      
      const aiResponseContent = await generateTextFromPrompt(fullPrompt); // <-- OPRAVENÉ

      // Uloženie odpovede od AI
      const botResponse = {
        text: aiResponseContent, // Ukladáme ako 'text'
        role: "ai",
        type: 'ai',
        timestamp: FieldValue.serverTimestamp(),
      };
      await messagesRef.add(botResponse);

      logger.info(`AI response sent to student ${studentId} (professor ${professorId})`);
      return { status: "success", response: aiResponseContent };
    } catch (error) {
      logger.error("Error getting AI assistant response:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to get AI assistant response."
      );
    }
  }
);

/**
 * Pošle správu študentovi (Refaktorované pre Multi-Tenancy).
 * Volá profesor.
 */
export const sendMessageToStudent = functions.https.onCall(
  async (data, context) => {
    // 1. Overenie autentifikácie a roly
    if (!context.auth || context.auth.token.role !== "professor") {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only professors can send messages to students."
      );
    }
    const professorId = context.auth.uid; // Profesor je prihlásený používateľ

    const { studentId, messageContent, type } = data; // Pridaný 'type'
    if (!studentId || !messageContent || !type) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing studentId, messageContent, or type (ai/professor)."
      );
    }

    try {
      const messageData = {
        text: messageContent, // Ukladáme ako 'text'
        role: "professor",
        type: type, // 'ai' alebo 'professor'
        timestamp: FieldValue.serverTimestamp(),
      };

      // 2. Úprava cesty: Ukladá do subkolekcie profesora
      const messagesRef = db
        .collection("professors")
        .doc(professorId)
        .collection("studentInteractions")
        .doc(studentId)
        .collection("messages");
      
      await messagesRef.add(messageData);

      logger.info(`Message sent to student ${studentId} by professor ${professorId}`);
      return { status: "success", message: messageData };
    } catch (error) {
      logger.error("Error sending message to student:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to send message."
      );
    }
  }
);

/**
 * Získa analytické dáta (Refaktorované pre Multi-Tenancy).
 * Volá profesor.
 */
export const getGlobalAnalytics = functions.https.onCall(
  async (data, context) => {
    // 1. Overenie autentifikácie a roly
    if (!context.auth || context.auth.token.role !== "professor") {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only professors can view analytics."
      );
    }
    const professorId = context.auth.uid;

    try {
      // 2. Úprava ciest: Dopyty smerujú na dáta priradené profesorovi
      const studentsSnapshot = await db
        .collection("students")
        .where("professorId", "==", professorId)
        .get();
      
      const lessonsSnapshot = await db
        .collection("professors")
        .doc(professorId)
        .collection("lessons")
        .get();
      
      const mediaSnapshot = await db
        .collection("professors")
        .doc(professorId)
        .collection("media")
        .get();

      // (Tu by mali nasledovať dopyty aj na quizSubmissions, studentInteractions atď.)

      const analytics = {
        studentCount: studentsSnapshot.size,
        lessonCount: lessonsSnapshot.size,
        mediaCount: mediaSnapshot.size,
        // Ďalšie metriky...
      };

      logger.info(`Analytics retrieved for professor ${professorId}`);
      return { status: "success", analytics };
    } catch (error) {
      logger.error("Error getting global analytics:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to get analytics."
      );
    }
  }
);

/**
 * Uloží výsledky kvízu (Refaktorované pre Multi-Tenancy).
 * Volá študent.
 */
export const submitQuizResults = functions.https.onCall(
  async (data, context) => {
    // 1. Overenie autentifikácie a roly
    if (!context.auth || context.auth.token.role !== "student") {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only students can submit quiz results."
      );
    }
    const studentId = context.auth.uid;

    const { lessonId, quizTitle, score, totalQuestions, answers } = data; // Upravené polia
    if (
      !lessonId ||
      !quizTitle ||
      score === undefined ||
      totalQuestions === undefined ||
      !answers
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required quiz data (lessonId, quizTitle, score, totalQuestions, answers)."
      );
    }

    // 2. Získanie ID profesora pre študenta
    const professorId = await getStudentProfessorId(studentId);
    if (!professorId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Student is not assigned to any professor."
      );
    }

    try {
      const submissionData = {
        studentId: studentId,
        lessonId: lessonId,
        quizTitle: quizTitle, // Pridané
        score: score * 100, // Uloženie 0-100 (podľa student-profile-view)
        totalQuestions: totalQuestions, // Pridané
        answers: answers,
        submittedAt: FieldValue.serverTimestamp(),
      };

      // 3. Úprava cesty: Ukladá do subkolekcie profesora
      await db
        .collection("professors")
        .doc(professorId)
        .collection("quizSubmissions")
        .add(submissionData);

      logger.info(`Quiz results submitted for student ${studentId} (professor ${professorId})`);
      return { status: "success" };
    } catch (error) {
      logger.error("Error submitting quiz results:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to submit quiz results."
      );
    }
  }
);

/**
 * Uloží výsledky testu (Refaktorované pre Multi-Tenancy).
 * Volá študent.
 */
export const submitTestResults = functions.https.onCall(
  async (data, context) => {
    // 1. Overenie autentifikácie a roly
    if (!context.auth || context.auth.token.role !== "student") {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only students can submit test results."
      );
    }
    const studentId = context.auth.uid;

    const { lessonId, testTitle, score, totalQuestions, answers } = data;
    if (
      !lessonId ||
      !testTitle ||
      score === undefined ||
      totalQuestions === undefined ||
      !answers
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required test data."
      );
    }

    // 2. Získanie ID profesora pre študenta
    const professorId = await getStudentProfessorId(studentId);
    if (!professorId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Student is not assigned to any professor."
      );
    }

    try {
      const submissionData = {
        studentId: studentId,
        lessonId: lessonId,
        testTitle: testTitle,
        score: score * 100, // Uloženie 0-100
        totalQuestions: totalQuestions,
        answers: answers,
        submittedAt: FieldValue.serverTimestamp(),
      };

      // 3. Úprava cesty: Ukladá do subkolekcie profesora
      await db
        .collection("professors")
        .doc(professorId)
        .collection("testSubmissions")
        .add(submissionData);

      logger.info(`Test results submitted for student ${studentId} (professor ${professorId})`);
      return { status: "success" };
    } catch (error) {
      logger.error("Error submitting test results:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to submit test results."
      );
    }
  }
);


/**
 * Vytvorí podpísanú URL pre nahrávanie súborov (Refaktorované pre Multi-Tenancy).
 * Volá profesor.
 */
export const uploadFile = functions.https.onCall(async (data, context) => {
  // 1. Overenie autentifikácie a roly
  if (!context.auth || context.auth.token.role !== "professor") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only professors can upload files."
    );
  }
  const professorId = context.auth.uid;

  const { fileName, contentType, mediaType } = data;
  if (!fileName || !contentType || !mediaType) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing fileName, contentType, or mediaType."
    );
  }

  try {
    const bucket = storage.bucket();
    // 2. Úprava cesty: Súbor bude v priečinku profesora
    const filePath = `${professorId}/media/${fileName}`;
    const file = bucket.file(filePath);

    const options = {
      version: "v4" as const,
      action: "write" as const,
      expires: Date.now() + 15 * 60 * 1000, // 15 minút
      contentType: contentType,
    };

    const [url] = await file.getSignedUrl(options);

    // 3. Úprava cesty: Záznam o médiu sa uloží do subkolekcie profesora
    const mediaDocRef = await db
      .collection("professors")
      .doc(professorId)
      .collection("media")
      .add({
        fileName: fileName,
        filePath: filePath, // Uložíme aj cestu pre budúce mazanie
        storagePath: `gs://${bucket.name}/${filePath}`,
        type: mediaType,
        uploadedAt: FieldValue.serverTimestamp(),
        // URL sa zvyčajne neukladá, keďže je dočasná
      });

    logger.info(`Signed URL created for ${filePath} by professor ${professorId}`);
    return {
      status: "success",
      signedUrl: url,
      documentId: mediaDocRef.id, // ID pre prípadné premenovanie na frontende
    };
  } catch (error) {
    logger.error("Error creating signed URL:", error);
    throw new functions.https.HttpsError("internal", "Failed to create signed URL.");
  }
});

// --- UPRAVENÉ AUTH TRIGGERS ---

/**
 * Spustí sa pri vytvorení nového Firebase Auth používateľa.
 * Pôvodná logika je nahradená funkciou `processRegistration`, ktorú volá frontend.
 * Ponechanie logiky tu by spôsobilo duplicitné zápisy.
 */
export const onUserCreate = functions.auth.user().onCreate(async (user) => {
  logger.info(`Auth user created: ${user.email} (${user.uid})`);
  // Pôvodná logika (vytvorenie /students dokumentu) je teraz
  // spracovaná vo funkcii `processRegistration`, aby sa mohli
  // spracovať pozývacie kódy a správne priradiť roly.
  return null;
});

/**
 * Spustí sa pri zmazaní Firebase Auth používateľa (Refaktorované pre Multi-Tenancy).
 * Zmaže zodpovedajúci dokument v /students ALEBO /professors.
 */
export const onUserDelete = functions.auth.user().onDelete(async (user) => {
  logger.info(`Auth user deleted: ${user.email} (${user.uid})`);
  const uid = user.uid;

  try {
    // Skús zmazať zo študentov
    const studentRef = db.collection("students").doc(uid);
    const studentDoc = await studentRef.get();
    
    if (studentDoc.exists) {
      await studentRef.delete();
      logger.info(`Deleted student document for ${uid}`);
      
      // TODO (Rozšírenie): Mali by sa zmazať aj subkolekcie študenta, 
      // napr. /professors/{profId}/studentInteractions/{uid} atď.
      // To si vyžaduje rekurzívne mazanie.

      return null;
    }

    // Ak nebol študent, skús zmazať z profesorov
    const professorRef = db.collection("professors").doc(uid);
    const professorDoc = await professorRef.get();

    if (professorDoc.exists) {
      await professorRef.delete();
      logger.info(`Deleted professor document for ${uid}`);

      // TODO (Rozšírenie): Zmazať všetky dáta profesora (subkolekcie)
      // a jeho súbory v Storage (priečinok `{uid}/media/`).
      // Toto je komplexná operácia (rekurzívne mazanie).
      
      return null;
    }

    logger.warn(`No matching Firestore document found to delete for user ${uid}`);
    return null;

  } catch (error) {
    logger.error(`Error deleting user document for ${uid}:`, error);
    return null;
  }
});
