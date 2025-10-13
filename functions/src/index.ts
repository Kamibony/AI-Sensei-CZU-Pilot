import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as GeminiAPI from "./gemini-api.js";
import cors from "cors";
import fetch from "node-fetch";

initializeApp();
const db = getFirestore();
const corsHandler = cors({ origin: true });

async function sendTelegramMessage(chatId: number, text: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
        logger.error("TELEGRAM_BOT_TOKEN is not set.");
        return;
    }
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "Markdown" }),
        });
    } catch (error) {
        logger.error("Error sending Telegram message:", error);
    }
}

// ZJEDNOTENÁ FUNKCIA PRE VŠETKY AI OPERÁCIE
export const generateContent = onCall({ region: "europe-west1" }, async (request) => {
    const { contentType, promptData, filePaths } = request.data;
    if (!contentType || !promptData) {
        throw new HttpsError("invalid-argument", "Missing contentType or promptData.");
    }
    try {
        let finalPrompt = promptData.userPrompt;
        const isJson = ['presentation', 'quiz', 'test', 'post'].includes(contentType);
        if (isJson) {
            switch(contentType) {
                case 'presentation':
                    finalPrompt = `Vytvoř prezentaci na téma "${promptData.userPrompt}" s přesně ${promptData.slideCount || 5} slidy. Odpověď musí být JSON objekt s klíčem 'slides', který obsahuje pole objektů, kde každý objekt má klíče 'title' (string) a 'points' (pole stringů).`;
                    break;
                case 'quiz':
                    finalPrompt = `Vytvoř kvíz na základě zadání: "${promptData.userPrompt}". Odpověď musí být JSON objekt s klíčem 'questions', který obsahuje pole objektů, kde každý objekt má klíče 'question_text' (string), 'options' (pole stringů) a 'correct_option_index' (number).`;
                    break;
                case 'test':
                    finalPrompt = `Vytvoř test na téma "${promptData.userPrompt}" s ${promptData.questionCount || 5} otázkami. Obtížnost: ${promptData.difficulty || 'Střední'}. Typy otázek: ${promptData.questionTypes || 'Mix'}. Odpověď musí být JSON objekt s klíčem 'questions', který obsahuje pole objektů, kde každý objekt má klíče 'question_text' (string), 'type' (string), 'options' (pole stringů) a 'correct_option_index' (number).`;
                    break;
                case 'post':
                     finalPrompt = `Vytvoř sérii ${promptData.episodeCount || 3} podcast epizod na téma "${promptData.userPrompt}". Odpověď musí být JSON objekt s klíčem 'episodes', který obsahuje pole objektů, kde každý objekt má klíče 'title' (string) a 'script' (string).`;
                     break;
            }
        }
        if (filePaths && filePaths.length > 0) {
            return isJson 
                ? await GeminiAPI.generateJsonFromDocuments(filePaths, finalPrompt)
                : { text: await GeminiAPI.generateTextFromDocuments(filePaths, finalPrompt) };
        } else {
            return isJson
                ? await GeminiAPI.generateJsonFromPrompt(finalPrompt)
                : { text: await GeminiAPI.generateTextFromPrompt(finalPrompt) };
        }
    } catch (error) {
        logger.error(`Error in generateContent for type ${contentType}:`, error);
        let message = "An unknown error occurred.";
        if (error instanceof Error) { message = error.message; }
        throw new HttpsError("internal", `Failed to generate content: ${message}`);
    }
});

export const getAiAssistantResponse = onCall({ region: "europe-west1" }, async (request) => {
    const { lessonId, userQuestion } = request.data;
    if (!lessonId || !userQuestion) {
        throw new HttpsError("invalid-argument", "Missing lessonId or userQuestion");
    }
    try {
        const lessonRef = db.collection("lessons").doc(lessonId);
        const lessonDoc = await lessonRef.get();
        if (!lessonDoc.exists) {
            throw new HttpsError("not-found", "Lesson not found");
        }
        const lessonData = lessonDoc.data();
        const prompt = `Based on the lesson "${lessonData?.title}", answer the student's question: "${userQuestion}"`;
        const answer = await GeminiAPI.generateTextFromPrompt(prompt);
        return { answer };
    } catch (error) {
        logger.error("Error in getAiAssistantResponse:", error);
        let message = "Failed to get AI response";
        if (error instanceof Error) { message = error.message; }
        throw new HttpsError("internal", message);
    }
});

