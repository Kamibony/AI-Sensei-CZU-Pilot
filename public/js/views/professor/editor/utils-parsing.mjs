export function parseAiResponse(data, expectedKey) {
    if (!data) return [];

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
