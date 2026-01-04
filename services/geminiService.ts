
import { GoogleGenAI } from "@google/genai";
import { SensorData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeFallEvent = async (data: SensorData[]): Promise<string> => {
  try {
    const formattedData = data.map(d => 
      `T: ${d.time}, G: ${d.magnitude.toFixed(2)}, HR: ${d.hr}bpm, SpO2: ${d.spo2}%`
    ).join('\n');
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `
        Analyze this multi-modal sensor telemetry from a LifeLink wearable device during a suspected fall. 
        Evaluate the kinematic impact (G-force) alongside biometric trends (Heart Rate and Oxygen Saturation).
        
        Determine if the physiological data (e.g., tachycardia or SpO2 dip) suggests a medical emergency (e.g., syncope, respiratory distress) or just a mechanical trip.
        
        Data:
        ${formattedData}
      `,
      config: {
        systemInstruction: "You are an expert bio-mechanical and clinical analyst for LifeLink. Provide concise, high-priority forensic summaries. Focus on the relationship between movement and vitals.",
        temperature: 0.7,
      }
    });

    return response.text || "Analysis unavailable.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Error generating analysis. Vitals and impact data are being reviewed manually.";
  }
};
