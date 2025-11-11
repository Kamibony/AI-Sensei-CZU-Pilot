// Súbor: functions/src/index.ts (KOMPLETNÁ VERZIA S OPRAVOU PRE PODCAST)

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
export const generateContent = onCall({ 
    region: "europe-west1",
    timeoutSeconds: 300 // <-- ZMENENÉ (5 minút)
}, async (request) => {
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
                    // ===== APLIKOVANÁ ZMENA: Prísna kontrola namiesto predvolenej hodnoty =====
                    
                    logger.log("Generating presentation, received slide_count:", promptData.slide_count);
                    
                    // 1. Prevedieme hodnotu na číslo. Ak je to "" alebo "abc", výsledok bude NaN (Not a Number)
                    const requestedCount = parseInt(promptData.slide_count, 10);

                    // 2. Ak je výsledok neplatné číslo alebo je 0 či menší, vyhodíme chybu
                    if (!requestedCount || requestedCount <= 0) {
                        logger.error("Invalid slide_count received:", promptData.slide_count);
                        // Vyhodíme chybu, ktorá sa zobrazí používateľovi na frontende
                        throw new HttpsError(
                            "invalid-argument", 
                            `Neplatný počet slidů. Zadejte prosím kladné číslo (dostali jsme '${promptData.slide_count || ''}').`
                        );
                    }
                    
                    // 3. Ak je všetko v poriadku, použijeme finálne číslo v prompte
                    finalPrompt = `Vytvoř prezentaci na téma "${promptData.userPrompt}" s přesně ${requestedCount} slidy. Odpověď musí být JSON objekt s klíčem 'slides', který obsahuje pole objektů, kde každý objekt má klíče 'title' (string) a 'points' (pole stringů).`;
                    logger.log(`Final prompt will use ${requestedCount} slides.`);
                    
                    break;
                    // ===== KONIEC ZMENY =====

                case 'quiz':
                    finalPrompt = `Vytvoř kvíz na základě zadání: "${promptData.userPrompt}". Odpověď musí být JSON objekt s klíčem 'questions', který obsahuje pole objektů, kde každý objekt má klíče 'question_text' (string), 'options' (pole stringů) a 'correct_option_index' (number).`;
                    break;
                
                case 'test':
                    finalPrompt = `Vytvoř test na téma "${promptData.userPrompt}" s ${promptData.question_count || 5} otázkami. Obtížnost: ${promptData.difficulty || 'Střední'}. Typy otázek: ${promptData.question_types || 'Mix'}. Odpověď musí být JSON objekt s klíčem 'questions', ktorý obsahuje pole objektů, kde každý objekt má klíče 'question_text' (string), 'type' (string), 'options' (pole stringů) a 'correct_option_index' (number).`;
                    break;
                
                // === ZAČIATOK OPRAVY (Podcast) ===
                case 'post':
                     // Oprava 1: Použitie 'episode_count' namiesto 'episodeCount'
                     const episodeCount = promptData.episode_count || 3;
                     
                     // Oprava 2: Oveľa prísnejší prompt, ktorý bráni halucináciám
                     finalPrompt = `
Jsi editor podcastů. Vytvoř sérii ${episodeCount} podcast epizod na téma "${promptData.userPrompt}".
DŮLEŽITÉ: Zpracuj POUZE informace poskytnuté v přiložených dokumentech (kontextu). Nevymýšlej si žádné informace, které nejsou v textu.
Odpověď musí být JSON objekt s klíčem 'episodes', který obsahuje pole objektů, kde každý objekt má klíče 'title' (string) a 'script' (string).
Skript musí být poutavý, ale fakticky přesný podle kontextu.
`;
                     break;
                // === KONIEC OPRAVY (Podcast) ===
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
        // Chybu HttpsError len prepošleme ďalej (naša vlastná chyba pre 'invalid-argument' prejde tiež)
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", `Failed to generate content: ${message}`);
    }
});

