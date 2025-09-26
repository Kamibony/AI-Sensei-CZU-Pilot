// Your Gemini API key
const API_KEY = "AIzaSyAw4WY-pf5xdSDJ-MG2Y9MKjratXJhfQSA";

/**
 * Universal function to call the Gemini API for text generation.
 * @param {string} prompt - The input text for the model.
 * @returns {Promise<object>} - An object with the generated text or an error.
 */
export async function callGeminiApi(prompt) {
    console.log("Calling the Gemini API with prompt:", prompt);
    // Network delay simulation
    await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
    
    if (!prompt) {
        return { error: "The prompt cannot be empty." };
    }
    
    // Simulated response
    const simulatedResponse = `
   This is a **simulated and excellently written response** from the Gemini API.
   <br><br>
   The text would, of course, be longer and more detailed, but for the purposes of this demonstration, it shows the AI's ability to generate relevant and engaging content from a simple teacher's instruction. The system can adapt the style, tone, and complexity of the text according to the request, saving hours of preparation.
   <br><br>
   Example structure:
   <ul>
       <li class="ml-4 list-disc">Introduction to the topic</li>
       <li class="ml-4 list-disc">Key concepts</li>
       <li class="ml-4 list-disc">Practical examples</li>
       <li class="ml-4 list-disc">Final summary</li>
   </ul>
   `;
    return { text: simulatedResponse };
}