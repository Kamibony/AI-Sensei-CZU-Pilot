import type { CallableRequest, Request } from "firebase-functions/v2/https";
import type { FirestoreEvent, QueryDocumentSnapshot } from "firebase-functions/v2/firestore";

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const functions = require("firebase-functions/v1"); // Import v1 for triggers
const logger = require("firebase-functions/logger");
const cors = require("cors");
const fetch = require("node-fetch");
const textToSpeech = require("@google-cloud/text-to-speech"); // Import pre TTS

// Import local API using TypeScript syntax
import * as GeminiAPI from './gemini-api';
import { SUBMISSION_STATUS, SUBMISSION_OUTCOME } from './shared-constants';

// Lazy load heavy dependencies
// const pdf = require("pdf-parse");

/**
 * Dependency Adapter for pdf-parse.
 * Normalizes imports to ensure a callable function in mixed CJS/ESM environments.
 */
function loadPdfParser(): (buffer: Buffer, options?: any) => Promise<any> {
    const packageName = "pdf-parse";
    let parser;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        parser = require(packageName);
    } catch (e: any) {
        throw new Error(`Failed to require('${packageName}'): ${e.message}`);
    }
    // 1. Direct function export (Standard CJS)
    if (typeof parser === 'function') return parser;
    // 2. Default export (ESM interop)
    if (parser && typeof parser.default === 'function') return parser.default;
    // 3. Nested default (Double interop edge case)
    if (parser && parser.default && typeof parser.default.default === 'function') return parser.default.default;

    // 4. Class-based export (Version 2.x+)
    // If the export is an object containing a 'PDFParse' class, we wrap it to match the v1.x API.
    if (typeof parser === 'object' && parser !== null && typeof parser.PDFParse === 'function') {
        const PDFParseClass = parser.PDFParse;
        // Return a wrapper function that mimics standard v1 behavior: (buffer) => Promise<{ text: string }>
        return async (buffer: Buffer) => {
             // v2 requires Uint8Array, not Buffer
             const uint8 = new Uint8Array(buffer);
             const instance = new PDFParseClass(uint8);
             const result = await instance.getText();
             // result is likely an object { text: "...", ... } or just a string?
             // Based on testing: { text: "...", pages: [...] }
             // We ensure we return an object with a .text property.
             return typeof result === 'string' ? { text: result } : result;
        };
    }

    const type = typeof parser;
    const keys = (typeof parser === 'object' && parser !== null) ? Object.keys(parser).join(", ") : "null";
    throw new Error(
        `Dependency Adapter Error: '${packageName}' did not export a function. ` +
        `Received type: '${type}'. Keys: [${keys}].`
    );
}

const DEPLOY_REGION = "europe-west1";
// Dynamically determine storage bucket based on environment
const FIREBASE_CONFIG = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : {};
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
// Hardcode fallback to ensure it's never undefined in emulator/dev
const STORAGE_BUCKET = FIREBASE_CONFIG.storageBucket || (PROJECT_ID === "ai-sensei-prod" ? "ai-sensei-prod.firebasestorage.app" : "ai-sensei-czu-pilot.firebasestorage.app");

if (!STORAGE_BUCKET) {
    logger.error("CRITICAL: STORAGE_BUCKET could not be determined.");
}

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
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "Markdown" }),
        });
    } catch (error) {
        logger.error("Error sending Telegram message:", error);
    }
}

