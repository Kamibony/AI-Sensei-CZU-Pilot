// --- SAFELY WRAP PDF TOKEN COUNTING ---
// This function wraps the PDF text extraction logic in a robust try-catch block.
// It handles cases where the PDF library (pdfjsLib) is missing, undefined, or fails to parse the document.
export async function extractTextFromPDF(file) {
    try {
        // 1. Check for global pdfjsLib
        // We assume pdfjsLib is loaded globally via CDN or similar.
        if (typeof pdfjsLib === 'undefined') {
            console.warn("pdfjsLib not found. Skipping PDF text extraction.");
            return { text: "", pageCount: 0 };
        }

        // 2. Configure Worker if not set
        // Use a compatible version for the worker.
        // We use a safe default if not already configured.
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
             pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        // 3. Read File as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();

        // 4. Load Document
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        let fullText = "";
        const numPages = pdf.numPages;

        // 5. Extract text from each page
        for (let i = 1; i <= numPages; i++) {
            try {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + "\n";
            } catch (pageError) {
                console.warn(`Failed to extract text from page ${i}`, pageError);
                // Continue to next page instead of failing entire document
            }
        }

        return { text: fullText, pageCount: numPages };

    } catch (error) {
        console.warn("PDF preview failed, skipping...", error);
        // Prevent crash, return safe defaults
        return { text: "", pageCount: 0 };
    }
}

export function parseAiResponse(data, expectedKey) {
    if (!data) return [];

    // --- SAFETY PATCH: Catch potential PDF preview errors ---
    try {
        if (typeof window !== 'undefined' && window.pdf && typeof window.pdf !== 'function') {
             console.warn("Detected invalid 'pdf' object. Suppressing crash.");
             return [];
        }
    } catch (e) {
        console.warn("Client-side PDF safety check caught error:", e);
        return [];
    }

    // Case 1: Already an array
    if (Array.isArray(data)) return data;

    // Case 2: Object with the expected key
    if (typeof data === 'object' && Array.isArray(data[expectedKey])) {
        return data[expectedKey];
    }

    // Case 3: String (needs parsing)
    if (typeof data === 'string') {
        try {
            // Clean markdown wrappers
            let cleaned = data.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleaned);

            if (Array.isArray(parsed)) return parsed;
            if (parsed[expectedKey] && Array.isArray(parsed[expectedKey])) return parsed[expectedKey];

            // Common alternative keys
            if (expectedKey === 'cards') {
                 if (parsed.flashcards && Array.isArray(parsed.flashcards)) return parsed.flashcards;
            }
        } catch (e) {
            console.error('Failed to parse AI response string:', e);
        }
    }

    return [];
}

/**
 * Aggressive Sanitization Layer for Mermaid Code
 * Acts as a strict firewall before data reaches the renderer.
 *
 * PHASE 3: The Definitive Mindmap Parser
 * Logic:
 * 1. Unwrap: Extract text from objects/nested keys
 * 2. Clean Markdown: Remove code fences
 * 3. FORCE STRINGIFY: Treat content inside (), [], {} as Pure Text, wrapped in quotes.
 * 4. Strip HTML: Ruthlessly remove tags
 */
export function sanitizeMermaidCode(input) {
    // 0. Handle null/undefined/empty/whitespace
    if (input === null || input === undefined) return "";
    let text = input;

    // 1. Unwrap from Object (Polymorphic Input)
    if (typeof input === 'object') {
        if (input.error) {
             const errMsg = input.message ? input.message.replace(/[^a-zA-Z0-9 ]/g, '') : "Neznámá chyba";
             return `graph TD; Error[Chyba]-->Detail["${errMsg}"]`;
        }
        if (input.mermaid) text = input.mermaid;
        else if (input.mindmap) text = input.mindmap;
        else if (input.content) text = input.content;
        else if (input.code) text = input.code;
        else {
             return "graph TD; Error[Neznámý formát dat]-->Check[Zkontroluj konzoli]";
        }
    }

    // Ensure string
    if (typeof text !== 'string') {
        text = String(text || "");
    }

    if (text.trim() === '') return "";

    // 2. Clean Markdown Code Fences
    text = text.replace(/```mermaid/gi, '').replace(/```json/gi, '').replace(/```/g, '');

    // 3. PHASE 3: Force Stringify inside brackets (State Machine)
    let result = "";
    let i = 0;
    while (i < text.length) {
        const char = text[i];

        if (char === '(' || char === '[' || char === '{') {
            const opener = char;
            let closer = '';
            if (opener === '(') closer = ')';
            else if (opener === '[') closer = ']';
            else if (opener === '{') closer = '}';

            let depth = 1;
            let captured = "";
            let j = i + 1;
            let inQuote = false;

            while (j < text.length && depth > 0) {
                const c = text[j];

                if (c === '"') {
                    inQuote = !inQuote;
                }

                if (!inQuote) {
                    if (c === opener) {
                        depth++;
                    } else if (c === closer) {
                        depth--;
                    }
                }

                if (depth > 0) {
                    captured += c;
                    j++;
                }
            }

            if (depth === 0) {
                // Found match. j is at the closer.
                // captured is the content inside.
                // Sanitize: Replace " with '
                const sanitized = captured.replace(/"/g, "'");
                // Re-wrap: opener + " + sanitized + " + closer
                result += opener + '"' + sanitized + '"' + closer;
                i = j + 1;
            } else {
                // Unbalanced. Just append the char and continue.
                result += char;
                i++;
            }
        } else {
            result += char;
            i++;
        }
    }

    text = result;

    // 4. Strip HTML (Aggressive)
    text = text.replace(/<[a-zA-Z\/!?][^>]*>/g, '');

    // 5. Decode HTML entities
    text = text.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

    // Clean up whitespace
    text = text.trim();

    if (!text) {
        return "graph TD; Error[Chyba dat]-->Fix[Skus znova]";
    }

    return text;
}
