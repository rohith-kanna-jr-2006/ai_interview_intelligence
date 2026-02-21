import { GoogleGenAI, Type } from "@google/genai";

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new GoogleGenAI({ apiKey });
};

export const analyzeResume = async (resumeText, jobDescription) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: `Analyze the following resume against the job description. 
    
    Your goal is to identify specific projects mentioned in the resume and generate deep, probing questions for each.
    
    Extract:
    1. Technical skills (languages, frameworks, tools).
    2. Soft skills (leadership, communication, problem-solving).
    3. Experience duration (total years).
    4. 3-5 specific probing questions. Each question MUST:
       - Reference a specific project or achievement from the resume.
       - Use the STAR method (Situation, Task, Action, Result) to probe for depth.
       - Challenge the candidate to explain their specific contribution vs the team's.
    5. A brief summary of the candidate's fit.
    
    Resume: ${resumeText}
    Job Description: ${jobDescription}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          technical_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
          soft_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
          experience_years: { type: Type.NUMBER },
          probing_questions: { type: Type.ARRAY, items: { type: Type.STRING } },
          summary: { type: Type.STRING }
        },
        required: ["technical_skills", "soft_skills", "experience_years", "probing_questions", "summary"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

export const evaluateResponse = async (
  question,
  answer,
  resumeContext,
  jobDescription,
  previousHistory
) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-1.5-pro",
    contents: `Evaluate the candidate's response to the interview question.
    
    Context:
    Resume: ${resumeContext}
    Job Description: ${jobDescription}
    History: ${previousHistory}
    
    Question: ${question}
    Candidate Answer: ${answer}
    
    Operational Guidelines:
    1. Score relevance (1-10).
    2. Tag sentiment (e.g., "Confident," "Struggling," "Articulate").
    3. Check for "Clarity" vs "Vagueness".
    4. Fraud Detection: If the answer is a direct verbatim match to common online definitions or AI-generated patterns, flag it as "Potential Scripted Response".
    5. Consistency: Note if logic is inconsistent with previous answers.
    6. DYNAMIC QUESTIONING: 
       - If the candidate's answer mentions a project from their resume, the "next_recommended_question" MUST be a deep dive into that specific project.
       - If the answer is vague, ask for a specific example from one of the projects listed in their resume.
       - Always prefer asking about real-world applications mentioned in their resume over theoretical questions.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          question_asked: { type: Type.STRING },
          candidate_response: { type: Type.STRING },
          scores: {
            type: Type.OBJECT,
            properties: {
              technical: { type: Type.NUMBER },
              relevance: { type: Type.NUMBER },
              communication: { type: Type.NUMBER }
            },
            required: ["technical", "relevance", "communication"]
          },
          sentiment: { type: Type.STRING },
          red_flags: { type: Type.ARRAY, items: { type: Type.STRING } },
          next_recommended_question: { type: Type.STRING }
        },
        required: ["question_asked", "candidate_response", "scores", "sentiment", "red_flags", "next_recommended_question"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

export const generateInitialQuestion = async (resumeData, jobDescription) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: `Based on the resume analysis and job description, generate a professional opening interview question.
    Resume Analysis: ${JSON.stringify(resumeData)}
    Job Description: ${jobDescription}`,
  });
  return response.text;
};