export const sendMessageFromStudent = onCall({ region: "europe-west1" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Musíte být přihlášen.");
    }
    const { text } = request.data;
    const studentId = request.auth.uid;

    if (!text) {
        throw new HttpsError("invalid-argument", "Zpráva nemůže být prázdná.");
    }

    try {
        const studentDoc = await db.collection("students").doc(studentId).get();
        if (!studentDoc.exists) {
            throw new HttpsError("not-found", "Profil studenta nebyl nalezen.");
        }
        const studentName = studentDoc.data()?.name || "Neznámý student";
        const conversationRef = db.collection("conversations").doc(studentId);
        await conversationRef.set({
            studentId: studentId,
            studentName: studentName,
            lastMessage: text,
            lastMessageTimestamp: FieldValue.serverTimestamp(),
            professorHasUnread: true,
        }, { merge: true });
        await conversationRef.collection("messages").add({
            senderId: studentId,
            text: text,
            timestamp: FieldValue.serverTimestamp(),
        });
        return { success: true };
    } catch (error) {
        logger.error("Error in sendMessageFromStudent:", error);
        throw new HttpsError("internal", "Nepodařilo se odeslat zprávu.");
    }
});

export const sendMessageToStudent = onCall({ region: "europe-west1", secrets: ["TELEGRAM_BOT_TOKEN"] }, async (request) => {
    const { studentId, text } = request.data;
    if (!studentId || !text) {
        throw new HttpsError("invalid-argument", "Chybí ID studenta nebo text zprávy.");
    }
    try {
        const conversationRef = db.collection("conversations").doc(studentId);
        await conversationRef.collection("messages").add({
            senderId: "professor",
            text: text,
            timestamp: FieldValue.serverTimestamp(),
        });
        await conversationRef.update({
            lastMessage: text,
            lastMessageTimestamp: FieldValue.serverTimestamp(),
            professorHasUnread: false,
        });
        const studentDoc = await db.collection("students").doc(studentId).get();
        if (studentDoc.exists && studentDoc.data()?.telegramChatId) {
            const chatId = studentDoc.data()?.telegramChatId;
            const notificationText = `*Nová zpráva od profesora:*\n\n${text}`;
            await sendTelegramMessage(chatId, notificationText);
        }
        return { success: true };
    } catch (error) {
        logger.error("Error sending message to student:", error);
        throw new HttpsError("internal", "Odeslání selhalo.");
    }
});

