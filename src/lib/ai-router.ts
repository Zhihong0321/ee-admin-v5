import { GoogleGenAI } from "@google/genai";
import { logSyncActivity } from "./logger";

/**
 * AI API Router for UniAPI
 * Defaults to gemini-3-flash-preview as requested.
 */

const UNIAPI_KEY = process.env.UNIAPI_KEY || "sk-0DKo24DHKjaQb6D_iL6HjeN8WORuuA5c_Qmcz7v9VvKYa5BFwcBgYZeMOVQ";
const BASE_URL = "https://api.uniapi.io/gemini";

// Initialize the UniAPI Gemini client
const ai = new GoogleGenAI({
  apiKey: UNIAPI_KEY,
  httpOptions: {
    baseUrl: BASE_URL,
  },
});

export async function generateWithGemini(
  prompt: string, 
  options: { 
    model?: string; 
    temperature?: number;
    file?: {
      mimeType: string;
      data: string; // base64
    }
  } = {}
) {
  const modelName = options.model || "gemini-3-flash-preview";
  
  try {
    logSyncActivity(`AI Router: Calling model ${modelName} ${options.file ? 'with attachment' : ''}`, "INFO");
    
    const parts: any[] = [{ text: prompt }];
    
    if (options.file) {
      parts.push({
        inlineData: {
          mimeType: options.file.mimeType,
          data: options.file.data
        }
      });
    }

    // Using the schema from UniAPI documentation for @google/genai
    const result = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts }],
      // @ts-ignore - temperature might not be in the basic type definition for this specific SDK version but is usually supported
      generationConfig: {
        temperature: options.temperature ?? 0.1, // Lower temperature for extraction tasks
      }
    });

    const responseText = result.text;
    
    if (!responseText) {
      throw new Error("Empty response from AI model");
    }

    return responseText;
  } catch (error: any) {
    logSyncActivity(`AI Router Error (${modelName}): ${error.message}`, "ERROR");
    console.error(`[AI Router Error]`, error);
    throw error;
  }
}

/**
 * Convenience wrapper for gemini-3-flash-preview
 */
export async function gemini3Flash(prompt: string, temperature?: number) {
  return generateWithGemini(prompt, { model: "gemini-3-flash-preview", temperature });
}
