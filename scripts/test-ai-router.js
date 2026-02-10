/**
 * Test script for AI API Router
 */
const { GoogleGenAI } = require("@google/genai");

async function testRouter() {
  const UNIAPI_KEY = process.env.UNIAPI_KEY || "sk-0DKo24DHKjaQb6D_iL6HjeN8WORuuA5c_Qmcz7v9VvKYa5BFwcBgYZeMOVQ";
  const BASE_URL = "https://api.uniapi.io/gemini";
  const MODEL = "gemini-3-flash-preview";

  console.log(`Connecting to UniAPI at ${BASE_URL}...`);
  console.log(`Using model: ${MODEL}`);

  const ai = new GoogleGenAI({
    apiKey: UNIAPI_KEY,
    httpOptions: {
      baseUrl: BASE_URL,
    },
  });

  try {
    const result = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: "Hello, who are you? Please respond in one short sentence." }] }],
    });

    console.log("\nResponse from AI:");
    console.log(result.text);
    console.log("\n✅ Test successful!");
  } catch (error) {
    console.error("\n❌ Test failed!");
    console.error(error.message);
    if (error.response) {
      console.error("Response data:", error.response.data);
    }
  }
}

testRouter();