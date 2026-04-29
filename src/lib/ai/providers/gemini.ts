// Gemini provider. Uses Google's generativelanguage.googleapis.com endpoint
// and the standard `systemInstruction` + `contents` request shape.

import type { AiProvider, GenerateInput } from "../types";
import { callGenerateContent } from "./google-shared";

export const geminiProvider: AiProvider = {
  id: "gemini",
  async generate(input: GenerateInput): Promise<string> {
    return callGenerateContent({
      apiKey: input.apiKey,
      model: input.model,
      signal: input.signal,
      body: {
        systemInstruction: {
          role: "system",
          parts: [{ text: input.systemInstruction }],
        },
        contents: [{ role: "user", parts: [{ text: input.userText }] }],
        generationConfig: {
          temperature: input.temperature ?? 0.6,
          responseMimeType: "text/plain",
        },
      },
    });
  },
};
