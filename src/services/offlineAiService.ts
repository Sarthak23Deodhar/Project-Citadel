import { CreateMLCEngine, MLCEngine } from "@mlc-ai/web-llm";
import { TriageResult } from "./aiService";

let engine: MLCEngine | null = null;
let isInitializing = false;

// We use Gemma-2B IT as requested
const MODEL_ID = "gemma-2b-it-q4f32_1-MLC"; // Try smaller model for speed

export async function initOfflineModel(onProgress: (info: {text: string, progress: number}) => void): Promise<void> {
  if (engine) return;
  if (isInitializing) return;
  isInitializing = true;
  
  try {
    engine = await CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (progress) => {
        onProgress({ text: progress.text, progress: progress.progress });
      }
    });
  } catch (error) {
    console.error("Failed to initialize offline model", error);
    isInitializing = false;
    throw error;
  }
  isInitializing = false;
}

export async function processOfflineTriage(symptoms: string): Promise<TriageResult> {
  if (!engine) {
    throw new Error("Offline engine not initialized");
  }

  const prompt = `You are a Medical Triage Assistant. Determine the Emergency Severity Index (ESI) from 1 to 5.
1: Immediate life-saving intervention.
2: High risk situation.
3: Danger zone vitals, multiple resources.
4: One resource needed.
5: No resources needed.

Strictly output JSON only:
{"esiScore": number, "specialty": "string", "firstAidGuidance": ["string","string"]}

Symptoms: ${symptoms}`;

  const reply = await engine.chat.completions.create({
    messages: [
      { role: "user", content: prompt }
    ],
    temperature: 0.1,
  });

  const text = reply.choices[0].message.content || "";
  
  // Extract JSON output
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  let esiScore = 5;
  let specialty = "General";
  let firstAidGuidance: string[] | undefined = undefined;

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      esiScore = parsed.esiScore || 5;
      specialty = parsed.specialty || "General";
      firstAidGuidance = parsed.firstAidGuidance;
    } catch (e) {
      console.error("Failed to parse triage JSON", e);
    }
  }

  return { reasoning: text, esiScore, specialty, firstAidGuidance };
}

export async function sendOfflineChatMessage(messages: {role: "user" | "assistant" | "system", content: string}[]): Promise<string> {
  if (!engine) {
    throw new Error("Offline engine not initialized");
  }

  const reply = await engine.chat.completions.create({
    messages,
    temperature: 0.5,
  });

  return reply.choices[0].message.content || "";
}

export function isOfflineEngineReady() {
  return engine !== null;
}
