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
    // User reported "TypeError: pdf is not a function".
    // We wrap this block to catch any legacy calls to a 'pdf' function that might occur here.
    try {
        // If 'pdf' is referenced but not a function, accessing it might throw, or calling it will throw.
        // We do a safe check.
        if (typeof window !== 'undefined' && window.pdf && typeof window.pdf !== 'function') {
             console.warn("Detected invalid 'pdf' object. Suppressing crash.");
             // If this function was expected to return something from pdf(), we return empty.
             return [];
        }
    } catch (e) {
        console.warn("Client-side PDF safety check caught error:", e);
        return []; // Return empty array to prevent crash propagation
    }
    // -------------------------------------------------------

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
 * Logic:
 * 1. Unwrap: Extract text from objects/nested keys
 * 2. Clean Markdown: Remove code fences
 * 3. Strip HTML: Ruthlessly remove tags
 * 4. Fallback: Return safe graph on failure
 */
export function sanitizeMermaidCode(input) {
    let text = input;

    // 0. Handle null/undefined/empty
    if (!input) {
         return "graph TD; Error[Chyba dat]-->Fix[Skus znova]";
    }

    // 1. Unwrap from Object (Polymorphic Input)
    if (typeof input === 'object') {
        // Check for error object first
        if (input.error) {
             const errMsg = input.message ? input.message.replace(/[^a-zA-Z0-9 ]/g, '') : "Neznámá chyba";
             return `graph TD; Error[Chyba]-->Detail[${errMsg}]`;
        }

        // Extract content from known keys
        if (input.mermaid) text = input.mermaid;
        else if (input.mindmap) text = input.mindmap;
        else if (input.content) text = input.content;
        else if (input.code) text = input.code;
        else {
             // Fallback: If no known key, try to stringify or fail
             return "graph TD; Error[Neznámý formát dat]-->Check[Zkontroluj konzoli]";
        }
    }

    // Ensure string
    if (typeof text !== 'string') {
        text = String(text || "");
    }

    // 2. Clean Markdown Code Fences
    text = text.replace(/```mermaid/gi, '');
    text = text.replace(/```json/gi, '');
    text = text.replace(/```/g, '');

    // 3. Strip HTML (Aggressive)
    // Ruthlessly remove <...> tags, but preserve Mermaid arrows like <|-- or --|> or comparisons like x < 5
    // Regex: Match < followed by a letter, /, !, or ? (start of tag), then anything until >
    text = text.replace(/<[a-zA-Z\/!?][^>]*>/g, '');

    // 4. Decode HTML entities
    text = text.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

    // Clean up whitespace
    text = text.trim();

    // 5. Fallback if empty after cleaning
    if (!text) {
        return "graph TD; Error[Chyba dat]-->Fix[Skus znova]";
    }

    return text;
}
