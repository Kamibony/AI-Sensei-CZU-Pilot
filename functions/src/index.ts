// Súbor: functions/src/index.ts (KOMPLETNÁ VERZIA S PRÍSNOU KONTROLOU)

import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as GeminiAPI from "./gemini-api.js";
import cors from "cors";
import fetch from "node-fetch";
import pdf from "pdf-parse";

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
                    finalPrompt = `Vytvoř test na téma "${promptData.userPrompt}" s ${promptData.questionCount || 5} otázkami. Obtížnost: ${promptData.difficulty || 'Střední'}. Typy otázek: ${promptData.questionTypes || 'Mix'}. Odpověď musí být JSON objekt s klíčem 'questions', ktorý obsahuje pole objektů, kde každý objekt má klíče 'question_text' (string), 'type' (string), 'options' (pole stringů) a 'correct_option_index' (number).`;
                    break;
                case 'post':
                     finalPrompt = `Vytvoř sérii ${promptData.episodeCount || 3} podcast epizod na téma "${promptData.userPrompt}". Odpověď musí být JSON objekt s klíčem 'episodes', který obsahuje pole objektů, kde každý objekt má klíče 'title' (string) a 'script' (string).`;
                     break;
            }
        }
        // RAG Pipeline Logic
        if (filePaths && filePaths.length > 0) {
            const fileIds = filePaths; // Alias for clarity
            logger.log(`Starting RAG pipeline for ${fileIds.length} file(s).`);

            // 1. Generate embedding for the user's prompt
            const promptEmbedding = await GeminiAPI.getEmbeddings(promptData.userPrompt);

            // 2. Fetch all chunks from the relevant files
            const allChunks: { text: string; embedding: number[] }[] = [];
            for (const fileId of fileIds) {
                const chunksSnapshot = await db.collection(`fileMetadata/${fileId}/chunks`).get();
                chunksSnapshot.forEach(doc => {
                    const chunkData = doc.data();
                    if (chunkData.text && chunkData.embedding) {
                        allChunks.push({
                            text: chunkData.text,
                            embedding: chunkData.embedding
                        });
                    }
                });
            }

            if (allChunks.length === 0) {
                 throw new HttpsError('not-found', 'No processed text chunks found for the provided files. Please process the files first.');
            }
            logger.log(`Found a total of ${allChunks.length} chunks to compare.`);

            // 3. Calculate cosine similarity for each chunk
            const scoredChunks = allChunks.map(chunk => ({
                text: chunk.text,
                similarity: GeminiAPI.calculateCosineSimilarity(promptEmbedding, chunk.embedding)
            }));

            // 4. Sort chunks by similarity and pick the top N
            const sortedChunks = scoredChunks.sort((a, b) => b.similarity - a.similarity);
            const topChunks = sortedChunks.slice(0, 5); // Take top 5

            logger.log(`Top 5 chunks selected with scores: ${topChunks.map(c => c.similarity.toFixed(4)).join(', ')}`);

            // 5. Construct the final prompt with context
            const context = topChunks.map(chunk => chunk.text).join("\n\n---\n\n");
            const ragPrompt = `Based on the following context, please fulfill the user's request.\n\nCONTEXT:\n${context}\n\n---\n\nREQUEST:\n${finalPrompt}`;

            // 6. Call Gemini with the new prompt (no documents needed anymore)
             return isJson
                ? await GeminiAPI.generateJsonFromPrompt(ragPrompt)
                : { text: await GeminiAPI.generateTextFromPrompt(ragPrompt) };

        } else {
            // Original logic for when no files are provided
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

export const processFileForRAG = onCall({
    region: "europe-west1",
    timeoutSeconds: 540 // 9 minutes for potentially large files
}, async (request) => {
    // 1. Authentication & Authorization
    if (!request.auth || request.auth.token.role !== 'professor') {
        throw new HttpsError('unauthenticated', 'This action requires professor privileges.');
    }
    const { fileId } = request.data;
    if (!fileId) {
        throw new HttpsError('invalid-argument', 'The function must be called with a "fileId".');
    }

    const userId = request.auth.uid;
    logger.log(`Starting RAG processing for fileId: ${fileId} by user: ${userId}`);

    // 2. Get File Metadata from Firestore
    const fileDocRef = db.collection("fileMetadata").doc(fileId);
    const fileDoc = await fileDocRef.get();

    if (!fileDoc.exists) {
        throw new HttpsError('not-found', `File metadata with ID ${fileId} not found.`);
    }
    const fileData = fileDoc.data();
    if (fileData?.ownerId !== userId) {
        throw new HttpsError('permission-denied', 'You do not have permission to process this file.');
    }
    if (fileData?.status !== 'completed') {
        throw new HttpsError('failed-precondition', `File status is '${fileData?.status}', not 'completed'.`);
    }

    // 3. Download File from Storage
    const storage = getStorage();
    const bucket = storage.bucket();
    const file = bucket.file(fileData.storagePath);
    const [fileBuffer] = await file.download();

    // 4. Extract Text
    let text = '';
    if (fileData.contentType === 'application/pdf') {
        const data = await pdf(fileBuffer);
        text = data.text;
    } else {
        // Basic text extraction for other types
        text = fileBuffer.toString('utf-8');
    }

    if (!text.trim()) {
        logger.warn(`No text could be extracted from fileId: ${fileId}`);
        await fileDocRef.update({ ragStatus: 'processing_failed', ragError: 'No text content found' });
        return { success: false, message: "No text content found in the file." };
    }

    // 5. Chunking Logic
    const chunks: string[] = [];
    const chunkSize = 1000;
    const chunkOverlap = 100;
    let i = 0;
    while (i < text.length) {
        chunks.push(text.substring(i, i + chunkSize));
        i += chunkSize - chunkOverlap;
    }

    logger.log(`File ${fileId} was split into ${chunks.length} chunks.`);
    await fileDocRef.update({ ragStatus: 'processing_started', chunkCount: chunks.length });

    // 6. Embedding and Saving Loop
    const chunksCollectionRef = fileDocRef.collection('chunks');
    const batchPromises = [];

    for (let j = 0; j < chunks.length; j++) {
        const chunkText = chunks[j];
        const promise = GeminiAPI.getEmbeddings(chunkText)
            .then(embedding => {
                return chunksCollectionRef.add({
                    text: chunkText,
                    embedding: embedding,
                    fileId: fileId,
                    chunkIndex: j,
                    createdAt: FieldValue.serverTimestamp(),
                });
            })
            .catch(error => {
                logger.error(`Failed to create embedding for chunk ${j} of file ${fileId}`, error);
                // We'll continue processing other chunks
            });
        batchPromises.push(promise);
    }

    await Promise.all(batchPromises);

    // 7. Finalize Status
    await fileDocRef.update({ ragStatus: 'processing_complete' });

    logger.log(`Successfully processed and embedded ${chunks.length} chunks for fileId: ${fileId}.`);
    return { success: true, chunkCount: chunks.length };
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

export const registerUserWithRole = onCall({ region: "europe-west1" }, async (request) => {
    const { email, password, role } = request.data;

    // Validate role
    if (role !== 'professor' && role !== 'student') {
        throw new HttpsError('invalid-argument', 'Role must be either "professor" or "student".');
    }
    // Validate email and password
    if (!email || !password) {
        throw new HttpsError('invalid-argument', 'Email and password are required.');
    }

    try {
        // 1. Create user
        const userRecord = await getAuth().createUser({
            email: email,
            password: password,
        });
        const userId = userRecord.uid;

        // 2. Set custom claim immediately
        await getAuth().setCustomUserClaims(userId, { role: role });

        // 3. Create document in 'users' collection
        const userDocRef = db.collection('users').doc(userId);
        await userDocRef.set({
            email: email,
            role: role,
            createdAt: FieldValue.serverTimestamp(),
        });

        // 4. PRESERVE DUAL-WRITE: If role is 'student', create doc in 'students' collection
        if (role === 'student') {
            const studentDocRef = db.collection('students').doc(userId);
            await studentDocRef.set({
                email: email,
                role: 'student', // Redundant but kept for consistency
                createdAt: FieldValue.serverTimestamp(),
                name: '' // Empty name for consistency
            });
        }

        logger.log(`Successfully registered user ${userId} with role ${role}.`);
        return { success: true, userId: userId };

    } catch (error: any) {
        logger.error("Error in registerUserWithRole:", error);
        // Forward known auth errors to the client
        if (error.code && error.code.startsWith('auth/')) {
            throw new HttpsError('invalid-argument', error.message, { errorCode: error.code });
        }
        // Generic error for other issues
        throw new HttpsError('internal', 'An unexpected error occurred during registration.');
    }
});

export const admin_setUserRole = onCall({ region: "europe-west1" }, async (request) => {
    // 1. Verify caller is the admin
    if (request.auth?.token.email !== 'profesor@profesor.cz') {
        logger.warn(`Unauthorized role change attempt by ${request.auth?.token.email}`);
        throw new HttpsError('unauthenticated', 'Tato akce vyžaduje oprávnění administrátora.');
    }

    const { userId, newRole } = request.data;

    // 2. Validate arguments
    if (!userId || !newRole) {
        throw new HttpsError('invalid-argument', 'Chybí ID uživatele nebo nová role.');
    }
    if (newRole !== 'professor' && newRole !== 'student') {
        throw new HttpsError('invalid-argument', 'Nová role může být pouze "professor" nebo "student".');
    }

    try {
        // Set custom claims
        await getAuth().setCustomUserClaims(userId, { role: newRole });

        // 3. Update user role in Firestore
        const userRef = db.collection('users').doc(userId);
        await userRef.update({ role: newRole });

        logger.log(`Admin ${request.auth.token.email} successfully changed role of user ${userId} to ${newRole}`);

        // 4. Return success
        return { success: true, message: `Role uživatele byla úspěšně změněna.` };
    } catch (error) {
        logger.error(`Error setting user role for ${userId} by admin ${request.auth?.token.email}:`, error);
        throw new HttpsError('internal', 'Nepodařilo se změnit roli uživatele v databázi.');
    }
});

export const onUserCreate = onDocumentCreated("users/{userId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        logger.log("No data associated with the event");
        return;
    }
    const data = snapshot.data();
    const role = data.role || 'student'; // Default to 'student' if role is not set
    const userId = event.params.userId;

    try {
        await getAuth().setCustomUserClaims(userId, { role: role });
        logger.log(`Custom claim set for user ${userId}: role=${role}`);
    } catch (error) {
        logger.error(`Error setting custom claim for user ${userId}:`, error);
    }
});

// 1. NOVÁ FUNKCIA: Pripraví nahrávanie a vráti Signed URL
export const getSecureUploadUrl = onCall({ region: "europe-west1" }, async (request) => {
// 1. AUTORIZÁCIA: Povolíme iba profesorom
if (!request.auth || request.auth.token.role !== 'professor') {
throw new HttpsError('unauthenticated', 'Na túto akciu musíte mať rolu profesora.');
}

const { fileName, contentType, courseId, size } = request.data;
if (!fileName || !contentType || !courseId) {
throw new HttpsError('invalid-argument', 'Chýbajú povinné údaje (fileName, contentType, courseId).');
}

const userId = request.auth.uid;
// Použijeme ID z Firestore ako unikátny názov súboru
const docId = db.collection("fileMetadata").doc().id;
const filePath = `courses/${courseId}/media/${docId}`;

// 2. Vytvoríme "placeholder" vo Firestore
try {
await db.collection("fileMetadata").doc(docId).set({
ownerId: userId,
courseId: courseId,
fileName: fileName,
contentType: contentType,
size: size,
storagePath: filePath, // Uložíme finálnu cestu
status: 'pending_upload', // Zatiaľ čaká na nahratie
createdAt: FieldValue.serverTimestamp()
});
} catch (error) {
logger.error("Chyba pri vytváraní placeholderu vo Firestore:", error);
throw new HttpsError("internal", "Nepodarilo sa pripraviť nahrávanie.");
}

// 3. Generovanie Signed URL
const storage = getStorage();
// Použijeme predvolený bucket projektu
const bucket = storage.bucket();
const file = bucket.file(filePath);

const options = {
version: 'v4' as const,
action: 'write' as const,
expires: Date.now() + 15 * 60 * 1000, // 15 minút platnosť
contentType: contentType, // Vynútime presný typ obsahu
metadata: {
ownerId: userId,
firestoreDocId: docId
}
};

try {
const [url] = await file.getSignedUrl(options);
// Vrátime klientovi všetko, čo potrebuje
return { signedUrl: url, docId: docId, filePath: filePath };
} catch (error) {
logger.error("Chyba pri generovaní Signed URL:", error);
throw new HttpsError("internal", "Nepodarilo sa vygenerovať URL na nahrávanie.");
}
});

// 2. NOVÁ FUNKCIA: Finalizuje upload po úspešnom nahratí (S DETAILNÝM LOGOVANÍM)
export const finalizeUpload = onCall({ region: "europe-west1" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Musíte byť prihlásený.');
    }

    const { docId, filePath } = request.data;
    if (!docId || !filePath) {
        throw new HttpsError('invalid-argument', 'Chýba docId alebo filePath.');
    }

    logger.log(`Starting finalizeUpload for docId: ${docId}, filePath: ${filePath}`);

    const currentUserId = request.auth.uid;
    const docRef = db.collection("fileMetadata").doc(docId);

    try {
        const doc = await docRef.get();
        if (!doc.exists) {
            logger.error(`Firestore document not found for docId: ${docId}`);
            throw new HttpsError('not-found', 'Metadata súboru neboli nájdené.');
        }

        const metadata = doc.data();
        const ownerIdFromFirestore = metadata?.ownerId;

        logger.log(`OwnerId from Firestore is: ${ownerIdFromFirestore}. Current user is: ${currentUserId}.`);

        if (ownerIdFromFirestore !== currentUserId) {
            logger.warn(`Permission denied. Firestore ownerId (${ownerIdFromFirestore}) does not match current user (${currentUserId}).`);
            throw new HttpsError('permission-denied', 'Nemáte oprávnenie na finalizáciu tohto súboru.');
        }

        const storage = getStorage();
        const bucket = storage.bucket();
        const file = bucket.file(filePath);

        try {
            logger.log(`Attempting to set metadata on gs://${bucket.name}/${filePath}...`);
            await file.setMetadata({
                metadata: {
                    ownerId: ownerIdFromFirestore,
                    firestoreDocId: docId
                }
            });
            logger.log(`SUCCESS: Metadata successfully set for ${filePath}. ownerId is now ${ownerIdFromFirestore}.`);
        } catch (storageError) {
            logger.error(`CRITICAL: Failed to set metadata for ${filePath}.`, storageError);
            throw new HttpsError("internal", "Nepodarilo sa nastaviť metadáta súboru v Storage.");
        }

        await docRef.update({
            status: 'completed',
            uploadedAt: FieldValue.serverTimestamp()
        });

        logger.log(`Finalization complete for docId: ${docId}.`);
        return { success: true, docId: docId };

    } catch (error) {
        // Logujeme chybu, ktorá nastala buď v našej logike, alebo pri 'setMetadata'
        logger.error(`Error during finalizeUpload for docId ${docId}:`, error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", "Nepodarilo sa dokončiť nahrávanie.");
    }
});

// ==================================================================
// =================== DATA MIGRATION FUNCTION ======================
// ==================================================================
export const admin_migrateFileMetadata = onCall({ region: "europe-west1" }, async (request) => {
    // 1. Authorize: Only the admin can run this
    if (request.auth?.token.email !== 'profesor@profesor.cz') {
        throw new HttpsError('unauthenticated', 'This action requires administrator privileges.');
    }

    logger.log("Starting metadata migration process...");
    const fileMetadataCollection = db.collection("fileMetadata");
    const storage = getStorage();
    const bucket = storage.bucket();

    let processedCount = 0;
    let errorCount = 0;

    try {
        const snapshot = await fileMetadataCollection.get();
        if (snapshot.empty) {
            logger.log("No documents found in fileMetadata collection. Nothing to migrate.");
            return { success: true, message: "No files to migrate." };
        }

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const { storagePath, ownerId } = data;

            if (!storagePath || !ownerId) {
                logger.warn(`Skipping document ${doc.id} due to missing storagePath or ownerId.`);
                errorCount++;
                continue;
            }

            try {
                const file = bucket.file(storagePath);
                // Check if file exists before trying to update metadata
                const [exists] = await file.exists();
                if (!exists) {
                    logger.warn(`File at path ${storagePath} (from doc ${doc.id}) does not exist in Storage. Skipping.`);
                    errorCount++;
                    continue;
                }

                await file.setMetadata({
                    metadata: {
                        ownerId: ownerId,
                        firestoreDocId: doc.id
                    }
                });
                logger.log(`Successfully set metadata for file: ${storagePath}`);
                processedCount++;
            } catch (error) {
                logger.error(`Failed to set metadata for file ${storagePath} (doc ${doc.id}):`, error);
                errorCount++;
            }
        }

        const message = `Migration complete. Processed: ${processedCount}, Errors: ${errorCount}.`;
        logger.log(message);
        return { success: true, message: message };

    } catch (error) {
        logger.error("A critical error occurred during the migration process:", error);
        if (error instanceof Error) {
            throw new HttpsError("internal", `Migration failed: ${error.message}`);
        }
        throw new HttpsError("internal", "An unknown error occurred during migration.");
    }
});

