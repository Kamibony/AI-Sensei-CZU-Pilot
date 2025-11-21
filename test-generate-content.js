const fetch = require("node-fetch");

async function testGenerateContent() {
  // Wait for emulator to start
  await new Promise(resolve => setTimeout(resolve, 5000));

  const url = "http://127.0.0.1:5001/ai-sensei-czu-pilot/europe-west1/generateContent";

  console.log("Testing Text Generation...");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          contentType: "text",
          promptData: { userPrompt: "Hello" }
        }
      })
    });
    const json = await res.json();
    console.log("Text Response:", JSON.stringify(json, null, 2));
  } catch (e) {
    console.error("Text Error:", e);
  }

  console.log("Testing Presentation Generation (JSON)...");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          contentType: "presentation",
          promptData: { userPrompt: "Hello", slide_count: "3" }
        }
      })
    });
    const json = await res.json();
    console.log("Presentation Response:", JSON.stringify(json, null, 2));
  } catch (e) {
    console.error("Presentation Error:", e);
  }
}

testGenerateContent();
