import OpenAI from "openai";

export function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
}

export function getDefaultModel() {
  return process.env.OPENAI_MODEL || "";
}
