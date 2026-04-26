import { GoogleGenAI, GenerateContentResponse, Type, ThinkingLevel } from "@google/genai";

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
  const model = "gemini-3.1-pro-preview";

  const prompt = `
    You are an AI specialized in forensic document analysis and biological age estimation for youth sports.
    
    TASK 1: BIRTH CERTIFICATE OCR
    Carefully examine the first image (Birth Certificate).
    - Extract the FULL LEGAL NAME of the child. Be precise with characters (especially in Arabic).
    - Extract the DATE OF BIRTH. Pay attention to both the numerical format and any written-out dates.
    - Look for signs of tampering, inconsistent fonts, or overlapping text around the name and date.
    - If the document is in Arabic, use your advanced knowledge of official certificate layouts (e.g., Egyptian or regional birth certificates).

    TASK 2: BIOLOGICAL AGE ESTIMATION 
    Carefully examine the second image (Player Photo).
    - Estimate the biological age based on facial features, bone structure (if visible), and overall physical development.
    - Consider the context of a "youth" player.

    TASK 3: COMPARISON AND ANALYSIS
    - Compare the birth year from the certificate with your biological age estimate.
    - Calculate the absolute difference.
    - Assign a match status:
        - "match": Consistent biological age (difference <= 1.5 years).
        - "suspicious": Notable discrepancy (difference between 2 and 3 years).
        - "mismatch": Significant discrepancy (difference > 3 years) or obvious document tampering.

    REASONING:
    Explain your findings clearly in ${language === 'ar' ? 'Arabic' : 'English'}. Mention specific details observed in both the document and the photo.
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
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            playerName: { type: Type.STRING, description: "The full name of the player extracted from the certificate." },
            birthDate: { type: Type.STRING, description: "The date of birth in YYYY-MM-DD format." },
            estimatedAge: { type: Type.NUMBER, description: "The estimated biological age in years." },
            confidence: { type: Type.NUMBER, description: "Confidence score from 0 to 100." },
            matchStatus: { 
              type: Type.STRING, 
              enum: ["match", "suspicious", "mismatch"],
              description: "The result of comparing the certificate to the photo."
            },
            reasoning: { type: Type.STRING, description: "Detailed explanation of the analysis." }
          },
          required: ["playerName", "birthDate", "estimatedAge", "confidence", "matchStatus", "reasoning"]
        },
        temperature: 0,
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
      },
    });

    const text = response.text;
    if (!text) throw new Error("EMPTY_RESPONSE");
    
    return JSON.parse(text) as VerificationResult;
  } catch (error: any) {
    console.error("Error in verifyPlayer:", error);
    
    // Check for quota exceeded error
    if (error?.message?.includes("RESOURCE_EXHAUSTED") || error?.status === "RESOURCE_EXHAUSTED") {
      throw new Error("QUOTA_EXCEEDED");
    }
    
    throw new Error("VERIFICATION_FAILED");
  }
}
