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
                    finalPrompt = `Vytvoř test na téma "${promptData.userPrompt}" s ${promptData.questionCount || 5} otázkami. Obtížnost: ${promptData.difficulty || 'Střední'}. Typy otázek: ${promptData.questionTypes || 'Mix'}. Odpověď musí být JSON objekt s klíčem 'questions', ktorý obsahuje pole objektů, kde každý objekt má klíče 'question_text' (string), 'type' (string), 'options' (pole stringů) a 'correct_option_index' (number).`;
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
        
        // Táto funkcia je volaná z `student.js` ako `type: 'professor'`
        // `student.js` už správu ukladá do DB. Táto funkcia len aktualizuje "prehľad" pre profesora.
        
        await conversationRef.set({
            studentId: studentId,
            studentName: studentName,
            lastMessage: text,
            lastMessageTimestamp: FieldValue.serverTimestamp(),
            professorHasUnread: true,
        }, { merge: true });

        // Samotnú správu už ukladá `student.js` do `conversations/{studentId}/messages`
        // Tento kód je duplicitný a používa zlé pole 'senderId'
        /*
        await conversationRef.collection("messages").add({
            senderId: studentId, // <-- TOTO JE PROBLÉM (má byť 'sender')
            text: text,
            timestamp: FieldValue.serverTimestamp(),
        });
        */
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
        
        // ===== OPRAVA: Používame 'sender' a 'type' =====
        await conversationRef.collection("messages").add({
            sender: "professor", // Namiesto senderId
            text: text,
            type: "professor", // Pridáme typ
            timestamp: FieldValue.serverTimestamp(),
        });
        // ============================================

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

// ==================================================================
// =================== ZAČIATOK ÚPRAVY PRE ANALÝZU =====================
// ==================================================================