exports.startMagicGeneration = onCall({
    region: DEPLOY_REGION,
    timeoutSeconds: 540,
    memory: "1GiB"
}, async (request: CallableRequest) => {
    if (!request.auth || request.auth.token.role !== "professor") {
        throw new HttpsError("unauthenticated", "Only professors can start magic generation.");
    }

    const { lessonId, filePaths, lessonTopic } = request.data;
    if (!lessonId) {
        throw new HttpsError("invalid-argument", "Missing lessonId.");
    }

    const lessonRef = db.collection("lessons").doc(lessonId);

    // --- DEBUG LOGGING SETUP ---
    const debugLogs: string[] = [];
    const log = (message: string) => {
        logger.log(message);
        debugLogs.push(`[${new Date().toISOString()}] ${message}`);
    };
    // ---------------------------

    await lessonRef.update({
        magicStatus: "generating",
        magicProgress: "Starting analysis...",
        debug_logs: debugLogs
    });

    try {
        // --- 0. DYNAMIC CONFIGURATION FETCH ---
        log("[Magic] Fetching AI system configuration...");
        const configSnap = await db.collection("system_settings").doc("ai_config").get();
        const config = configSnap.exists ? configSnap.data() : {};

        const systemPrompt = config.system_prompt || undefined;
        const magicSlidesCount = parseInt(config.magic_presentation_slides) || 8;
        const magicQuizCount = parseInt(config.magic_quiz_questions) || 5;
        const magicFlashcardCount = parseInt(config.magic_flashcard_count) || 10;
        const magicTextRules = config.magic_text_rules ? `\n\nSYSTEM RULES:\n${config.magic_text_rules}` : "";

        log(`[Magic] Config loaded: Slides=${magicSlidesCount}, Quiz=${magicQuizCount}, Flashcards=${magicFlashcardCount}`);

        const pdf = loadPdfParser();
        const bucket = getStorage().bucket(STORAGE_BUCKET);

        // 1. PDF Extraction
        let fullTextContext = "";
        if (filePaths && filePaths.length > 0) {
            await lessonRef.update({ magicProgress: "Reading files...", debug_logs: debugLogs });
            for (const rawPath of filePaths) {
                try {
                     // --- ENFORCE STRICT DATA OWNERSHIP ---
                     const fileName = rawPath.split('/').pop();
                     const ownerId = request.auth.uid;

                     // 1. Construct Strict Path (courses/{userId}/media/{fileName})
                     // This ignores the client-provided path prefix (e.g. 'main-course') and enforces the user's ID
                     const targetPath = `courses/${ownerId}/media/${fileName}`;

                     // 2. Legacy Fallback Check
                     // If the file was historically in 'main-course', we check if we should allow it.
                     const isLegacy = rawPath.includes("courses/main-course/");
                     const isAdmin = request.auth.token.email === "profesor@profesor.cz";

                     let buffer, finalPath;

                     try {
                         // Try Strict Path First
                         const cleanPath = GeminiAPI.sanitizeStoragePath(targetPath, bucket.name);
                         const result = await GeminiAPI.downloadFileWithRetries(bucket, cleanPath);
                         buffer = result.buffer;
                         finalPath = result.finalPath;
                     } catch (strictError) {
                         // Strict path failed (file not found in user's folder).
                         // Check if we can fallback to legacy.
                         if (isLegacy && isAdmin) {
                             log(`[Magic] Strict path failed for ${fileName}. Admin fallback to legacy path: ${rawPath}`);
                             const cleanLegacy = GeminiAPI.sanitizeStoragePath(rawPath, bucket.name);
                             const result = await GeminiAPI.downloadFileWithRetries(bucket, cleanLegacy);
                             buffer = result.buffer;
                             finalPath = result.finalPath;
                         } else {
                             // Not admin or not legacy -> Enforce isolation (Fail)
                             log(`[Magic] Strict path failed for ${fileName} and fallback denied. Owner: ${ownerId}, Legacy: ${isLegacy}, Admin: ${isAdmin}`);
                             throw strictError;
                         }
                     }

                     log(`[Magic] Successfully read file. Target: '${targetPath}', Final: '${finalPath}'`);

                     let text = "";
                     if (finalPath.toLowerCase().endsWith(".pdf")) {
                         const pdfData = await pdf(buffer);
                         text = pdfData.text;
                         log(`[Magic] PDF ${finalPath}: ${text.length} chars. Snippet: "${text.substring(0, 100)}..."`);

                         // --- FALLBACK: Gemini Vision for Scans ---
                         if (text.trim().length < 100) {
                             log(`[Magic] Low text detected in ${finalPath}. Attempting Vision OCR...`);
                             // Convert PDF buffer to Base64
                             const pdfBase64 = buffer.toString('base64');
                             // Call Gemini Flash (cheaper/faster) to extract text
                             const visionPrompt = "Extract all readable text from this document verbatim.";
                             const visionText = await GeminiAPI.generateTextFromMultimodal(visionPrompt, pdfBase64, "application/pdf");
                             text = visionText || "";
                             log(`[Magic] Vision OCR result: ${text.length} chars.`);
                         }
                     } else {
                         text = buffer.toString("utf-8");
                         log(`[Magic] Text File ${finalPath}: ${text.length} chars.`);
                     }

                     if (!text || text.trim().length < 50) {
                         log(`[Magic] File ${finalPath} has very little text.`);
                     }

                     fullTextContext += `\n\n--- File: ${finalPath} ---\n${text}`;
                } catch (e: any) {
                    logger.error(`Failed to read file ${rawPath}`, e);
                    log(`Failed to read file ${rawPath}: ${e.message}`);
                }
            }
        }

        // 2. Generate Content (Task A)
        await lessonRef.update({ magicProgress: "Generating study material...", debug_logs: debugLogs });

        const title = (await lessonRef.get()).data()?.title || "Lesson";
        const topic = lessonTopic || "";

        const contextPrompt = `
        ROLE: You are an expert educational content creator.
        TASK: Create a comprehensive study lesson about "${title}" ${topic ? `(${topic})` : ""}.
        LANGUAGE: Analyze the provided source material and topic. Output in the SAME language.

        --- SOURCE MATERIAL BEGIN ---
        ${fullTextContext.substring(0, 30000)}
        --- SOURCE MATERIAL END ---

        CRITICAL OUTPUT INSTRUCTIONS:
        1. You MUST return a valid JSON object.
        2. Structure: { "title": "...", "sections": [ { "heading": "...", "content": "..." } ] }
        ${magicTextRules}
        `;

        // Pass systemPrompt to Gemini
        const textJson = await GeminiAPI.generateJsonFromPrompt(contextPrompt, systemPrompt);
        log(`Generated Text Content Keys: ${Object.keys(textJson).join(", ")}`);

        let markdownText = `# ${textJson.title}\n\n`;
        if (textJson.sections && Array.isArray(textJson.sections)) {
            markdownText += textJson.sections.map((s: any) => `## ${s.heading}\n${s.content}`).join("\n\n");
        } else {
            markdownText = JSON.stringify(textJson);
        }

        await lessonRef.update({
            text_content: markdownText,
            magicProgress: "Creating visual aids and quiz...",
            debug_logs: debugLogs
        });

        // --- PHASE 1: Content Generation (Critical) ---
        // Generate Quiz, Flashcards, and Slide Text. Store in memory first.
        await lessonRef.update({ magicProgress: "Drafting slides, quizzes, and extra content...", debug_logs: debugLogs });

        let slidesData: any = null;
        let quizData: any = null;
        let flashcardsData: any = null;
        let testData: any = null;
        let podcastData: any = null;
        let comicData: any = null;
        let mindmapData: any = null;
        let socialPostData: any = null;

        const contentTasks = [];

        // Task B: Presentation (Text Only)
        contentTasks.push((async () => {
             try {
                 const slidesPrompt = `
ROLE: You are an expert presentation designer.
TASK: Create exactly ${magicSlidesCount} presentation slides based on the provided text.

--- SOURCE MATERIAL BEGIN ---
${markdownText.substring(0, 10000)}
--- SOURCE MATERIAL END ---

CRITICAL OUTPUT INSTRUCTIONS:
1. You MUST generate exactly ${magicSlidesCount} slides.
2. Output valid JSON only.
3. Structure: { "slides": [ { "title": "...", "points": ["...", "..."], "visual_idea": "..." }, ... ] }
`;
                 slidesData = await GeminiAPI.generateJsonFromPrompt(slidesPrompt, systemPrompt);
                 log(`Generated Slides Keys: ${slidesData ? Object.keys(slidesData).join(", ") : "null"}`);
             } catch (e: any) {
                 log(`Phase 1 (Slides Text) failed: ${e.message}`);
             }
        })());

        // Task C: Quiz
        contentTasks.push((async () => {
             try {
                 const quizPrompt = `
ROLE: You are an expert quiz creator.
TASK: Create exactly ${magicQuizCount} quiz questions based on the provided text.

--- SOURCE MATERIAL BEGIN ---
${markdownText.substring(0, 10000)}
--- SOURCE MATERIAL END ---

CRITICAL OUTPUT INSTRUCTIONS:
1. You MUST generate exactly ${magicQuizCount} questions.
2. Output valid JSON only.
3. Structure: { "questions": [ { "question_text": "...", "options": ["...", "...", "...", "..."], "correct_option_index": 0 }, ... ] }
`;
                 quizData = await GeminiAPI.generateJsonFromPrompt(quizPrompt, systemPrompt);
                 log(`Generated Quiz Keys: ${quizData ? Object.keys(quizData).join(", ") : "null"}`);
             } catch (e: any) {
                 log(`Phase 1 (Quiz) failed: ${e.message}`);
             }
        })());

        // Task D: Flashcards
        contentTasks.push((async () => {
             try {
                 const fcPrompt = `
ROLE: You are an expert study aid creator.
TASK: Create exactly ${magicFlashcardCount} flashcards based on the provided text.

--- SOURCE MATERIAL BEGIN ---
${markdownText.substring(0, 10000)}
--- SOURCE MATERIAL END ---

CRITICAL OUTPUT INSTRUCTIONS:
1. You MUST generate exactly ${magicFlashcardCount} cards.
2. Output valid JSON only.
3. Structure: { "cards": [ { "front": "...", "back": "..." }, ... ] }
`;
                 flashcardsData = await GeminiAPI.generateJsonFromPrompt(fcPrompt, systemPrompt);
                 log(`Generated Flashcards Keys: ${flashcardsData ? Object.keys(flashcardsData).join(", ") : "null"}`);
             } catch (e: any) {
                 log(`Phase 1 (Flashcards) failed: ${e.message}`);
             }
        })());

        // Task E: Test (Assessment)
        contentTasks.push((async () => {
             try {
                 const testPrompt = `
ROLE: You are an expert exam creator.
TASK: Create a test with 5 distinct questions based on the provided text.

--- SOURCE MATERIAL BEGIN ---
${markdownText.substring(0, 10000)}
--- SOURCE MATERIAL END ---

CRITICAL OUTPUT INSTRUCTIONS:
1. You MUST generate exactly 5 questions.
2. Output valid JSON only.
3. Structure: { "questions": [ { "question_text": "...", "type": "multiple_choice", "options": ["...", "..."], "correct_option_index": 0 }, ... ] }
`;
                 testData = await GeminiAPI.generateJsonFromPrompt(testPrompt, systemPrompt);
                 log(`Generated Test Keys: ${testData ? Object.keys(testData).join(", ") : "null"}`);
             } catch (e: any) {
                 log(`Phase 1 (Test) failed: ${e.message}`);
             }
        })());

        // Task F: Podcast Script
        contentTasks.push((async () => {
             try {
                 const podcastPrompt = `
ROLE: You are an expert podcast producer.
TASK: Create a conversational script between two hosts (Alex and Sarah) about the provided text.
LANGUAGE: Analyze the input text. Write the script in the SAME language.

--- SOURCE MATERIAL BEGIN ---
${markdownText.substring(0, 10000)}
--- SOURCE MATERIAL END ---

CRITICAL OUTPUT INSTRUCTIONS:
1. Create a dialogue script for one episode.
2. Output valid JSON only.
3. Structure: { "script": [ { "speaker": "Alex", "text": "..." }, { "speaker": "Sarah", "text": "..." } ] }
`;
                 podcastData = await GeminiAPI.generateJsonFromPrompt(podcastPrompt, systemPrompt);
                 log(`Generated Podcast Keys: ${podcastData ? Object.keys(podcastData).join(", ") : "null"}`);
             } catch (e: any) {
                 log(`Phase 1 (Podcast) failed: ${e.message}`);
             }
        })());

        // Task G: Comic Script
        contentTasks.push((async () => {
             try {
                 const comicPrompt = `
ROLE: You are a comic book writer.
TASK: Create a 4-panel comic script based on the text.
LANGUAGE: Analyze the input text. Write the script in the SAME language.

--- SOURCE MATERIAL BEGIN ---
${markdownText.substring(0, 10000)}
--- SOURCE MATERIAL END ---

CRITICAL OUTPUT INSTRUCTIONS:
1. You MUST generate exactly 4 panels.
2. Output valid JSON only.
3. Structure: { "panels": [ { "panel_number": 1, "description": "...", "dialogue": "..." }, ... ] }
`;
                 comicData = await GeminiAPI.generateJsonFromPrompt(comicPrompt, systemPrompt);
                 log(`Generated Comic Keys: ${comicData ? Object.keys(comicData).join(", ") : "null"}`);
             } catch (e: any) {
                 log(`Phase 1 (Comic) failed: ${e.message}`);
             }
        })());

        // Task H: Mindmap
        contentTasks.push((async () => {
             try {
                 const mindmapPrompt = `
ROLE: You are an expert in knowledge visualization.
TASK: Create a hierarchical mindmap of the key concepts.

--- SOURCE MATERIAL BEGIN ---
${markdownText.substring(0, 10000)}
--- SOURCE MATERIAL END ---

CRITICAL OUTPUT INSTRUCTIONS:
1. Output valid JSON only.
2. Structure: { "mermaid": "graph TD\\nA-->B..." } (Mermaid.js syntax string)
`;
                 mindmapData = await GeminiAPI.generateJsonFromPrompt(mindmapPrompt, systemPrompt);
                 log(`Generated Mindmap Keys: ${mindmapData ? Object.keys(mindmapData).join(", ") : "null"}`);
             } catch (e: any) {
                 log(`Phase 1 (Mindmap) failed: ${e.message}`);
             }
        })());

        // Task I: Social Post
        contentTasks.push((async () => {
             try {
                 const postPrompt = `
ROLE: You are a social media expert.
TASK: Create a professional social media post to promote this lesson.

--- SOURCE MATERIAL BEGIN ---
${markdownText.substring(0, 10000)}
--- SOURCE MATERIAL END ---

CRITICAL OUTPUT INSTRUCTIONS:
1. Output valid JSON only.
2. Structure: { "platform": "LinkedIn", "content": "...", "hashtags": "#..." }
`;
                 socialPostData = await GeminiAPI.generateJsonFromPrompt(postPrompt, systemPrompt);
                 log(`Generated Social Post Keys: ${socialPostData ? Object.keys(socialPostData).join(", ") : "null"}`);
             } catch (e: any) {
                 log(`Phase 1 (Social Post) failed: ${e.message}`);
             }
        })());

        // Wait for all content generation
        await Promise.all(contentTasks);

        // Update Firestore with available text content
        const updateData: any = { debug_logs: debugLogs };
        if (slidesData) updateData.presentation = slidesData;
        if (quizData) updateData.quiz = quizData;
        if (flashcardsData) updateData.flashcards = flashcardsData;

        // NEW CONTENT TYPES (Flattened for consumption)
        if (testData && testData.questions) updateData.test = testData.questions;
        if (podcastData && podcastData.script) updateData.podcast_script = podcastData.script;
        if (comicData && comicData.panels) updateData.comic_script = comicData.panels;
        if (mindmapData && mindmapData.mermaid) updateData.mindmap = mindmapData.mermaid;
        if (socialPostData) updateData.social_post = socialPostData;

        await lessonRef.update(updateData);


        // --- PHASE 2: Media Generation (Parallel & Optional) ---
        if (slidesData && slidesData.slides && Array.isArray(slidesData.slides)) {
            await lessonRef.update({ magicProgress: "Generating visuals...", debug_logs: debugLogs });

            const slides = slidesData.slides;

            // Create array of promises (DO NOT await inside loop)
            const imagePromises = slides.map((slide: any, index: number) => {
                if (slide.visual_idea && slide.visual_idea.trim() !== "") {
                     // Return the promise directly
                     return (async () => {
                         try {
                             const imageBase64 = await GeminiAPI.generateImageFromPrompt(slide.visual_idea);
                             const fileName = `magic_slide_${lessonId}_${index}.png`;
                             const storagePath = `courses/${request.auth!.uid}/media/generated/${fileName}`;
                             const file = bucket.file(storagePath);
                             await file.save(Buffer.from(imageBase64, 'base64'), { metadata: { contentType: 'image/png' } });
                             const [url] = await file.getSignedUrl({ action: 'read', expires: '01-01-2030' });
                             return url;
                         } catch (err: any) {
                             throw new Error(`Image gen failed for slide ${index}: ${err.message}`);
                         }
                     })();
                } else {
                    return Promise.resolve(null);
                }
            });

            // Execute concurrently
            const results = await Promise.allSettled(imagePromises);

            // --- PHASE 3: Merge & Save ---
            results.forEach((result, index) => {
                const slide = slides[index];
                if (result.status === 'fulfilled') {
                    slide.imageUrl = result.value; // URL or null
                } else {
                    log(`Phase 2 (Image ${index}) failed: ${result.reason}`);
                    slide.imageError = "Generation failed";
                    slide.imageUrl = "https://placehold.co/600x400?text=Image+Generation+Failed"; // Placeholder
                }

                // Legacy/Schema check: Ensure imageUrl is at least null if not set
                if (slide.imageUrl === undefined) slide.imageUrl = null;
            });

            // Update presentation with images
            await lessonRef.update({
                presentation: { slides: slides },
                debug_logs: debugLogs
            });
        }

        await lessonRef.update({ magicStatus: "ready", magicProgress: "Done!", debug_logs: debugLogs });
        return { success: true, data: updateData };

    } catch (error: any) {
        log(`Magic Generation Error: ${error.message}`);
        await lessonRef.update({ magicStatus: "error", magicProgress: `Error: ${error.message}`, debug_logs: debugLogs });
        throw new HttpsError("internal", error.message);
    }
});


