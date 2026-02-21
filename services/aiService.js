import { GoogleGenAI, Type } from "@google/genai";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Initialize the Google Gen AI SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const modelName = 'gemini-2.5-flash';

import { AI_PROMPTS } from '../src/utils/prompts.js';

export const analyzeResume = async (resumeText, jobDescription) => {
    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: `${AI_PROMPTS.QUESTION_GENERATOR}
      
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
    } catch (e) {
        console.error("analyzeResume error", e);
        return {
            technical_skills: [], soft_skills: [], experience_years: 0, probing_questions: [], summary: "Error"
        };
    }
};

export const evaluateResponse = async (question, answer, resumeContext, jobDescription, previousHistory) => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: `${AI_PROMPTS.EVALUATION_ENGINE}
      
      Context:
      Resume: ${resumeContext}
      Job Description: ${jobDescription}
      History: ${previousHistory}
      
      Question: ${question}
      Candidate Answer: ${answer}
      
      Operational Guidelines:
      1. Score relevance (1-10).
      2. Tag sentiment (e.g., "Confident", "Struggling", "Articulate").
      3. ${AI_PROMPTS.FRAUD_MONITORING} If the answer is a direct verbatim match to common online definitions or AI-generated patterns, flag it as "Potential Scripted Response" in red_flags.
      4. DYNAMIC QUESTIONING: 
         - If the candidate's answer mentions a project from their resume, the "next_recommended_question" MUST be a deep dive into that specific project.
         - If the answer is vague, ask for a specific example from one of the projects listed in their resume.`,
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
    } catch (e) {
        console.error("evaluateResponse error", e);
        return {
            question_asked: question,
            candidate_response: answer,
            scores: { technical: 5, relevance: 5, communication: 5 },
            sentiment: "neutral",
            red_flags: [],
            next_recommended_question: "Could you tell me more about your experience?"
        };
    }
};

export const generateInitialQuestion = async (resumeData, jobDescription) => {
    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: `${AI_PROMPTS.CHAT_INTERVIEWER}
      Based on the resume analysis and job description, generate a professional opening interview question.
      Resume Analysis: ${JSON.stringify(resumeData)}
      Job Description: ${jobDescription}`,
        });
        return response.text;
    } catch (e) {
        console.error("generateInitialQuestion error", e);
        return "Can you walk me through your resume?";
    }
};