export const telegramBotWebhook = onRequest({ region: "europe-west1", secrets: ["TELEGRAM_BOT_TOKEN"] }, (req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }
        const update = req.body;
        if (!update || !update.message) {
            res.status(200).send('OK');
            return;
        }

        const message = update.message;
        const chatId = message.chat.id;
        const text = message.text;

        try {
            if (text && text.startsWith("/start")) {
                const token = text.split(' ')[1];
                if (token) {
                    const q = db.collection("students").where("telegramConnectionToken", "==", token).limit(1);
                    const querySnapshot = await q.get();
                    if (!querySnapshot.empty) {
                        const studentDoc = querySnapshot.docs[0];
                        await studentDoc.ref.update({ 
                            telegramChatId: chatId,
                            telegramConnectionToken: FieldValue.delete()
                        });
                        await sendTelegramMessage(chatId, "✅ Váš účet byl úspěšně propojen! Nyní se můžete ptát AI asistenta na otázky k vaší poslední aktivní lekci.");
                    } else {
                        await sendTelegramMessage(chatId, "⚠️ Neplatný nebo již použitý propojovací odkaz.");
                    }
                } else {
                    await sendTelegramMessage(chatId, "Vítejte! Pro propojení s vaším účtem AI Sensei, prosím, použijte unikátní odkaz, který najdete v aplikaci v sekci 'Telegram'.");
                }
                res.status(200).send("OK");
                return;
            }

            const q = db.collection("students").where("telegramChatId", "==", chatId).limit(1);
            const querySnapshot = await q.get();
            if (querySnapshot.empty) {
                await sendTelegramMessage(chatId, "Váš účet není propojen. Prosím, přihlaste se do aplikace a použijte váš unikátní link.");
                res.status(200).send("OK");
                return;
            }

            const studentDoc = querySnapshot.docs[0];
            const studentId = studentDoc.id;
            const studentData = studentDoc.data();

            if (text && text.toLowerCase().startsWith("/profesor ")) {
                const messageForProfessor = text.substring(10).trim();
                if (!messageForProfessor) {
                    await sendTelegramMessage(chatId, "Prosím, zadejte text zprávy pro profesora, např.: /profesor Mám dotaz k hodnocení.");
                    res.status(200).send("OK");
                    return;
                }

                const studentName = studentData.name || "Neznámý student";
                const conversationRef = db.collection("conversations").doc(studentId);
                await conversationRef.set({
                    studentId: studentId,
                    studentName: studentName,
                    lastMessage: messageForProfessor,
                    lastMessageTimestamp: FieldValue.serverTimestamp(),
                    professorHasUnread: true,
                }, { merge: true });
                await conversationRef.collection("messages").add({
                    senderId: studentId,
                    text: messageForProfessor,
                    timestamp: FieldValue.serverTimestamp(),
                });
                await sendTelegramMessage(chatId, "Vaše zpráva byla odeslána profesorovi.");
                res.status(200).send("OK");
                return;
            }

            await sendTelegramMessage(chatId, "🤖 AI Sensei přemýšlí...");
            
            let lessonContextPrompt = `Answer the student's question in a helpful and informative way. The user's question is: "${text}"`;
            const lastLessonId = studentData.lastActiveLessonId;

            if (lastLessonId) {
                const lessonRef = db.collection("lessons").doc(lastLessonId);
                const lessonDoc = await lessonRef.get();
                if (lessonDoc.exists) {
                    const lessonData = lessonDoc.data();
                    lessonContextPrompt = `Based on the lesson "${lessonData?.title}", answer the student's question: "${text}"`;
                }
            }
            
            const answer = await GeminiAPI.generateTextFromPrompt(lessonContextPrompt);
            await sendTelegramMessage(chatId, answer);
            res.status(200).send("OK");

        } catch (error) {
            logger.error("Error in Telegram webhook:", error);
            await sendTelegramMessage(chatId, "Omlouvám se, nastala neočekávaná chyba při zpracování vaší zprávy.");
            res.status(500).send("Internal Server Error");
        }
    });
});

// --- FUNKCIA PRE UKLADANIE VÝSLEDKOV KVÍZU ---
export const submitQuizResults = onCall({ region: "europe-west1" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Musíte být přihlášen.");
    }

    const studentId = request.auth.uid;
    const { lessonId, quizTitle, score, totalQuestions, answers } = request.data;

    if (typeof score === 'undefined' || !lessonId || !answers) {
        throw new HttpsError("invalid-argument", "Chybí potřebná data pro uložení výsledků kvízu.");
    }

    try {
        const submission = {
            studentId: studentId,
            lessonId: lessonId,
            quizTitle: quizTitle,
            score: score,
            totalQuestions: totalQuestions,
            answers: answers,
            submittedAt: FieldValue.serverTimestamp()
        };

        await db.collection("quiz_submissions").add(submission);

        return { success: true, message: "Výsledky kvízu byly úspěšně uloženy." };

    } catch (error) {
        logger.error("Error in submitQuizResults:", error);
        throw new HttpsError("internal", "Nepodařilo se uložit výsledky kvízu.");
    }
});

// --- NOVÁ, ODDELENÁ FUNKCIA PRE UKLADANIE VÝSLEDKOV TESTU ---
export const submitTestResults = onCall({ region: "europe-west1" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Musíte být přihlášen.");
    }

    const studentId = request.auth.uid;
    const { lessonId, testTitle, score, totalQuestions, answers } = request.data;

    if (typeof score === 'undefined' || !lessonId || !answers) {
        throw new HttpsError("invalid-argument", "Chybí potřebná data pro uložení výsledků testu.");
    }

    try {
        const submission = {
            studentId: studentId,
            lessonId: lessonId,
            testTitle: testTitle,
            score: score,
            totalQuestions: totalQuestions,
            answers: answers,
            submittedAt: FieldValue.serverTimestamp()
        };

        // Ukladáme do novej, oddelenej kolekcie
        await db.collection("test_submissions").add(submission);

        return { success: true, message: "Výsledky testu byly úspěšně uloženy." };

    } catch (error) {
        logger.error("Error in submitTestResults:", error);
        throw new HttpsError("internal", "Nepodařilo se uložit výsledky testu.");
    }
});
