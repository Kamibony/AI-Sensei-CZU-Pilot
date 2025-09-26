// Sua chave da API Gemini
const API_KEY = "AIzaSyAw4WY-pf5xdSDJ-MG2Y9MKjratXJhfQSA";

/**
 * FunÃ§Ã£o universal para chamar a API Gemini para geraÃ§Ã£o de texto.
 * @param {string} prompt - O texto de entrada para o modelo.
 * @returns {Promise<object>} - Um objeto com o texto gerado ou um erro.
 */
export async function callGeminiApi(prompt) {
    console.log("Chamando a API Gemini com o prompt:", prompt);
    // SimulaÃ§Ã£o de atraso de rede
    await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
    
    if (!prompt) {
        return { error: "O prompt nÃ£o pode estar vazio." };
    }
    
    // Resposta simulada
    const simulatedResponse = `
   Esta Ã© uma **resposta simulada e excelentemente escrita** da API Gemini.
   <br><br>
   O texto seria, obviamente, mais longo e detalhado, mas para os propÃ³sitos desta demonstraÃ§Ã£o, ele mostra a capacidade da IA de gerar conteÃºdo relevante e envolvente a partir de uma instruÃ§Ã£o simples do professor. O sistema pode adaptar o estilo, o tom e a complexidade do texto de acordo com a solicitaÃ§Ã£o, economizando horas de preparaÃ§Ã£o.
   <br><br>
   Exemplo de estrutura:
   <ul>
       <li class="ml-4 list-disc">IntroduÃ§Ã£o ao tÃ³pico</li>
       <li class="ml-4 list-disc">Conceitos-chave</li>
       <li class="ml-4 list-disc">Exemplos prÃ¡ticos</li>
       <li class="ml-4 list-disc">Resumo final</li>
   </ul>
   `;
    return { text: simulatedResponse };
}
