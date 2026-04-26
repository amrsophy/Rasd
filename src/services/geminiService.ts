import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface VerificationResult {
  playerName: string;
  birthDate: string;
  estimatedAge: number;
  confidence: number;
  matchStatus: "match" | "suspicious" | "mismatch";
  reasoning: string;
}

export async function verifyPlayer(
  birthCertificateBase64: string,
  playerPhotoBase64: string,
  language: "ar" | "en" = "ar"
): Promise<VerificationResult> {
  const model = "gemini-3-flash-preview";

  const prompt = `
    You are an expert in age verification for youth sports. 
    Analyze the provided birth certificate (OCR) and the player's photo (biological age estimation).
    
    1. Extract the player's full name and birth date from the birth certificate.
    2. Estimate the biological age of the player from the photo.
    3. Compare the paper age (from the certificate) with the estimated biological age.
    4. Provide a confidence score (0-100).
    5. Determine the match status:
       - "match": The ages are consistent.
       - "suspicious": There is a noticeable discrepancy (e.g., 2-3 years).
       - "mismatch": There is a significant discrepancy (e.g., >3 years) or signs of tampering.
    6. Provide a detailed reasoning in ${language === 'ar' ? 'Arabic' : 'English'}.
    
    Return the result in JSON format with the following keys:
    playerName, birthDate, estimatedAge, confidence, matchStatus, reasoning.
  `;

  const parts = [
    { text: prompt },
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: birthCertificateBase64,
      },
    },
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: playerPhotoBase64,
      },
    },
  ];

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
      },
    });

    const result = JSON.parse(response.text || "{}");
    return result as VerificationResult;
  } catch (error: any) {
    console.error("Error in verifyPlayer:", error);
    
    // Check for quota exceeded error
    if (error?.message?.includes("RESOURCE_EXHAUSTED") || error?.status === "RESOURCE_EXHAUSTED") {
      throw new Error("QUOTA_EXCEEDED");
    }
    
    throw new Error("VERIFICATION_FAILED");
  }
}
