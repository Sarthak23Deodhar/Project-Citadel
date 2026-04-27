import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
// Initialize the AI client. In a real app, you might want to handle missing API keys gracefully.
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export interface TriageResult {
  reasoning: string;
  esiScore: number;
  specialty?: string;
  firstAidGuidance?: string[];
}

export async function processTriage(symptoms: string, mediaBase64?: string, mediaMimeType?: string): Promise<TriageResult> {
  if (!ai) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  const prompt = `<|think|> You are a Medical Triage Assistant. Determine the Emergency Severity Index (ESI) from 1 to 5.
1: Immediate life-saving intervention required.
2: High risk situation, confused/lethargic/disoriented, or severe pain/distress.
3: Danger zone vitals, multiple resources needed.
4: One resource needed.
5: No resources needed.

Given the symptoms and any provided imagery, provide your internal clinical reasoning starting immediately.
Once you have reasoned, strictly output the final result in JSON format on a new line without markdown formatting:
{"esiScore": number, "specialty": "string", "firstAidGuidance": ["string"]}
Include 2-3 short, specific first-aid steps in firstAidGuidance.

Symptoms: ${symptoms}`;

  const contents: any[] = [prompt];
  
  if (mediaBase64 && mediaMimeType) {
    contents.push({
      inlineData: {
        data: mediaBase64,
        mimeType: mediaMimeType
      }
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: contents,
  });

  const text = response.text || "";
  
  // Extract JSON output at the end
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  let esiScore = 5;
  let specialty = "General";
  let reasoning = text;
  let firstAidGuidance: string[] | undefined = undefined;

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      esiScore = parsed.esiScore || 5;
      specialty = parsed.specialty || "General";
      firstAidGuidance = parsed.firstAidGuidance;
      reasoning = text.replace(jsonMatch[0], "").trim();
    } catch (e) {
      console.error("Failed to parse triage JSON", e);
    }
  }

  return { reasoning, esiScore, specialty, firstAidGuidance };
}

export async function processSupportChat(message: string, history: {role: "user" | "model", content: string}[] = []): Promise<string> {
  if (!ai) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  const systemInstruction = `You are the Citadel Support Bot. You help users understand the Citadel emergency response application.
Citadel features:
- Citizen View: Report emergencies (SOS), capture symptoms and photos, offline AI triage, view offline first-aid guides, chat with AI assistant.
- Doctor View: Review incoming triage requests, dispatch resources, mark records as resolved, coordinate in real-time.
- NGO View: View broad statistics of emergencies to coordinate logistics and resources.
- Admin View: Manage verified user statuses.

Disaster Response Protocols:
- If a user reports life-threatening emergencies, advise them to use the SOS button immediately and seek a safe place.
- You can explain how to use the app, but you do NOT provide clinical triage yourself; that is for the Triage Assistant.
- Respond concisely, politely, and use markdown where appropriate.`;

  const formattedHistory = history.map(msg => ({
    role: msg.role === "user" ? "user" : "model",
    parts: [{ text: msg.content }]
  }));

  try {
    const chat = ai.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction,
      }
    });

    // Unfortunately, the @google/genai SDK doesn't natively accept a full history in 'create' easily in old ways,
    // actually it does if we use the history array but let's just pass the history via messages for the new message.
    // Let's use standard generateContent with history if it's easier, or the chats API.
    
    // Instead of using chats, let's just formulate a combined prompt to not mess up SDK versions.
    const fullHistoryStr = history.map(h => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`).join("\n");
    const prompt = `${systemInstruction}\n\nHistory:\n${fullHistoryStr}\n\nUser: ${message}\nAssistant:`;
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    
    return response.text || "I'm sorry, I couldn't generate a response at this time.";
  } catch (error) {
    console.error("Support Chat Error:", error);
    return "I'm experiencing connectivity issues right now. If it's an emergency, please use the SOS button.";
  }
}

export async function verifyMedicalLicense(idText: string): Promise<boolean> {
  if (!ai) {
    throw new Error("GEMINI_API_KEY is not set.");
  }
  
  const prompt = `Analyze this simulated OCR text from a medical license: "${idText}". 
Does it look like a valid identity? Just return "VALID" or "INVALID".`;
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  return response.text?.includes("VALID") ?? false;
}