// ==================================================================
// =================== EMERGENCY ROLE RESTORE =======================
// ==================================================================
export const emergency_restoreProfessors = onCall({ region: "europe-west1" }, async (request) => {
    // 1. Authorize: Bypass role check, use email for the admin
    if (request.auth?.token.email !== 'profesor@profesor.cz') {
        logger.warn(`Unauthorized emergency role restore attempt by ${request.auth?.token.email}`);
        throw new HttpsError('unauthenticated', 'This action requires special administrator privileges.');
    }

    logger.log(`Emergency role restore initiated by ${request.auth.token.email}...`);
    const usersCollection = db.collection("users");
    const auth = getAuth();
    let updatedCount = 0;
    const errorList: string[] = [];

    try {
        const snapshot = await usersCollection.where("role", "==", "professor").get();
        if (snapshot.empty) {
            logger.log("No users with 'professor' role found in the 'users' collection.");
            return { success: true, message: "No professors found to restore." };
        }

        const promises = snapshot.docs.map(async (doc) => {
            const userId = doc.id;
            const userData = doc.data();
            const email = userData.email || 'N/A';

            try {
                await getAuth().setCustomUserClaims(userId, { role: 'professor' });
                logger.log(`Successfully restored role 'professor' for user: ${userId} (${email})`);
                updatedCount++;
            } catch (error) {
                const errorMessage = `Failed to set custom claim for user ${userId} (${email})`;
                logger.error(errorMessage, error);
                errorList.push(errorMessage);
            }
        });

        await Promise.all(promises);

        if (errorList.length > 0) {
            const message = `Restore partially complete. Successfully restored roles for ${updatedCount} professors. Failed for ${errorList.length}.`;
            logger.warn(message, errorList);
            // Still return success=true, but with a warning message
             return { success: true, message: `${message} Check logs for details.` };
        }

        const message = `Restore complete. Successfully restored roles for ${updatedCount} professors.`;
        logger.log(message);
        return { success: true, message: message };

    } catch (error) {
        logger.error("A critical error occurred during the emergency role restore process:", error);
        if (error instanceof Error) {
            throw new HttpsError("internal", `Restore failed: ${error.message}`);
        }
        throw new HttpsError("internal", "An unknown error occurred during the restore process.");
    }
});