// NOVÁ FUNKCIA: Generovanie profesionálneho audia (MP3) pomocou Google Cloud TTS - MULTI-VOICE
exports.generatePodcastAudio = onCall({
    region: DEPLOY_REGION,
    timeoutSeconds: 300,
    memory: "1GiB"
}, async (request: CallableRequest) => {
    // 1. Validácia a Autorizácia
    if (!request.auth || request.auth.token.role !== "professor") {
        throw new HttpsError("unauthenticated", "Len profesor môže generovať audio.");
    }

    const { lessonId, text, language, episodeIndex, voiceGender } = request.data;
    if (!lessonId || !text) {
        throw new HttpsError("invalid-argument", "Chýba ID lekcie alebo text.");
    }

    try {
        logger.log(`Starting multi-voice audio generation for lesson ${lessonId}, episode ${episodeIndex || "single"}...`);

        const client = new textToSpeech.TextToSpeechClient();
        const langCode = language || "cs-CZ";

        // Definícia hlasov
        // Alex = Male (Wavenet-B / Neural2-B)
        // Sarah = Female (Wavenet-A / Neural2-A)
        let maleVoiceName = "cs-CZ-Wavenet-B";
        let femaleVoiceName = "cs-CZ-Wavenet-A";

        if (langCode === "pt-br") {
            maleVoiceName = "pt-BR-Neural2-B";
            femaleVoiceName = "pt-BR-Neural2-A";
        } else if (langCode === "en-US" || langCode === "en") {
            maleVoiceName = "en-US-Neural2-D";
            femaleVoiceName = "en-US-Neural2-F";
        }

        // 2. Parsovanie vstupu na segmenty
        // Rozdelí text podľa [Speaker]:, ponechá oddelovače, a odstráni prázdne stringy
        const parts = text.split(/(\[(?:Alex|Sarah|Host|Guest)\]:)/).filter((p: string) => p && p.trim().length > 0);

        const audioBuffers: Buffer[] = [];
        let currentSpeaker = "default"; // Default to female/sarah if no tag found initially? Or use male? Let's use Male as fallback or default.
        // Actually, let's treat untagged text as the default voice (e.g., Alex/Male).

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();

            // Map [Host] -> Alex, [Guest] -> Sarah
            if (part === "[Alex]:" || part === "[Host]:") {
                currentSpeaker = "Alex";
                continue;
            }
            if (part === "[Sarah]:" || part === "[Guest]:") {
                currentSpeaker = "Sarah";
                continue;
            }

            // Je to text segmentu
            // Determine voice based on speaker tag OR global voiceGender preference for Monologues
            let voiceName;
            if (currentSpeaker === "Sarah") {
                voiceName = femaleVoiceName;
            } else if (currentSpeaker === "Alex") {
                voiceName = maleVoiceName;
            } else {
                // Default / Monologue mode
                voiceName = (voiceGender === 'female') ? femaleVoiceName : maleVoiceName;
            }

            logger.log(`Synthesizing segment for ${currentSpeaker} (${voiceName}): "${part.substring(0, 20)}..."`);

            const requestPayload = {
                input: { text: part },
                voice: {
                    languageCode: langCode,
                    name: voiceName
                },
                audioConfig: {
                    audioEncoding: "MP3",
                    speakingRate: 1.0,
                    pitch: 0.0
                },
            };

            const [response] = await client.synthesizeSpeech(requestPayload);
            if (response.audioContent) {
                audioBuffers.push(Buffer.from(response.audioContent));
            }
        }

        if (audioBuffers.length === 0) {
             throw new HttpsError("internal", "No audio generated from segments.");
        }

        // 3. Spojenie audio bufferov
        const finalAudioBuffer = Buffer.concat(audioBuffers);
        logger.log(`Audio segments concatenated. Total size: ${finalAudioBuffer.length} bytes.`);

        // 4. Uloženie do Firebase Storage
        const bucket = getStorage().bucket(STORAGE_BUCKET);

        // Ak máme episodeIndex, vytvoríme unikátny názov súboru
        let filePath = `podcasts/${lessonId}.mp3`;
        if (typeof episodeIndex !== "undefined") {
            filePath = `podcasts/${lessonId}_${episodeIndex}.mp3`;
        }

        const file = bucket.file(filePath);

        await file.save(finalAudioBuffer, {
            metadata: {
                contentType: "audio/mpeg",
                metadata: {
                    lessonId: lessonId,
                    episodeIndex: episodeIndex !== undefined ? String(episodeIndex) : "single",
                    generatedBy: request.auth.uid
                }
            }
        });

        logger.log(`Audio uploaded to ${filePath}. Updating Firestore...`);

        // 5. Aktualizácia dokumentu lekcie
        // Ak generujeme konkrétnu epizódu, aktualizujeme len timestamp, alebo môžeme pridať mapu ciest ak by sme chceli.
        // Pre zachovanie kompatibility "as before", aktualizujeme podcast_audio_path len ak je to single file,
        // alebo ak je to posledný generovaný (to je asi OK).
        // Ale UI bude používať vrátený `storagePath`, takže toto pole vo Firestore je skôr fallback.

        await db.collection("lessons").doc(lessonId).update({
            podcast_audio_path: filePath,
            podcast_generated_at: FieldValue.serverTimestamp()
        });

        // Generate Signed URL / Public URL
        let publicUrl;
        if (process.env.FUNCTIONS_EMULATOR === "true" || process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
            const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9199";
            publicUrl = `http://${storageHost}/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`;
        } else {
            const [signedUrl] = await file.getSignedUrl({
                action: 'read',
                expires: '01-01-2050' // Long expiration
            });
            publicUrl = signedUrl;
        }

        return { success: true, storagePath: filePath, audioUrl: publicUrl };

    } catch (error: any) {
        logger.error("Error generating podcast audio:", error);
        throw new HttpsError("internal", `Audio generation failed: ${error.message}`);
    }
});

