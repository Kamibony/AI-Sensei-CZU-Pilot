/**
 * This file centralizes the logic for generating system prompts sent to the AI.
 * Moving prompt engineering to the backend makes the system more secure,
 * maintainable, and allows for easier updates without deploying new frontend code.
 */

// Interface for dynamic prompt data, allowing for type-safe data passing.
interface PromptData {
    userPrompt: string;
    slideCount?: number;
    questionCount?: number;
    difficulty?: string;
    questionTypes?: string;
    episodeCount?: number;
    length?: string;
}

// A function that returns a detailed, structured prompt for a given content type.
const getPromptForContentType = (type: string, data: PromptData): string => {
    const { userPrompt } = data;

    // Base instruction for all JSON-based content.
    const baseJsonInstruction = `
        You are an expert in creating educational materials.
        Your response MUST be a valid JSON object that strictly adheres to the requested schema.
        Do not include any introductory text, closing remarks, or markdown formatting like \`\`\`json ... \`\`\` around the JSON output.
    `;

    switch (type) {
        case "text":
            // For plain text, we just use the user's prompt directly.
            // Additional context like length could be added here in the future.
            return userPrompt;

        case "presentation":
            return `
                ${baseJsonInstruction}

                Please create a presentation based on the following topic: "${userPrompt}".
                It must contain exactly ${data.slideCount || 5} slides.

                The JSON object must have a key 'slides', which is an array of objects.
                Each object in the array represents a slide and must have the following keys:
                - 'title': A string for the slide's title.
                - 'points': An array of strings, where each string is a bullet point for the slide.
            `;

        case "quiz":
            return `
                ${baseJsonInstruction}

                Please create a quiz based on the following instructions: "${userPrompt}".

                The JSON object must have a key 'questions', which is an array of objects.
                Each object in the array represents a question and must have the following keys:
                - 'question_text': A string containing the full text of the question.
                - 'options': An array of strings representing the possible answers.
                - 'correct_option_index': The zero-based index of the correct answer in the 'options' array.
            `;

        case "test":
            return `
                ${baseJsonInstruction}

                Please create a test on the topic: "${userPrompt}".
                The test must have exactly ${data.questionCount || 5} questions.
                The difficulty level should be: ${data.difficulty || "Medium"}.
                The questions should be a mix of the following types: ${data.questionTypes || "Multiple Choice and True/False"}.

                The JSON object must have a key 'questions', which is an array of objects.
                Each object in the array represents a question and must have the following keys:
                - 'question_text': A string containing the full text of the question.
                - 'type': A string, either 'multiple_choice' or 'true_false'.
                - 'options': An array of strings representing the possible answers. For True/False, this should be ["True", "False"].
                - 'correct_option_index': The zero-based index of the correct answer in the 'options' array.
            `;

        case "post": // Corresponds to the Podcast feature
            return `
                ${baseJsonInstruction}

                Please create a podcast series with ${data.episodeCount || 3} episodes on the topic: "${userPrompt}".

                The JSON object must have a key 'episodes', which is an array of objects.
                Each object in the array represents an episode and must have the following keys:
                - 'title': A string for the episode's title.
                - 'script': A string containing the full script for the episode.
            `;

        default:
            // Fallback for an unknown type, though the main function should prevent this.
            return userPrompt;
    }
};

export { getPromptForContentType, PromptData };