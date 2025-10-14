// functions/src/index.ts
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import {
    generateJsonFromPrompt,
    generateTextFromPrompt,
    generateTextFromDocuments,
    generateJsonFromDocuments,
} from "./gemini-api";

initializeApp();

// --- ZÁKLADNÉ AI FUNKCIE ---

// Získanie odpovede od AI asistenta v študentskom chate
export const getAiAssistantResponse = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Uživatel není přihlášen.");
    }
    const studentId = request.data.studentId as string;
    const conversationHistory = request.data.conversationHistory as any[];

    if (!studentId || !conversationHistory) {
        throw new HttpsError("invalid-argument", "Chybí ID studenta nebo historie konverzace.");
    }

    const db = getFirestore();
    const studentDoc = await db.collection("students").doc(studentId).get();
    if (!studentDoc.exists) {
        throw new HttpsError("not-found", "Profil studenta nebyl nalezen.");
    }
    const studentName = studentDoc.data()?.name || "Student";

    const prompt = `Jsi AI Sensei, přátelský a nápomocný AI asistent pro studenta jménem ${studentName}.
    Toto je vaše předchozí konverzace:
    ${conversationHistory.map((msg: any) => `${msg.role}: ${msg.parts[0].text}`).join("\n")}
    Odpověz na poslední zprávu a pokračuj v konverzaci. Buď stručný a nápomocný.`;

    const responseText = await generateTextFromPrompt(prompt);
    return { reply: responseText };
});


// --- FUNKCIE PRE TVORBU OBSAHU LEKCIÍ ---

// Vytvorenie kvízu pre lekciu
export const createQuizForLesson = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Musíte být přihlášeni.");
    const { lessonId, lessonContent } = request.data;
    if (!lessonId || !lessonContent) throw new HttpsError("invalid-argument", "Chybí ID lekce nebo obsah.");

    logger.info(`Vytváření kvízu pro lekci ${lessonId}...`);
    const prompt = `Vytvoř krátký kvíz s 5 otázkami a 4 možnostmi (A, B, C, D) na základě následujícího textu. U každé otázky uveď správnou odpověď. Text: ${lessonContent}`;
    const quizJson = await generateJsonFromPrompt(prompt);

    const db = getFirestore();
    await db.collection("lessons").doc(lessonId).collection("activities").doc("quiz").set({
        type: "quiz",
        data: quizJson,
        createdAt: new Date(),
    });

    return { success: true, message: "Kvíz úspěšně vytvořen." };
});

// Vytvorenie testu pre lekciu
export const createTestForLesson = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Musíte být přihlášeni.");
    const { lessonId, lessonContent } = request.data;
    if (!lessonId || !lessonContent) throw new HttpsError("invalid-argument", "Chybí ID lekce nebo obsah.");
    
    logger.info(`Vytváření testu pro lekci ${lessonId}...`);
    const prompt = `Vytvoř detailní test s 10 otázkami na základě textu. Mixuj otázky s výběrem z více možností a otázky s otevřenou odpovědí. Uveď i správné odpovědi. Text: ${lessonContent}`;
    const testJson = await generateJsonFromPrompt(prompt);

    const db = getFirestore();
    await db.collection("lessons").doc(lessonId).collection("activities").doc("test").set({
        type: "test",
        data: testJson,
        createdAt: new Date(),
    });

    return { success: true, message: "Test úspěšně vytvořen." };
});

// Vytvorenie podcastu pre lekciu
export const createPodcastForLesson = onCall(async (request) => {
     if (!request.auth) throw new HttpsError("unauthenticated", "Musíte být přihlášeni.");
    const { lessonId, lessonContent } = request.data;
    if (!lessonId || !lessonContent) throw new HttpsError("invalid-argument", "Chybí ID lekce nebo obsah.");

    logger.info(`Vytváření podcastu pro lekci ${lessonId}...`);
    const prompt = `Vytvoř scénář pro 3-minutový podcast, který shrnuje klíčové body z následujícího textu. Text: ${lessonContent}`;
    const podcastScript = await generateTextFromPrompt(prompt);

    const db = getFirestore();
    await db.collection("lessons").doc(lessonId).collection("activities").doc("podcast").set({
        type: "podcast",
        script: podcastScript,
        createdAt: new Date(),
    });
    
    return { success: true, message: "Podcast úspěšně vytvořen." };
});

// Vytvorenie prezentácie pre lekciu
export const createPresentationForLesson = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Musíte být přihlášeni.");
    const { lessonId, lessonContent } = request.data;
    if (!lessonId || !lessonContent) throw new HttpsError("invalid-argument", "Chybí ID lekce nebo obsah.");
    
    logger.info(`Vytváření prezentace pro lekci ${lessonId}...`);
    const prompt = `Vytvoř obsah pro prezentaci s 5 slidy na základě textu. Pro každý slide uveď nadpis a 3-5 odrážek. Text: ${lessonContent}`;
    const presentationJson = await generateJsonFromPrompt(prompt);
    
    const db = getFirestore();
    await db.collection("lessons").doc(lessonId).collection("activities").doc("presentation").set({
        type: "presentation",
        data: presentationJson,
        createdAt: new Date(),
    });

    return { success: true, message: "Prezentace úspěšně vytvořena." };
});

// Generovanie obsahu lekcie na základe promptu
export const generateContentForLesson = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Musíte být přihlášeni.");
    const { lessonId, prompt } = request.data;
    if (!lessonId || !prompt) throw new HttpsError("invalid-argument", "Chybí ID lekce nebo prompt.");

    logger.info(`Generování obsahu pro lekci ${lessonId} s promptem: ${prompt}`);
    const generatedContent = await generateTextFromPrompt(prompt);

    const db = getFirestore();
    await db.collection("lessons").doc(lessonId).update({
        content: generatedContent,
    });

    return { success: true, content: generatedContent };
});

// --- NOVÉ FUNKCIE PRE PRÁCU S DOKUMENTMI ---

// Generovanie textu z nahraných dokumentov
export const generateTextFromCourseDocuments = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Musíte být přihlášeni.");
    const { filePaths, prompt } = request.data;
    if (!filePaths || !prompt || !Array.isArray(filePaths) || filePaths.length === 0) {
        throw new HttpsError("invalid-argument", "Chybí cesty k souborům nebo prompt.");
    }
    
    logger.info(`Generování textu z dokumentů: ${filePaths.join(", ")}`);
    const responseText = await generateTextFromDocuments(filePaths, prompt);
    return { success: true, response: responseText };
});

// Generovanie JSON z nahraných dokumentov
export const generateJsonFromCourseDocuments = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Musíte být přihlášeni.");
    const { filePaths, prompt } = request.data;
    if (!filePaths || !prompt || !Array.isArray(filePaths) || filePaths.length === 0) {
        throw new HttpsError("invalid-argument", "Chybí cesty k souborům nebo prompt.");
    }
    
    logger.info(`Generování JSON z dokumentů: ${filePaths.join(", ")}`);
    const responseJson = await generateJsonFromDocuments(filePaths, prompt);
    return { success: true, response: responseJson };
});
