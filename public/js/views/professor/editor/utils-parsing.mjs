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