exports.generateComicPanelImage = onCall({
    region: DEPLOY_REGION,
    timeoutSeconds: 300,
    memory: "1GiB"
}, async (request: CallableRequest) => {
    if (!request.auth || request.auth.token.role !== "professor") {
        throw new HttpsError("unauthenticated", "Only professors can generate images.");
    }

    const { lessonId, panelIndex, panelPrompt } = request.data;
    if (!lessonId || typeof panelIndex === 'undefined' || !panelPrompt) {
        throw new HttpsError("invalid-argument", "Missing lessonId, panelIndex, or panelPrompt.");
    }

    try {


        // VISUALS ENHANCEMENT: Add style modifiers
        const enhancedPrompt = `Educational comic book style, detailed, vibrant colors, semi-realistic style. Visual context: ${panelPrompt}`;

        const imageBase64 = await GeminiAPI.generateImageFromPrompt(enhancedPrompt);

        const bucket = getStorage().bucket(STORAGE_BUCKET);
        const fileName = `comic_${lessonId}_${panelIndex}_${Date.now()}.png`;
        const storagePath = `courses/${request.auth.uid}/media/generated/${fileName}`;
        const file = bucket.file(storagePath);

        await file.save(Buffer.from(imageBase64, 'base64'), {
            metadata: {
                contentType: 'image/png',
                metadata: {
                    lessonId: lessonId,
                    panelIndex: String(panelIndex),
                    generatedBy: request.auth.uid
                }
            }
        });

        let imageUrl;
        if (process.env.FUNCTIONS_EMULATOR === "true" || process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
            const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9199";
            imageUrl = `http://${storageHost}/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;
        } else {
            const [signedUrl] = await file.getSignedUrl({
                action: 'read',
                expires: '01-01-2050'
            });
            imageUrl = signedUrl;
        }

        return { success: true, imageUrl: imageUrl };

    } catch (error: any) {
        logger.error("Error generating comic panel:", error);
        throw new HttpsError("internal", `Image generation failed: ${error.message}`);
    }
});

// ZJEDNOTENÁ FUNKCIA PRE VŠETKY AI OPERÁCIE
exports.generateContent = onCall({
    region: DEPLOY_REGION,
    timeoutSeconds: 300, // (5 minút)
    memory: "1GiB",
    cors: true
}, async (request: CallableRequest) => {
    const { contentType, promptData, filePaths } = request.data;
    if (!contentType || !promptData) {
        throw new HttpsError("invalid-argument", "Missing contentType or promptData.");
    }
    try {
        // Načítanie konfigurácie pre magický režim
        const configSnap = await db.collection("system_settings").doc("ai_config").get();
        const config = configSnap.exists ? configSnap.data() : {};
        const systemPrompt = config.system_prompt || undefined;

        let finalPrompt = promptData.userPrompt;
        const language = promptData.language || "cs";
        const isJson = ["presentation", "quiz", "test", "post", "comic", "flashcards", "mindmap", "podcast", "audio"].includes(contentType);

        // Add language instruction
    // DYNAMIC LANGUAGE DETECTION UPDATE:
    // Instead of hardcoding, we instruct the model to match the input language.
    const langInstruction = "Analyze the language of the provided 'topic' and 'content'. Generate the output (script/dialogue/text) strictly in the SAME LANGUAGE as the input content. If the input is mixed, prioritize the language of the 'content'.";
        finalPrompt += `\n\n${langInstruction}`;

        // STRICT SYSTEM INSTRUCTION to silence conversational filler
        finalPrompt += "\n\nSTRICT RULE: Return ONLY the raw content/JSON. Do NOT start with 'Here is', 'Sure', or 'Certainly'. No conversational filler.";

        if (isJson) {
            // Load Magic Defaults
            const magicSlidesCount = parseInt(config.magic_presentation_slides) || 8;
            const magicQuizCount = parseInt(config.magic_quiz_questions) || 5;
            const magicTestCount = parseInt(config.magic_test_questions) || 5;
            const magicFlashcardCount = parseInt(config.magic_flashcard_count) || 10;

            switch(contentType) {
                case "presentation":
                    let targetSlides = parseInt(promptData.slide_count, 10);
                    if (promptData.isMagic) {
                        targetSlides = magicSlidesCount;
                    }

                    if (!targetSlides || targetSlides <= 0) targetSlides = 8;

                    logger.log("Generating presentation. Target slides:", targetSlides, "Magic Mode:", promptData.isMagic);

                    // Capture presentation style
                    const style = promptData.presentation_style_selector ? `Visual Style: ${promptData.presentation_style_selector}.` : "";
                    
                    finalPrompt = `Vytvoř prezentaci na téma "${promptData.userPrompt}" s přesně ${targetSlides} slidy. ${style}
${langInstruction}

FORMAT: JSON
{
  "slides": [ ... ] (MANDATORY: Generate exactly ${targetSlides} slides. Empty array is a failure.)
}
Each slide object must have: 'title' (string), 'points' (array of strings), 'visual_idea' (string - detailní popis obrázku).`;
                    break;

                case "quiz":
                    let targetQuizQs = 5;
                    if (promptData.isMagic) {
                         targetQuizQs = magicQuizCount;
                    } else if (promptData.question_count) {
                         targetQuizQs = parseInt(promptData.question_count, 10) || 5;
                    }

                    finalPrompt = `Vytvoř kvíz na základě zadání: "${promptData.userPrompt}".
${langInstruction}

FORMAT: JSON
{
  "questions": [ ... ] (MANDATORY: Generate exactly ${targetQuizQs} questions. Empty array is a failure.)
}
Each question object must have: 'question_text' (string), 'options' (array of 4 strings), 'correct_option_index' (number 0-3).`;
                    break;

                case "test":
                    // OPRAVA: Mapovanie premenných z frontendu (snake_case) a fallbacky
                    // Frontend posiela 'question_count', backend čakal 'questionCount'
                    let testCount = parseInt(promptData.question_count || promptData.questionCount || "5", 10);
                    if (promptData.isMagic) {
                        testCount = magicTestCount;
                    }
                    
                    // Frontend posiela 'difficulty_select', backend čakal 'difficulty'
                    const testDifficulty = promptData.difficulty_select || promptData.difficulty || "Střední";
                    
                    // Frontend posiela 'type_select', backend čakal 'questionTypes'
                    const testTypes = promptData.type_select || promptData.questionTypes || "Mix";

                    finalPrompt = `Vytvoř test na téma "${promptData.userPrompt}" s ${testCount} otázkami. Obtížnost: ${testDifficulty}. Typy otázek: ${testTypes}.
${langInstruction}

FORMAT: JSON
{
  "questions": [ ... ] (MANDATORY: Generate exactly ${testCount} questions. Empty array is a failure.)
}
Each question object must have: 'question_text' (string), 'type' (string), 'options' (array of strings), 'correct_option_index' (number).`;
                    break;
                case "post":
                     const epCount = promptData.episode_count || promptData.episodeCount || 3;
                     const reqLang = language || promptData.language || "cs";
                     let targetLang = "Czech";
                     if (reqLang === "pt-br") targetLang = "Brazilian Portuguese";
                     else if (reqLang === "sk") targetLang = "Slovak";
                     else if (reqLang === "en") targetLang = "English";
                     else if (reqLang === "de") targetLang = "German";
                     else if (reqLang === "fr") targetLang = "French";
                     else if (reqLang === "es") targetLang = "Spanish";

                     finalPrompt = `You are Jules, an expert AI educational content creator and senior podcast producer used in the 'AI Sensei' platform. Your goal is to generate comprehensive educational content that includes both a structured text lesson and a scripted podcast series based on a single topic provided by the user: "${promptData.userPrompt}".

### OUTPUT FORMAT & NON-DESTRUCTION CLAUSE
1. **Strict JSON Only:** You must output ONLY valid JSON. Do not include markdown formatting (like \`\`\`json), introduction text, or concluding remarks.
2. **Structure Integrity:** Ensure all JSON keys are present even if the content is brief. Never output broken or malformed JSON.
3. **Safety & content policy:** If the topic is controversial, treat it with academic neutrality. If the topic violates safety policies, return a JSON with an "error" field explaining why, instead of generating harmful content.
4. **Language:** The content (values) must be in ${targetLang}. Keys must remain in English.

### CONTENT GENERATION RULES

#### A. The Lesson
Create a structured lesson with:
- A catchy Title.
- A brief Introduction.
- 3 distinct Learning Modules (bullet points or short paragraphs).
- A "Key Takeaway" summary.

#### B. The Podcast Series (The "Audio Extension")
Create a series of ${epCount} short podcast episodes related to the lesson.
- **Format:** A conversation between two hosts: "Alex" (The curious Host) and "Sarah" (The Expert).
- **Tone:** Engaging, conversational, slightly informal but educational (like a radio show).
- **Scripting:** Write the FULL dialogue script. Use tags \`[Alex]:\` and \`[Sarah]:\` to indicate speakers.
- **Series Structure:**
  - *Episode 1 (The Hook):* Introduction to the topic, why it matters, interesting facts. (Duration goal: ~1 min reading time).
  - *Episode 2 (The Deep Dive):* Discussing the core concepts from the lesson modules. (Duration goal: ~2-3 mins reading time).
  - *Episode 3 (The Application):* Real-world examples, summary, and a call to action for students. (Duration goal: ~1 min reading time).

### JSON SCHEMA
Use exactly this structure:
{
  "lesson": {
    "title": "String",
    "description": "String",
    "modules": [
      { "title": "String", "content": "String" }
    ],
    "summary": "String"
  },
  "podcast_series": {
    "title": "String",
    "host_voice_id": "male_1",
    "expert_voice_id": "female_1",
    "episodes": [
      {
        "episode_number": 1,
        "title": "String",
        "script": "[Alex]: Text... \\n[Sarah]: Text..."
      }
    ]
  }
}`;
                     break;

                case "flashcards":
                    const fcCount = promptData.isMagic ? magicFlashcardCount : 10;
                    finalPrompt = `Vytvoř sadu ${fcCount} studijních kartiček na téma "${promptData.userPrompt}".
${langInstruction}

FORMAT: JSON
{
  "cards": [ ... ] (MANDATORY: Generate exactly ${fcCount} cards. Empty array is a failure.)
}
Each card object must have: 'front' (pojem/otázka), 'back' (definice/odpověď).`;
                    break;

                case "mindmap":
                    finalPrompt = `Vytvoř mentální mapu na téma "${promptData.userPrompt}". Odpověď musí být JSON objekt obsahující POUZE klíč 'mermaid', jehož hodnotou je validní string pro Mermaid.js diagram (typ 'graph TD'). Nepoužívej markdown bloky. Příklad: { "mermaid": "graph TD\\nA-->B" }. ${langInstruction}`;
                    break;

                case "comic":
                    finalPrompt = `Vytvoř scénář pro komiks (4 panely). Odpověď musí být JSON objekt s klíčem 'panels' (pole objektů: panel_number, description, dialogue). ${langInstruction}`;
                    break;

                case "podcast":
                case "audio":
                    finalPrompt = `Vytvoř scénář pro audio podcast na téma "${promptData.userPrompt}".
${langInstruction}

FORMAT: JSON
{
  "script": [ ... ] (MANDATORY: Generate a dialogue script. Empty array is a failure.)
}
Each script object must have: 'speaker' ("Host" or "Guest"), 'text' (string).`;
                    break;
            }
        }

        // Aplikujeme pravidlá LEN pre magické generovanie (Text only here, others handled in switch)
        if (promptData.isMagic) {
            if (contentType === "text" && config.magic_text_rules) {
                finalPrompt += `\n\n[SYSTEM INSTRUCTION]: ${config.magic_text_rules}`;
            }
        }

        // RAG Pipeline Logic
        if (filePaths && filePaths.length > 0) {
            // RAG-based response
            logger.log(`[RAG] Starting RAG process for prompt: "${finalPrompt}" with ${filePaths.length} files.`);



            // 1. Generate embedding for the user's prompt
            const promptEmbedding = await GeminiAPI.getEmbeddings(finalPrompt);

            // 2. Fetch all chunks from the relevant files
            const allChunks: any[] = [];
            for (const filePath of filePaths) {
                // Ensure filePath is a valid string
                if (!filePath || typeof filePath !== "string") continue;

                // --- CRITICAL FIX FOR RAG ---
                // Extract fileId from storage path `courses/{courseId}/media/{fileId}`
                // Previously, we assumed fileId matches docId exactly.
                // Now, storage path might be `.../docId.pdf`. We need to strip extension to find Firestore doc.
                let rawFileId = filePath.split("/").pop();
                if (!rawFileId) continue;

                // Odstránime príponu (napr. .pdf, .txt), aby sme získali čisté ID dokumentu
                const fileId = rawFileId.includes('.') ? rawFileId.split('.').shift() : rawFileId;

                const chunksSnapshot = await db.collection(`fileMetadata/${fileId}/chunks`).get();
                chunksSnapshot.forEach((doc: QueryDocumentSnapshot) => {
                    allChunks.push(doc.data());
                });
            }
            logger.log(`[RAG] Fetched a total of ${allChunks.length} chunks from Firestore.`);

            if (allChunks.length === 0) {
                 logger.warn("[RAG] No chunks found for the provided files. Falling back to non-RAG generation.");
                 return isJson
                    ? await GeminiAPI.generateJsonFromDocuments(filePaths, finalPrompt, systemPrompt)
                    : { text: await GeminiAPI.generateTextFromDocuments(filePaths, finalPrompt, systemPrompt) };
            }

            // 3. Calculate Cosine Similarity and sort
            for (const chunk of allChunks) {
                chunk.similarity = GeminiAPI.calculateCosineSimilarity(promptEmbedding, chunk.embedding);
            }
            allChunks.sort((a, b) => b.similarity - a.similarity);

            // 4. Pick the top 3-5 chunks
            const topChunks = allChunks.slice(0, 5);
            logger.log(`[RAG] Selected top ${topChunks.length} chunks based on similarity.`);


            // 5. Construct the final prompt
            const context = topChunks.map(chunk => chunk.text).join("\n\n---\n\n");
            const augmentedPrompt = `Based on the following contexts, answer the user's question.\n\nContexts:\n${context}\n\nUser's Question:\n${finalPrompt}`;

            logger.log("[RAG] Sending augmented prompt to Gemini.");
            // Use the standard text/json generation with the new augmented prompt.
            // Note: We don't pass the filePaths to these functions anymore, as the context is in the prompt.
            return isJson
                ? await GeminiAPI.generateJsonFromPrompt(augmentedPrompt, systemPrompt)
                : { text: await GeminiAPI.generateTextFromPrompt(augmentedPrompt, systemPrompt) };

        } else {
            // Standard non-RAG response

            return isJson
                ? await GeminiAPI.generateJsonFromPrompt(finalPrompt, systemPrompt)
                : { text: await GeminiAPI.generateTextFromPrompt(finalPrompt, systemPrompt) };
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

exports.generateImage = onCall({
    region: DEPLOY_REGION,
    timeoutSeconds: 300,
    memory: "1GiB",
    cors: true
}, async (request: CallableRequest) => {
    const { prompt } = request.data;
    if (!prompt) {
        throw new HttpsError("invalid-argument", "Missing prompt.");
    }

    if (!request.auth || request.auth.token.role !== "professor") {
        throw new HttpsError("unauthenticated", "This action requires professor privileges.");
    }

    try {

        const imageBase64 = await GeminiAPI.generateImageFromPrompt(prompt);
        return { imageBase64 };
    } catch (error) {
        logger.error("Error in generateImage:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        let message = "An unknown error occurred while generating the image.";
        if (error instanceof Error) {
            message = error.message;
        }
        throw new HttpsError("internal", `Failed to generate image: ${message}`);
    }
});

exports.processFileForRAG = onCall({ region: DEPLOY_REGION, timeoutSeconds: 540, memory: "1GiB" }, async (request: CallableRequest) => {
    if (!request.auth || request.auth.token.role !== "professor") {
        throw new HttpsError("unauthenticated", "This action requires professor privileges.");
    }

    // Debug Log for Environment Variables
    logger.log(`[RAG] Environment Check - GCLOUD_PROJECT: ${process.env.GCLOUD_PROJECT}, GCP_PROJECT: ${process.env.GCP_PROJECT}, STORAGE_BUCKET: ${STORAGE_BUCKET}`);

    const { fileId } = request.data;
    if (!fileId) {
        throw new HttpsError("invalid-argument", "Missing fileId.");
    }

    try {
        logger.log(`[RAG] Starting processing for fileId: ${fileId}`);
        const fileMetadataRef = db.collection("fileMetadata").doc(fileId);
        const fileMetadataDoc = await fileMetadataRef.get();

        if (!fileMetadataDoc.exists) {
            throw new HttpsError("not-found", `File metadata not found for id: ${fileId}`);
        }

        const { storagePath, ownerId } = fileMetadataDoc.data();

        // Security check
        if (ownerId !== request.auth.uid) {
             throw new HttpsError("permission-denied", "You do not have permission to process this file.");
        }

        // 1. Download file from Storage
        const bucket = getStorage().bucket(STORAGE_BUCKET);
        const file = bucket.file(storagePath);
        const [fileBuffer] = await file.download();
        logger.log(`[RAG] Downloaded ${storagePath} (${(fileBuffer.length / 1024).toFixed(2)} KB)`);

        if (!fileBuffer || fileBuffer.length === 0) {
            throw new HttpsError("failed-precondition", "File is empty.");
        }

        // 2. Extract text from PDF
        logger.log("[RAG] Initializing pdf-parse...");
        const pdf = loadPdfParser();
        logger.log("[RAG] Parsing PDF content...");
        let text = "";
        try {
            const pdfData = await pdf(fileBuffer);
            text = pdfData.text;

            // --- DEBUG LOGGING FOR PDF EXTRACTION ---
            logger.log(`[RAG] PDF Stats - Pages: ${pdfData.numpages}, Text Length: ${text.length}`);
            logger.log(`[RAG] Extracted Text Snippet (first 100 chars): "${text.substring(0, 100)}"`);
            // ----------------------------------------

        } catch (pdfError: any) {
            logger.error("[RAG] PDF parsing failed:", pdfError);
            throw new HttpsError("invalid-argument", `Failed to parse PDF file: ${pdfError.message || "Unknown PDF error"}`);
        }

        if (!text || text.trim().length === 0) {
            logger.warn("[RAG] PDF extracted text is empty.");
             throw new HttpsError("invalid-argument", "PDF file contains no extractable text.");
        }
        logger.log(`[RAG] Extracted ${text.length} characters of text from PDF.`);


        // 3. Chunking Logic
        const chunks = [];
        const chunkSize = 1000;
        const chunkOverlap = 100;
        let startIndex = 0;
        while (startIndex < text.length) {
            const endIndex = Math.min(startIndex + chunkSize, text.length);
            chunks.push(text.substring(startIndex, endIndex));
            startIndex += chunkSize - chunkOverlap;
        }
        logger.log(`[RAG] Split text into ${chunks.length} chunks.`);

        // 4. Embedding Loop and Save to Firestore
        const batchSize = 5; // Process in smaller batches to avoid overwhelming the embedding API
        logger.log("[RAG] Initializing GeminiAPI...");


        let chunksProcessed = 0;
        for (let i = 0; i < chunks.length; i += batchSize) {
            const batchChunks = chunks.slice(i, i + batchSize);
            logger.log(`[RAG] Processing batch ${i / batchSize + 1}, size: ${batchChunks.length}`);

            const embeddingPromises = batchChunks.map(async (chunkText, index) => {
                try {
                    const embedding = await GeminiAPI.getEmbeddings(chunkText);
                    const chunkId = `${fileId}_${i + index}`;
                    const chunkRef = fileMetadataRef.collection("chunks").doc(chunkId);
                    return chunkRef.set({
                        text: chunkText,
                        embedding: embedding,
                        fileId: fileId,
                        chunkIndex: i + index,
                        createdAt: FieldValue.serverTimestamp(),
                    });
                } catch (embError) {
                     logger.error(`[RAG] Error embedding chunk ${i + index}:`, embError);
                     throw embError; // Re-throw to stop process or handle appropriately
                }
            });

            await Promise.all(embeddingPromises);
            chunksProcessed += batchChunks.length;
            logger.log(`[RAG] Processed and saved batch of ${batchChunks.length} chunks. Total: ${chunksProcessed}/${chunks.length}`);
        }

        await fileMetadataRef.update({ ragStatus: "processed", processedAt: FieldValue.serverTimestamp() });

        logger.log(`[RAG] Successfully processed and stored chunks for fileId: ${fileId}`);
        return { success: true, message: `Successfully processed file into ${chunks.length} chunks.` };

    } catch (error: any) {
        logger.error(`[RAG] Error processing file ${fileId}:`, error);
        // Attempt to mark the file as failed in Firestore
        try {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await db.collection("fileMetadata").doc(fileId).update({ ragStatus: "failed", error: errorMessage });
        } catch (updateError) {
            logger.error(`[RAG] Failed to update file metadata with error status for ${fileId}:`, updateError);
        }

        // Always throw a new HttpsError to ensure the message is propagated to the client
        // We prefix with [RAG_ERROR] to make it clear it came from this block
        let message = "An unknown error occurred.";
        let code = "internal";

        if (error instanceof HttpsError) {
            code = error.code as string;
            message = error.message;
        } else if (error instanceof Error) {
            message = error.message;
        } else {
            message = String(error);
        }

        throw new HttpsError(code as any, `[RAG_ERROR] ${message}`);
    }
});

exports.getAiAssistantResponse = onCall({
    region: DEPLOY_REGION,
    timeoutSeconds: 300, // <-- ZMENENÉ (5 minút) - AI volanie môže byť pomalé
    memory: "1GiB"
}, async (request: CallableRequest) => {
    const { lessonId, userQuestion } = request.data;

    // Only userQuestion is mandatory now
    if (!userQuestion) {
        throw new HttpsError("invalid-argument", "Missing userQuestion");
    }

    // 1. Context Awareness: Get User Info
    const userRole = request.auth?.token.role || "student";
    const userLanguage = request.data.language || "cs"; // Default to Czech

    try {
        let prompt;
        let systemContext = `You are a helpful AI Assistant for the 'AI Sensei' education platform.
        Current User Role: ${userRole}.
        Language: ${userLanguage === 'cs' ? 'Czech' : 'English'}.
        `;

        // Special case for Guide Bot
        if (lessonId === 'guide-bot') {
            prompt = `${systemContext}\n\nUser Question: ${userQuestion}`;
        } else if (!lessonId || lessonId === "general") {
             // FALLBACK: General Assistant Mode (No specific lesson context)
             prompt = `${systemContext}

             INSTRUCTIONS:
             You are a general educational assistant. Since no specific lesson context is provided, answer general questions about the platform or study tips.

             User Question: "${userQuestion}"`;
        } else {
            // 2. Context Awareness: Fetch Latest Lesson Data
            const lessonRef = db.collection("lessons").doc(lessonId);
            const lessonDoc = await lessonRef.get();

            if (!lessonDoc.exists) {
                throw new HttpsError("not-found", "Lesson not found");
            }

            const lessonData = lessonDoc.data();
            const lessonTitle = lessonData?.title || "Untitled Lesson";

            // Serialize content efficiently (avoid huge raw dumps if possible, but for now we include core fields)
            // We include generated content if available
            const contextData = {
                title: lessonTitle,
                topic: lessonData?.topic,
                text_content: lessonData?.text_content,
                podcast_script: lessonData?.podcast_script,
                quiz: lessonData?.quiz,
                test: lessonData?.test
            };

            const contextString = JSON.stringify(contextData).substring(0, 20000); // Limit context size

            prompt = `${systemContext}

            CONTEXT (Current Lesson Data):
            ${contextString}

            STRICT INSTRUCTIONS (Anti-Hallucination):
            You are an educational assistant. You must answer strictly based ONLY on the provided Context Data.
            Do not use outside knowledge to answer curriculum-specific questions.

            LANGUAGE INSTRUCTION:
            You must answer in the same language as the user's question.

            Fallback Protocol:
            If the answer is not found in the provided context, you must explicitly state:
            "I cannot find this information in the current lesson materials. Please check with your professor."

            User Question: "${userQuestion}"`;
        }


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

exports.sendMessageFromStudent = onCall({ region: DEPLOY_REGION }, async (request: CallableRequest) => {
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

exports.sendMessageToStudent = onCall({ region: DEPLOY_REGION, secrets: ["TELEGRAM_BOT_TOKEN"] }, async (request: CallableRequest) => {
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

// ... (Rest of file unchanged) ...
exports.getGlobalAnalytics = onCall({ region: DEPLOY_REGION }, async (request: CallableRequest) => {
    try {
        // ... (kód zostáva nezmenený) ...
        // 1. Získať počet študentov
        const studentsSnapshot = await db.collection("students").get();
        const studentCount = studentsSnapshot.size;

        // 2. Analyzovať kvízy
        const quizSnapshot = await db.collection("quiz_submissions").get();
        const quizSubmissionCount = quizSnapshot.size;
        let totalQuizScore = 0;
        quizSnapshot.forEach((doc: QueryDocumentSnapshot) => {
            const data = doc.data();
            const score = (typeof data.score === "number") ? data.score : 0;
            totalQuizScore += score; // score je 0 až 1
        });
        const avgQuizScore = quizSubmissionCount > 0 ? (totalQuizScore / quizSubmissionCount) * 100 : 0; // v percentách

        // 3. Analyzovať testy
        const testSnapshot = await db.collection("test_submissions").get();
        const testSubmissionCount = testSnapshot.size;
        let totalTestScore = 0;
        testSnapshot.forEach((doc: QueryDocumentSnapshot) => {
            const data = doc.data();
            const score = (typeof data.score === "number") ? data.score : 0;
            totalTestScore += score;
        });
        const avgTestScore = testSubmissionCount > 0 ? (totalTestScore / testSubmissionCount) * 100 : 0; // v percentách

        // 4. (Voliteľné) Nájsť najaktívnejších študentov
        const activityMap = new Map();
        quizSnapshot.forEach((doc: QueryDocumentSnapshot) => {
            const studentId = doc.data().studentId;
            activityMap.set(studentId, (activityMap.get(studentId) || 0) + 1);
        });
        testSnapshot.forEach((doc: QueryDocumentSnapshot) => {
            const studentId = doc.data().studentId;
            activityMap.set(studentId, (activityMap.get(studentId) || 0) + 1);
        });

        // Previesť mapu na pole a zoradiť
        const sortedActivity = Array.from(activityMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
        
        // Získať mená študentov
        const topStudents: any[] = [];
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
exports.getAiStudentSummary = onCall({
    region: DEPLOY_REGION,
    timeoutSeconds: 300 // <-- ZMENENÉ (5 minút) - AI volanie môže byť pomalé
}, async (request: CallableRequest) => {
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
        
        const quizResults = quizSnapshot.docs.map((doc: QueryDocumentSnapshot) => {
            const data = doc.data();
            return `Kvíz '${data.quizTitle || "bez názvu"}': ${(data.score * 100).toFixed(0)}%`;
        });

        // 3. Získať výsledky testov
        const testSnapshot = await db.collection("test_submissions")
            .where("studentId", "==", studentId)
            .orderBy("submittedAt", "desc")
            .limit(10)
            .get();
            
        const testResults = testSnapshot.docs.map((doc: QueryDocumentSnapshot) => {
            const data = doc.data();
            return `Test '${data.testTitle || "bez názvu"}': ${(data.score * 100).toFixed(0)}%`;
        });

        // 4. Získať konverzácie (len otázky od študenta)
        const messagesSnapshot = await db.collection(`conversations/${studentId}/messages`)
            .where("sender", "==", "student") // Hľadáme pole 'sender'
            .limit(15) // Odstránené orderBy, aby sme nepotrebovali index
            .get();

        const studentQuestions = messagesSnapshot.docs.map((doc: QueryDocumentSnapshot) => doc.data().text);

        // 5. Vytvoriť kontext pre AI
        const promptContext = `
Data studenta:
Jméno: ${studentName}
Výsledky kvízů (posledních 10):
${quizResults.length > 0 ? quizResults.join("\n") : "Žádné odevzdané kvízy."}
Výsledky testů (posledních 10):
${testResults.length > 0 ? testResults.join("\n") : "Žádné odevzdané testy."}
Dotazy studenta (AI asistentovi nebo profesorovi):
${studentQuestions.length > 0 ? studentQuestions.map((q: string) => `- ${q}`).join("\n") : "Žádné dotazy."}
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


exports.telegramBotWebhook = onRequest({ region: DEPLOY_REGION, secrets: ["TELEGRAM_BOT_TOKEN"] }, (req: Request, res: any) => {
    corsHandler(req, res, async () => {
        // ... (kód zostáva nezmenený, ale s opravami) ...
        if (req.method !== "POST") {
            res.status(405).send("Method Not Allowed");
            return;
        }
        const update = req.body;
        if (!update || !update.message) {
            res.status(200).send("OK");
            return;
        }

        const message = update.message;
        const chatId = message.chat.id;
        const text = message.text;

        try {
            if (text && text.startsWith("/start")) {
                const token = text.split(" ")[1];
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
exports.submitQuizResults = onCall({ region: DEPLOY_REGION }, async (request: CallableRequest) => {
    // ... (kód zostáva nezmenený) ...
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Musíte být přihlášen.");
    }

    const studentId = request.auth.uid;
    const { lessonId, quizTitle, score, totalQuestions, answers } = request.data;

    if (typeof score === "undefined" || !lessonId || !answers) {
        // ===== TOTO JE OPRAVENÝ RIADOK =====
        throw new HttpsError("invalid-argument", "Chybí potřebná data pro uložení výsledků kvízu.");
    }

    try {
        const submission = {
            studentId: studentId,
            lessonId: lessonId,
            quizTitle: quizTitle || "Kvíz bez názvu", // Fallback
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
exports.submitTestResults = onCall({ region: DEPLOY_REGION }, async (request: CallableRequest) => {
    // ... (kód zostáva nezmenený) ...
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Musíte být přihlášen.");
    }

    const studentId = request.auth.uid;
    const { lessonId, testTitle, score, totalQuestions, answers } = request.data;

    if (typeof score === "undefined" || !lessonId || !answers) {
        throw new HttpsError("invalid-argument", "Chybí potřebná data pro uložení výsledků testu.");
    }

    try {
        const submission = {
            studentId: studentId,
            lessonId: lessonId,
            testTitle: testTitle || "Test bez názvu", // Fallback
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

exports.joinClass = onCall({ region: DEPLOY_REGION }, async (request: CallableRequest) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Musíte být přihlášen, abyste se mohl(a) zapsat do třídy.");
    }
    const studentId = request.auth.uid;

    const joinCode = request.data.joinCode;
    if (typeof joinCode !== "string" || joinCode.trim() === "") {
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

exports.registerUserWithRole = onCall({ region: DEPLOY_REGION, cors: true }, async (request: CallableRequest) => {
    logger.log("registerUserWithRole called", { data: request.data });
    const { email, password, role, displayName } = request.data;

    // Validate role
    if (role !== "professor" && role !== "student") {
        throw new HttpsError("invalid-argument", "Role must be either \"professor\" or \"student\".");
    }
    // Validate email and password
    if (!email || !password) {
        throw new HttpsError("invalid-argument", "Email and password are required.");
    }

    try {
        // 1. Create user
        const userRecord = await getAuth().createUser({
            email: email,
            password: password,
            displayName: displayName || ""
        });
        const userId = userRecord.uid;

        // 2. Set custom claim immediately
        await getAuth().setCustomUserClaims(userId, { role: role });

        // 3. Create document in 'users' collection
        const userDocRef = db.collection("users").doc(userId);
        await userDocRef.set({
            email: email,
            role: role,
            name: displayName || "", // Save name to users collection
            createdAt: FieldValue.serverTimestamp(),
        });

        // 4. PRESERVE DUAL-WRITE: If role is 'student', create doc in 'students' collection
        if (role === "student") {
            const studentDocRef = db.collection("students").doc(userId);
            await studentDocRef.set({
                email: email,
                role: "student", // Redundant but kept for consistency
                createdAt: FieldValue.serverTimestamp(),
                name: displayName || "" // Save name to students collection
            });
        }

        logger.log(`Successfully registered user ${userId} with role ${role}.`);
        return { success: true, userId: userId };

    } catch (error: any) {
        logger.error("Error in registerUserWithRole:", error);
        // Forward known auth errors to the client
        if (error.code && error.code.startsWith("auth/")) {
            throw new HttpsError("invalid-argument", error.message, { errorCode: error.code });
        }
        // Generic error for other issues
        // Using 'aborted' instead of 'internal' to ensure the message is visible on the client side during debugging
        throw new HttpsError("aborted", `DEBUG ERROR: ${error.message} (Code: ${error.code})`);
    }
});

exports.admin_setUserRole = onCall({ region: DEPLOY_REGION }, async (request: CallableRequest) => {
    // 1. Verify caller is the admin
    if (request.auth?.token.email !== "profesor@profesor.cz") {
        logger.warn(`Unauthorized role change attempt by ${request.auth?.token.email}`);
        throw new HttpsError("unauthenticated", "Tato akce vyžaduje oprávnění administrátora.");
    }

    const { userId, newRole } = request.data;

    // 2. Validate arguments
    if (!userId || !newRole) {
        throw new HttpsError("invalid-argument", "Chybí ID uživatele nebo nová role.");
    }
    if (newRole !== "professor" && newRole !== "student") {
        throw new HttpsError("invalid-argument", "Nová role může být pouze \"professor\" nebo \"student\".");
    }

    try {
        // Set custom claims
        await getAuth().setCustomUserClaims(userId, { role: newRole });

        // 3. Update user role in Firestore
        const userRef = db.collection("users").doc(userId);
        await userRef.update({ role: newRole });

        logger.log(`Admin ${request.auth.token.email} successfully changed role of user ${userId} to ${newRole}`);

        // 4. Return success
        return { success: true, message: "Role uživatele byla úspěšně změněna." };
    } catch (error) {
        logger.error(`Error setting user role for ${userId} by admin ${request.auth?.token.email}:`, error);
        throw new HttpsError("internal", "Nepodařilo se změnit roli uživatele v databázi.");
    }
});

exports.onUserCreate = functions.firestore.document("users/{userId}").onCreate(async (snapshot: any, context: any) => {
    const data = snapshot.data();
    if (!data) {
        logger.log("No data associated with the event");
        return;
    }

    const role = data.role || "student"; // Default to 'student' if role is not set
    const userId = context.params.userId;

    try {
        // Check if user already has a claim (e.g. set by registerUserWithRole)
        const user = await getAuth().getUser(userId);
        if (user.customClaims && user.customClaims.role) {
            logger.log(`User ${userId} already has role ${user.customClaims.role}. Skipping default assignment.`);
            return;
        }

        await getAuth().setCustomUserClaims(userId, { role: role });
        logger.log(`Custom claim set for user ${userId}: role=${role}`);
    } catch (error) {
        logger.error(`Error setting custom claim for user ${userId}:`, error);
    }
});

// 1. NOVÁ FUNKCIA: Pripraví nahrávanie a vráti Signed URL
exports.getSecureUploadUrl = onCall({ region: DEPLOY_REGION }, async (request: CallableRequest) => {
    try {
        // 1. AUTORIZÁCIA: Povolíme iba profesorom
        if (!request.auth || request.auth.token.role !== "professor") {
            throw new HttpsError("unauthenticated", "Na túto akciu musíte mať rolu profesora.");
        }

        const { fileName, contentType, courseId, size } = request.data;
        if (!fileName || !contentType || !courseId) {
            throw new HttpsError("invalid-argument", "Chýbajú povinné údaje (fileName, contentType, courseId).");
        }

        // Define userId from auth context
        const userId = request.auth.uid;

        // Použijeme ID z Firestore ako unikátny názov súboru
        const docId = db.collection("fileMetadata").doc().id;
        
        // --- OPRAVA: Pridáme príponu k ID ---
        const extension = fileName.includes('.') ? fileName.split('.').pop() : "";
        const finalFileName = extension ? `${docId}.${extension}` : docId;

        // --- SECURITY FIX: MANDATORY USER ID IN PATH ---
        // We ignore courseId for the path and enforce request.auth.uid to ensure ownership.
        const filePath = `courses/${userId}/media/${finalFileName}`;
        // -----------------------------------------------

        // 2. Vytvoríme "placeholder" vo Firestore
        try {
            await db.collection("fileMetadata").doc(docId).set({
                ownerId: userId,
                courseId: courseId,
                fileName: fileName,
                contentType: contentType,
                size: size || 0, // Default to 0 if undefined to prevent Firestore error
                storagePath: filePath, // Uložíme finálnu cestu (s príponou)
                status: "pending_upload", // Zatiaľ čaká na nahratie
                createdAt: FieldValue.serverTimestamp()
            });
        } catch (error) {
            logger.error("Chyba pri vytváraní placeholderu vo Firestore:", error);
            throw new HttpsError("internal", "Nepodarilo sa pripraviť nahrávanie.");
        }

        // 3. Generovanie Signed URL
        const storage = getStorage();
        // Použijeme predvolený bucket projektu alebo fallback
        const bucketName = STORAGE_BUCKET || "ai-sensei-czu-pilot.firebasestorage.app";
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(filePath);

        let url;
        // DETECT EMULATOR
        if (process.env.FUNCTIONS_EMULATOR === "true" || process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
            // Construct local emulator URL
            // Default port is 9199.
            // URL format: http://<host>:<port>/v0/b/<bucket>/o/<encodedPath>?alt=media
            // But for UPLOAD (PUT), we usually use the same endpoint.
            const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9199";
            // Use JSON API format for emulator (supports POST)
            url = `http://${storageHost}/v0/b/${bucketName}/o?name=${encodeURIComponent(filePath)}`;
            logger.log("Generating Emulator Upload URL:", url);
        } else {
            const options = {
                version: "v4" as const,
                action: "write" as const,
                expires: Date.now() + 15 * 60 * 1000, // 15 minút platnosť
                contentType: contentType, // Vynútime presný typ obsahu
                metadata: {
                    ownerId: userId,
                    firestoreDocId: docId
                }
            };

            const [signedUrl] = await file.getSignedUrl(options);
            url = signedUrl;
        }

        // Vrátime klientovi všetko, čo potrebuje. Pridame 'uploadUrl' pre konzistenciu s frontendom.
        return { uploadUrl: url, signedUrl: url, docId: docId, filePath: filePath };
    } catch (error) {
        logger.error("Chyba v getSecureUploadUrl:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        let message = "An unknown error occurred.";
        if (error instanceof Error) {
            message = error.message;
        }
        throw new HttpsError("internal", `Nepodarilo sa vygenerovať URL na nahrávanie: ${message}`);
    }
});

// 2. NOVÁ FUNKCIA: Finalizuje upload po úspešnom nahratí (S DETAILNÝM LOGOVANÍM)
exports.finalizeUpload = onCall({ region: DEPLOY_REGION }, async (request: CallableRequest) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Musíte být prihlásený.");
    }

    const { docId, filePath } = request.data;
    if (!docId || !filePath) {
        throw new HttpsError("invalid-argument", "Chýba docId alebo filePath.");
    }

    logger.log(`Starting finalizeUpload for docId: ${docId}, filePath: ${filePath}`);

    const currentUserId = request.auth.uid;
    const docRef = db.collection("fileMetadata").doc(docId);

    try {
        const doc = await docRef.get();
        if (!doc.exists) {
            logger.error(`Firestore document not found for docId: ${docId}`);
            throw new HttpsError("not-found", "Metadata súboru neboli nájdené.");
        }

        const metadata = doc.data();
        const ownerIdFromFirestore = metadata?.ownerId;

        logger.log(`OwnerId from Firestore is: ${ownerIdFromFirestore}. Current user is: ${currentUserId}.`);

        if (ownerIdFromFirestore !== currentUserId) {
            logger.warn(`Permission denied. Firestore ownerId (${ownerIdFromFirestore}) does not match current user (${currentUserId}).`);
            throw new HttpsError("permission-denied", "Nemáte oprávnenie na finalizáciu tohto súboru.");
        }

        const storage = getStorage();
        const bucket = storage.bucket(STORAGE_BUCKET);
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
            status: "completed",
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
exports.admin_migrateFileMetadata = onCall({ region: DEPLOY_REGION }, async (request: CallableRequest) => {
    // 1. Authorize: Only the admin can run this
    if (request.auth?.token.email !== "profesor@profesor.cz") {
        throw new HttpsError("unauthenticated", "This action requires administrator privileges.");
    }

    logger.log("Starting metadata migration process...");
    const fileMetadataCollection = db.collection("fileMetadata");
    const storage = getStorage();
    const bucket = storage.bucket(STORAGE_BUCKET);

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
exports.emergency_restoreProfessors = onCall({ region: DEPLOY_REGION }, async (request: CallableRequest) => {
    // 1. Authorize: Bypass role check, use email for the admin
    if (request.auth?.token.email !== "profesor@profesor.cz") {
        logger.warn(`Unauthorized emergency role restore attempt by ${request.auth?.token.email}`);
        throw new HttpsError("unauthenticated", "This action requires special administrator privileges.");
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

        const promises = snapshot.docs.map(async (doc: QueryDocumentSnapshot) => {
            const userId = doc.id;
            const userData = doc.data();
            const email = userData.email || "N/A";

            try {
                await getAuth().setCustomUserClaims(userId, { role: "professor" });
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
// ==================================================================
// =================== ADMIN NUKE FUNCTION ==========================
// ==================================================================
exports.admin_nuke_all_files = onCall({ region: DEPLOY_REGION, timeoutSeconds: 540, memory: "1GiB" }, async (request: CallableRequest) => {
    // 1. Authorize: Only the admin can run this
    if (request.auth?.token.email !== "profesor@profesor.cz") {
        throw new HttpsError("unauthenticated", "This action requires administrator privileges.");
    }

    logger.log("WARNING: Nuke initiated by admin. Deleting ALL fileMetadata and Storage files.");

    const fileMetadataCollection = db.collection("fileMetadata");
    const storage = getStorage();
    const bucket = storage.bucket(STORAGE_BUCKET);

    let deletedDocs = 0;
    let deletedFiles = 0;
    let errors = 0;

    try {
        // 1. Delete all fileMetadata documents
        const snapshot = await fileMetadataCollection.get();
        const batchSize = 400;
        let batch = db.batch();
        let operationCounter = 0;

        for (const doc of snapshot.docs) {
            batch.delete(doc.ref);
            deletedDocs++;
            operationCounter++;

            if (operationCounter >= batchSize) {
                await batch.commit();
                batch = db.batch();
                operationCounter = 0;
            }
        }
        if (operationCounter > 0) {
            await batch.commit();
        }
        logger.log(`Deleted ${deletedDocs} fileMetadata documents.`);

        // 2. Delete all files in Storage
        // WARNING: This deletes everything in the bucket.
        // We might want to filter by 'courses/' prefix if the bucket is shared?
        // The requirement says "Delete ALL files in the Storage bucket".

        const [files] = await bucket.getFiles();
        logger.log(`Found ${files.length} files in storage. Deleting...`);

        // Delete in parallel chunks
        const chunkSize = 50;
        for (let i = 0; i < files.length; i += chunkSize) {
            const chunk = files.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (file: any) => {
                try {
                    await file.delete();
                    deletedFiles++;
                } catch (e) {
                    logger.warn(`Failed to delete file ${file.name}:`, e);
                    errors++;
                }
            }));
        }
        logger.log(`Deleted ${deletedFiles} files from Storage.`);

        return {
            success: true,
            message: `Nuke complete. Deleted ${deletedDocs} docs and ${deletedFiles} files. Errors: ${errors}`
        };

    } catch (error) {
        logger.error("Critical error during nuke:", error);
        throw new HttpsError("internal", "Nuke failed.");
    }
});

exports.admin_migrateStudentRoles = onCall({ region: DEPLOY_REGION }, async (request: CallableRequest) => {
    // 1. Authorize: Only the admin can run this
    if (request.auth?.token.email !== "profesor@profesor.cz") {
        logger.warn(`Unauthorized role migration attempt by ${request.auth?.token.email}`);
        throw new HttpsError("unauthenticated", "This action requires administrator privileges.");
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
                if (email === "profesor@profesor.cz" || currentClaims.role === "professor") {
                    logger.log(`Skipping admin/professor account: ${email}`);
                    continue;
                }

                if (currentClaims.role !== "student") {
                    await auth.setCustomUserClaims(studentId, { ...currentClaims, role: "student" });
                    logger.log(`Successfully set role 'student' for user: ${studentId} (${email})`);
                    updatedCount++;
                }
            } catch (error: any) {
                if (error.code === "auth/user-not-found") {
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

    } catch (error: any) {
        logger.error("A critical error occurred during the student role migration process:", error);
        if (error instanceof Error) {
            throw new HttpsError("internal", `Migration failed: ${error.message}`);
        }
        throw new HttpsError("internal", "An unknown error occurred during migration.");
    }
});

exports.evaluatePracticalSubmission = onDocumentCreated({
    region: DEPLOY_REGION,
    document: "practical_submissions/{submissionId}",
    memory: "2GiB",
    timeoutSeconds: 300
}, async (event: FirestoreEvent<QueryDocumentSnapshot>) => {
    const snapshot = event.data;
    if (!snapshot) {
        logger.error("No data associated with the event");
        return;
    }
    const submission = snapshot.data();
    const submissionId = snapshot.id;

    if (!submission.sessionId || !submission.storagePath) {
        logger.warn(`Submission ${submissionId} missing sessionId or storagePath.`);
        return;
    }

    try {
        // 1. Get the task description from the parent Session
        const sessionDoc = await db.collection("practical_sessions").doc(submission.sessionId).get();
        if (!sessionDoc.exists) {
            logger.warn(`Session ${submission.sessionId} not found.`);
            return;
        }
        // Standardized schema uses 'task' field (replaces legacy activeTask)
        const task = sessionDoc.data()?.task || sessionDoc.data()?.activeTask;
        if (!task) {
            logger.warn(`Session ${submission.sessionId} has no task description.`);
            return;
        }

        // 2. Securely access the file & Generate Signed URL
        const bucket = getStorage().bucket(STORAGE_BUCKET);
        const file = bucket.file(submission.storagePath);

        // Generate a long-lived Signed URL for the Professor View
        // (This acts as the "Keymaster" allowing the frontend to view the private file)
        const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // Valid for 7 days
        });

        // Download for analysis
        const [buffer] = await file.download();
        const base64Image = buffer.toString('base64');

        // Try to get mimeType from metadata, default to jpeg
        let mimeType = "image/jpeg";
        try {
            const [metadata] = await file.getMetadata();
            if (metadata.contentType) {
                mimeType = metadata.contentType;
            }
        } catch (e) {
            logger.warn(`Could not get metadata for ${submission.storagePath}, defaulting to image/jpeg`);
        }

        // 3. Construct Context-Aware Prompt for Gemini
        const systemPrompt = `
        ROLE: You are an expert practical instructor evaluating student work.
        TASK: "${task}"

        INSTRUCTIONS:
        1. Analyze the image to verify if it demonstrates the completion of the task.
        2. CHECK FOR INVALID CONTENT: If the image is blurry, black, irrelevant (e.g., a selfie, meme, random object), or does not match the task, you MUST fail it.
        3. If the task is completed, evaluate the quality.

        OUTPUT: Return structured JSON with:
        - "grade": A letter grade (A, B, C, D, F) or "N/A" if invalid.
        - "feedback": Constructive feedback (1-2 sentences). Explain why it passed or failed.
        - "status": "pass" or "fail".
        `;

        const evaluation = await GeminiAPI.generateJsonFromMultimodal(systemPrompt, base64Image, mimeType);

        // 4. Atomic Update of the Submission Document
        const outcome = evaluation.status || (evaluation.grade === 'F' ? SUBMISSION_OUTCOME.FAIL : SUBMISSION_OUTCOME.PASS);

        await snapshot.ref.update({
            grade: evaluation.grade || "N/A",
            feedback: evaluation.feedback || "Evaluation failed.",
            result: outcome, // Pass/Fail outcome
            status: SUBMISSION_STATUS.EVALUATED, // Lifecycle status: Always 'evaluated' on success
            imageUrl: signedUrl, // The Keymaster's link
            evaluatedAt: FieldValue.serverTimestamp()
        });

        logger.log(`Submission ${submissionId} evaluated. Result: ${outcome}, Grade: ${evaluation.grade}`);

    } catch (error) {
        logger.error(`Error evaluating submission ${submissionId}:`, error);
        await snapshot.ref.update({
            status: SUBMISSION_STATUS.ERROR,
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
});