export const getAiAssistantResponse = onCall({ 
    region: "europe-west1",
    timeoutSeconds: 300 // <-- ZMENENÉ (5 minút) - AI volanie môže byť pomalé
}, async (request) => {
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
        if (error instanceof HttpsError) {
            throw error;
        }
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

        // Duplicitný kód odstránený - `student.js` to už robí
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
        
        // Zjednotenie na 'sender' a 'type'
        await conversationRef.collection("messages").add({
            sender: "professor", // Namiesto senderId
            text: text,
            type: "professor", // Pridáme typ
            lessonId: "general", // Pridáme všeobecné ID lekcie pre konzistenciu
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

// ==================================================================
// =================== ZAČIATOK ÚPRAVY PRE ANALÝZU =====================
// ==================================================================

export const getGlobalAnalytics = onCall({ region: "europe-west1" }, async (request) => {
    try {
        // ... (kód zostáva nezmenený) ...
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

// UPRAVENÁ FUNKCIA: AI Analýza študenta
export const getAiStudentSummary = onCall({ 
    region: "europe-west1",
    timeoutSeconds: 300 // <-- ZMENENÉ (5 minút) - AI volanie môže byť pomalé
}, async (request) => {
    const { studentId } = request.data;
    if (!studentId) {
        logger.error("getAiStudentSummary called without studentId.");
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
            .limit(10)
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
        const messagesSnapshot = await db.collection(`conversations/${studentId}/messages`)
            .where("sender", "==", "student") // Hľadáme pole 'sender'
            .limit(15) // Odstránené orderBy, aby sme nepotrebovali index
            .get();

        const studentQuestions = messagesSnapshot.docs.map(doc => doc.data().text);

        // 5. Vytvoriť kontext pre AI
        let promptContext = `
Data studenta:
Jméno: ${studentName}
Výsledky kvízů (posledních 10):
${quizResults.length > 0 ? quizResults.join("\n") : "Žádné odevzdané kvízy."}
Výsledky testů (posledních 10):
${testResults.length > 0 ? testResults.join("\n") : "Žádné odevzdané testy."}
Dotazy studenta (AI asistentovi nebo profesorovi):
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

        // ===== NOVÝ KROK: Uloženie analýzy do profilu študenta =====
        try {
            const studentRef = db.collection("students").doc(studentId);
            await studentRef.update({
                aiSummary: {
                    text: summary, // Vygenerovaný text
                    generatedAt: FieldValue.serverTimestamp() // Dátum generovania
                }
            });
            logger.log(`AI Summary saved for student ${studentId}`);
        } catch (saveError) {
            logger.error(`Failed to save AI summary for student ${studentId}:`, saveError);
            // Nezastavíme funkciu, vrátime súhrn aj tak, len sa neuloží
        }
        // ========================================================

        return { summary: summary }; // Vrátime vygenerovaný text

    } catch (error) {
        logger.error("Error in getAiStudentSummary:", error);
        if (error instanceof Error) {
            throw new HttpsError("internal", `Nepodařilo se vygenerovat AI analýzu: ${error.message}`);
        }
        if (error instanceof HttpsError) {
            throw error;
        }
        // === TU BOL PREKLEP, TERAZ JE OPRAVENÝ ===
        throw new HttpsError("internal", "Nepodařilo se vygenerovat AI analýzu.");
    }
});
// ==================================================================
// ==================== KONIEC ÚPRAVY PRE ANALÝZU ===================
// ==================================================================


export const telegramBotWebhook = onRequest({ region: "europe-west1", secrets: ["TELEGRAM_BOT_TOKEN"] }, (req, res) => {
    corsHandler(req, res, async () => {
        // ... (kód zostáva nezmenený, ale s opravami) ...
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
                    const q = db.collection("students").where("telegramLinkToken", "==", token).limit(1);
                    const querySnapshot = await q.get();
                    if (!querySnapshot.empty) {
                        const studentDoc = querySnapshot.docs[0];
                        await studentDoc.ref.update({ 
                            telegramChatId: chatId,
                            telegramLinkToken: FieldValue.delete()
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
                    sender: "student",
                    text: messageForProfessor,
                    type: "professor",
                    lessonId: "general",
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

            // Uloženie konverzácie z Telegramu do DB
            try {
                await db.collection(`conversations/${studentId}/messages`).add({
                    sender: "student",
                    text: text,
                    type: "ai",
                    lessonId: lastLessonId || "general",
                    timestamp: FieldValue.serverTimestamp()
                });
                 await db.collection(`conversations/${studentId}/messages`).add({
                    sender: "ai",
                    text: answer,
                    type: "ai",
                    lessonId: lastLessonId || "general",
                    timestamp: FieldValue.serverTimestamp()
                });
            } catch (dbError) {
                logger.error("Error saving telegram chat to DB:", dbError);
            }

            await sendTelegramMessage(chatId, answer);
            res.status(200).send("OK");

        } catch (error) {
            logger.error("Error in Telegram webhook:", error);
            await sendTelegramMessage(chatId, "Omlouvám se, nastala neočekávaná chyba při zpracování vaší zprávy.");
            // Je dôležité poslať 200 OK, aby Telegram neopakoval požiadavku
            res.status(200).send("OK"); 
        }
    });
});

// --- FUNKCIA PRE UKLADANIE VÝSLEDKOV KVÍZU ---
export const submitQuizResults = onCall({ region: "europe-west1" }, async (request) => {
    // ... (kód zostáva nezmenený) ...
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Musíte být přihlášen.");
    }

    const studentId = request.auth.uid;
    const { lessonId, quizTitle, score, totalQuestions, answers } = request.data;

    if (typeof score === 'undefined' || !lessonId || !answers) {
        // ===== TOTO JE OPRAVENÝ RIADOK =====
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
    // ... (kód zostáva nezmenený) ...
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

export const joinClass = onCall({ region: "europe-west1" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Musíte být přihlášen, abyste se mohl(a) zapsat do třídy.");
    }
    const studentId = request.auth.uid;

    const joinCode = request.data.joinCode;
    if (typeof joinCode !== 'string' || joinCode.trim() === '') {
        throw new HttpsError("invalid-argument", "Je nutné zadat kód třídy.");
    }

    try {
        const groupsRef = db.collection("groups");
        const querySnapshot = await groupsRef.where("joinCode", "==", joinCode.trim()).limit(1).get();

        if (querySnapshot.empty) {
            throw new HttpsError("not-found", "Kód třídy není platný");
        }

        const groupDoc = querySnapshot.docs[0];
        const groupData = groupDoc.data();
        const groupId = groupDoc.id;

        const studentRef = db.collection("students").doc(studentId);

        // Perform both writes in a single transaction/batch for atomicity
        const batch = db.batch();

        // 1. Add studentId to the group's studentIds array
        batch.update(groupDoc.ref, {
            studentIds: FieldValue.arrayUnion(studentId)
        });

        // 2. Add groupId to the student's memberOfGroups array
        // Using set with { merge: true } is safe and creates the field if it doesn't exist.
        batch.set(studentRef, {
            memberOfGroups: FieldValue.arrayUnion(groupId)
        }, { merge: true });

        await batch.commit();


        logger.log(`Student ${studentId} successfully joined group ${groupDoc.id} (${groupData.name}).`);

        return { success: true, groupName: groupData.name };

    } catch (error) {
        logger.error(`Error in joinClass for student ${studentId} with code "${joinCode}":`, error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", "Došlo k chybě při připojování k třídě.");
    }
});