// NOVÁ FUNKCIA: Globálna analýza
export const getGlobalAnalytics = onCall({ region: "europe-west1" }, async (request) => {
    try {
        // 1. Získať počet študentov
        const studentsSnapshot = await db.collection("students").get();
        const studentCount = studentsSnapshot.size;

        // 2. Analyzovať kvízy
        const quizSnapshot = await db.collection("quiz_submissions").get();
        const quizSubmissionCount = quizSnapshot.size;
        let totalQuizScore = 0;
        quizSnapshot.forEach(doc => {
            totalQuizScore += doc.data().score; // score je 0 až 1
        });
        const avgQuizScore = quizSubmissionCount > 0 ? (totalQuizScore / quizSubmissionCount) * 100 : 0; // v percentách

        // 3. Analyzovať testy
        const testSnapshot = await db.collection("test_submissions").get();
        const testSubmissionCount = testSnapshot.size;
        let totalTestScore = 0;
        testSnapshot.forEach(doc => {
            totalTestScore += doc.data().score;
        });
        const avgTestScore = testSubmissionCount > 0 ? (totalTestScore / testSubmissionCount) * 100 : 0; // v percentách

        // 4. (Voliteľné) Nájsť najaktívnejších študentov
        const activityMap = new Map<string, number>();
        quizSnapshot.forEach(doc => {
            const studentId = doc.data().studentId;
            activityMap.set(studentId, (activityMap.get(studentId) || 0) + 1);
        });
        testSnapshot.forEach(doc => {
            const studentId = doc.data().studentId;
            activityMap.set(studentId, (activityMap.get(studentId) || 0) + 1);
        });

        // Previesť mapu na pole a zoradiť
        const sortedActivity = Array.from(activityMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
        
        // Získať mená študentov
        const topStudents = [];
        for (const [studentId, count] of sortedActivity) {
            const studentDoc = await db.collection("students").doc(studentId).get();
            if (studentDoc.exists) {
                topStudents.push({
                    name: studentDoc.data()?.name || "Neznámý student",
                    submissions: count
                });
            }
        }

        return {
            studentCount: studentCount,
            quizSubmissionCount: quizSubmissionCount,
            avgQuizScore: avgQuizScore.toFixed(1), // Zaokrúhlenie na 1 desatinné miesto
            testSubmissionCount: testSubmissionCount,
            avgTestScore: avgTestScore.toFixed(1),
            topStudents: topStudents
        };

    } catch (error) {
        logger.error("Error in getGlobalAnalytics:", error);
        throw new HttpsError("internal", "Nepodařilo se načíst analytická data.");
    }
});

// NOVÁ FUNKCIA: AI Analýza študenta
export const getAiStudentSummary = onCall({ region: "europe-west1" }, async (request) => {
    const { studentId } = request.data;
    if (!studentId) {
        throw new HttpsError("invalid-argument", "Chybí ID studenta.");
    }

    try {
        // 1. Získať dáta študenta
        const studentDoc = await db.collection("students").doc(studentId).get();
        if (!studentDoc.exists) {
            throw new HttpsError("not-found", "Student nebyl nalezen.");
        }
        const studentName = studentDoc.data()?.name || "Neznámý";

        // 2. Získať výsledky kvízov
        const quizSnapshot = await db.collection("quiz_submissions")
            .where("studentId", "==", studentId)
            .orderBy("submittedAt", "desc")
            .limit(10) // Obmedzíme na posledných 10
            .get();
        
        const quizResults = quizSnapshot.docs.map(doc => {
            const data = doc.data();
            return `Kvíz '${data.quizTitle || 'bez názvu'}': ${(data.score * 100).toFixed(0)}%`;
        });

        // 3. Získať výsledky testov
        const testSnapshot = await db.collection("test_submissions")
            .where("studentId", "==", studentId)
            .orderBy("submittedAt", "desc")
            .limit(10)
            .get();
            
        const testResults = testSnapshot.docs.map(doc => {
            const data = doc.data();
            return `Test '${data.testTitle || 'bez názvu'}': ${(data.score * 100).toFixed(0)}%`;
        });

        // 4. Získať konverzácie (len otázky od študenta)
        
        // ===== OPRAVA: Používame 'sender' a odstraňujeme 'orderBy' kvôli indexu =====
        const messagesSnapshot = await db.collection(`conversations/${studentId}/messages`)
            .where("sender", "==", "student") // Správne pole je 'sender'
            .limit(15) // Obmedzíme na posledných 15 správ
            .get();
        // ========================================================================

        const studentQuestions = messagesSnapshot.docs.map(doc => doc.data().text);

        // 5. Vytvoriť kontext pre AI
        let promptContext = `
Data studenta:
Jméno: ${studentName}

Výsledky kvízů (posledních 10):
${quizResults.length > 0 ? quizResults.join("\n") : "Žádné odevzdané kvízy."}

Výsledky testů (posledních 10):
${testResults.length > 0 ? testResults.join("\n") : "Žádné odevzdané testy."}

Poslední dotazy studenta (AI asistentovi nebo profesorovi):
${studentQuestions.length > 0 ? studentQuestions.map(q => `- ${q}`).join("\n") : "Žádné dotazy."}
`;

        // 6. Vytvoriť finálny prompt
        const finalPrompt = `
Jsi AI asistent profesora. Analyzuj následující data o studentovi. 
Na základě jeho výsledků v kvízech a testech a jeho dotazů identifikuj:
1.  **Klíčové silné stránky:** V čem student vyniká?
2.  **Oblasti ke zlepšení:** Kde má student problémy? (Např. nízké skóre, časté dotazy na jedno téma).
3.  **Doporučení:** Navrhni 1-2 kroky pro profesora, jak studentovi pomoci.

Odpověz stručně, v bodech, v češtině.

${promptContext}
`;
        
        // 7. Zavolať Gemini
        const summary = await GeminiAPI.generateTextFromPrompt(finalPrompt);

        return { summary: summary };

    } catch (error) {
        logger.error("Error in getAiStudentSummary:", error);
        // Poskytneme viac detailov o chybe
        if (error instanceof Error) {
            throw new HttpsError("internal", `Nepodařilo se vygenerovat AI analýzu: ${error.message}`);
        }
        throw new HttpsError("internal", "Nepodařilo se vygenerovat AI analýzu.");
    }
});
// ==================================================================
// ==================== KONIEC ÚPRAVY PRE ANALÝZU ===================
// ==================================================================


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
                    // ===== OPRAVA: Používame 'telegramLinkToken' =====
                    const q = db.collection("students").where("telegramLinkToken", "==", token).limit(1);
                    const querySnapshot = await q.get();
                    if (!querySnapshot.empty) {
                        const studentDoc = querySnapshot.docs[0];
                        await studentDoc.ref.update({ 
                            telegramChatId: chatId,
                            telegramLinkToken: FieldValue.delete() // Zmažeme token
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
                
                // ===== OPRAVA: Používame 'sender' a 'type' =====
                await conversationRef.collection("messages").add({
                    sender: "student", // Namiesto senderId
                    text: messageForProfessor,
                    type: "professor", // Pridáme typ
                    timestamp: FieldValue.serverTimestamp(),
                });
                // ============================================

                await sendTelegramMessage(chatId, "Vaše zpráva byla odeslána profesorovi.");
                res.status(200).send("OK");
                return;
            }

            await sendTelegramMessage(chatId, "🤖 AI Sensei přemýšlí...");
            
            let lessonContextPrompt = `Answer the student's question in a helpful and informative way. The user's question is: "${text}"`;
            
            // ===== OPRAVA: Hľadáme správne pole =====
            const lastLessonId = studentData.lastActiveLessonId; // Toto pole musí existovať v profile študenta
            // ======================================

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
            quizTitle: quizTitle || 'Kvíz bez názvu', // Fallback
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

// --- ODDELENÁ FUNKCIA PRE UKLADANIE VÝSLEDKOV TESTU ---
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
            testTitle: testTitle || 'Test bez názvu', // Fallback
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
