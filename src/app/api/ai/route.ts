import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getUserFromRequest } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { prompt, context, action } = await request.json();
    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      // Mock / fallback response with smart templates for testing
      const lowerPrompt = (prompt || "").toLowerCase();
      const lowerContext = (context || "").toLowerCase();
      
      let mockResponse = "";
      
      if (action === "autocomplete") {
        mockResponse = " This is an AI-generated autocomplete suggestion based on your context. (Add GEMINI_API_KEY to .env for live AI)";
      } else if (action === "summarize") {
        mockResponse = "### Document Summary (Fallback Mode)\n\n- **Primary Subject**: " + (context ? context.substring(0, 30) + "..." : "No context provided") + "\n- **Key Insight**: Collaborative document canvas utilizing Lamport clocks and IndexedDB.\n- **Action Item**: Configure the `GEMINI_API_KEY` in your `.env` file to enable real summaries.";
      } else if (action === "rewrite") {
        if (lowerPrompt.includes("m340i") || lowerPrompt.includes("car")) {
          mockResponse = "### BMW M340i Executive Summary\n\nThe **BMW M340i** is a premier sports sedan powered by the legendary 3.0-liter turbocharged B58 inline-six engine. Delivering **382 horsepower** and 369 lb-ft of torque, it achieves 0-60 mph in a blistering 3.8 seconds. Features include an intelligent xDrive AWD system, M Sport tuning, and exceptional daily usability.";
        } else if (lowerPrompt.includes("edtech") || lowerPrompt.includes("education")) {
          mockResponse = "### EdTech Innovation Insights\n\nEducational technology (EdTech) leverages software, hardware, and collaborative platforms to deliver personalized, accessible, and high-impact learning models globally.";
        } else {
          mockResponse = `[Polished Version] "${context || prompt}"\n\n*(To activate live generation with your prompt "${prompt}", please configure the 'GEMINI_API_KEY' inside the project's '.env' file)*`;
        }
      }
      return NextResponse.json({ text: mockResponse });
    }

    // Live Google Gemini API Integration
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    let systemPrompt = "";
    let finalPrompt = "";

    if (action === "autocomplete") {
      systemPrompt = "You are a professional writing assistant. Keep completion short, maximum 2-3 sentences. Return only the completion text.";
      finalPrompt = `Context:\n${context}\n\nUser Prompt: ${prompt || "Continue writing"}\n\nCompletion:`;
    } else if (action === "summarize") {
      systemPrompt = "You are a professional summarizer. Provide a concise, bulleted markdown summary of the text provided.";
      finalPrompt = `Summarize the following document content:\n\n${context}`;
    } else if (action === "rewrite") {
      systemPrompt = "You are an expert editor. Rewrite the text according to the user request. Keep the format clean.";
      finalPrompt = `Text to rewrite:\n"${context}"\n\nRewrite Request/Instruction: ${prompt}\n\nRewritten text:`;
    }

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${finalPrompt}` }] }],
    });

    const responseText = result.response.text();
    return NextResponse.json({ text: responseText });
  } catch (error: any) {
    console.error("AI API Error:", error);
    return NextResponse.json({ error: error.message || "Failed to query AI model" }, { status: 500 });
  }
}
