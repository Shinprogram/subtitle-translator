// Gemma provider. Uses the same Google AI Studio endpoint as Gemini, but
// Gemma models do NOT support the `systemInstruction` field — passing it
// produces "Developer instruction is not enabled". So we fold the system
// prompt into the user message instead.
//
// Ref: https://ai.google.dev/gemma/docs/integrations/api  (Gemma serving notes)

import type { AiProvider, GenerateInput } from "../types";
import { callGenerateContent } from "./google-shared";

export const gemmaProvider: AiProvider = {
  id: "gemma",
  async generate(input: GenerateInput): Promise<string> {
    // Gemma is most reliable when the directive lives in a clearly-marked
    // preamble followed by the lines to translate. Keep this terse: smaller
    // Gemma variants can drift on long system prompts.
    const merged =
      `${input.systemInstruction.trim()}\n\n` +
      `--- BEGIN INPUT ---\n${input.userText}\n--- END INPUT ---`;

    return callGenerateContent({
      apiKey: input.apiKey,
      model: input.model,
      signal: input.signal,
      body: {
        contents: [{ role: "user", parts: [{ text: merged }] }],
        generationConfig: {
          temperature: input.temperature ?? 0.3,
          responseMimeType: "text/plain",
        },
      },
    });
  },
};