// ==================================================================
// =================== STUDENT ROLE MIGRATION =======================
// ==================================================================
export const admin_migrateStudentRoles = onCall({ region: "europe-west1" }, async (request) => {
    // 1. Authorize: Only the admin can run this
    if (request.auth?.token.email !== 'profesor@profesor.cz') {
        logger.warn(`Unauthorized role migration attempt by ${request.auth?.token.email}`);
        throw new HttpsError('unauthenticated', 'This action requires administrator privileges.');
    }

    logger.log("Starting student role migration process...");
    const studentsCollection = db.collection("students");
    const auth = getAuth();

    let processedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    try {
        const snapshot = await studentsCollection.get();
        if (snapshot.empty) {
            logger.log("No documents found in students collection. Nothing to migrate.");
            return { success: true, message: "No students to migrate." };
        }

        for (const doc of snapshot.docs) {
            const studentId = doc.id;
            processedCount++;

            try {
                const userRecord = await auth.getUser(studentId);
                const currentClaims = userRecord.customClaims || {};
                const email = userRecord.email;

                // SECURITY CHECK: Skip admin or existing professors
                if (email === 'profesor@profesor.cz' || currentClaims.role === 'professor') {
                    logger.log(`Skipping admin/professor account: ${email}`);
                    continue;
                }

                if (currentClaims.role !== 'student') {
                    await auth.setCustomUserClaims(studentId, { ...currentClaims, role: 'student' });
                    logger.log(`Successfully set role 'student' for user: ${studentId} (${email})`);
                    updatedCount++;
                }
            } catch (error: any) {
                if (error.code === 'auth/user-not-found') {
                    logger.warn(`Orphaned student record found. User with ID ${studentId} does not exist in Auth. Skipping.`);
                } else {
                    logger.error(`Failed to process user ${studentId}:`, error);
                }
                errorCount++;
            }
        }

        const message = `Migration complete. Processed: ${processedCount}, Updated: ${updatedCount}, Errors: ${errorCount}.`;
        logger.log(message);
        return { success: true, message: message };

    } catch (error) {
        logger.error("A critical error occurred during the student role migration process:", error);
        if (error instanceof Error) {
            throw new HttpsError("internal", `Migration failed: ${error.message}`);
        }
        throw new HttpsError("internal", "An unknown error occurred during migration.");
    }
});
