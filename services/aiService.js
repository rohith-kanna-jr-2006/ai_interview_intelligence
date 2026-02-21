import { GoogleGenAI, Type } from "@google/genai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import pdf from "pdf-parse";
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
      
      User Message: 
      Resume: ${resumeText}
      Job Description: ${jobDescription}
      
      Formatting Instructions & Information Extraction (NER):
      1. Technical & Soft Skills: Classify tools into 'technical_skills' vs 'soft_skills'.
      2. Experience: Extract 'experience_years' as a number.
      3. Questions Synthesis (Generate at least 2 for each):
         - resume_based_questions: Project validation questions asking "How did you handle X in your particular project Y?"
         - technical_questions: Technical deep-dive based on the identified entities and experience scaling.
         - hr_questions: General HR/cultural questions.
         - scenario_based_questions: Problem-solving challenges fitting the role.
      4. Summary: Summarize Candidate fit.
      Output pure JSON according to the schema provided.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        technical_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
                        soft_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
                        experience_years: { type: Type.NUMBER },
                        probing_questions: { type: Type.ARRAY, items: { type: Type.STRING } }, // kept for backward compatibility
                        resume_based_questions: { type: Type.ARRAY, items: { type: Type.STRING } },
                        technical_questions: { type: Type.ARRAY, items: { type: Type.STRING } },
                        hr_questions: { type: Type.ARRAY, items: { type: Type.STRING } },
                        scenario_based_questions: { type: Type.ARRAY, items: { type: Type.STRING } },
                        summary: { type: Type.STRING }
                    },
                    required: ["technical_skills", "soft_skills", "experience_years", "resume_based_questions", "technical_questions", "hr_questions", "scenario_based_questions", "summary"]
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

export const evaluateResponse = async (question, answer, resumeContext, jobDescription, previousHistory, voiceMetrics = null) => {
    try {
        let voiceMetricsText = "";
        if (voiceMetrics) {
            const responseTimeStr = voiceMetrics.firstWordTime ? ((voiceMetrics.firstWordTime - voiceMetrics.startTime) / 1000).toFixed(1) + "s" : "N/A";
            voiceMetricsText = `\nVoice Metrics Detected: \n- Initial Response Time: ${responseTimeStr}\n- Number of Pauses/Hesitations (>2s): ${voiceMetrics.pauses}\nUse these metrics to provide Voice Confidence Analysis, Tone Detection, and Pause & Hesitation Detection in your feedback.`;
        }

        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: `${AI_PROMPTS.EVALUATION_ENGINE}
      
      Context:
      Resume: ${resumeContext}
      Job Description: ${jobDescription}
      History: ${previousHistory}
      
      Question: ${question}
      Candidate Answer: ${answer}
      ${voiceMetricsText}
      
      Operational Guidelines & Chat Flow:
      Follow a structured conversation: Greeting -> Resume-based -> Technical -> Behavioral (Scenario/HR) -> Closing.
      Evaluate the candidate's answer and decide which phase of the interview we are currently in based on the History.
      Based on the progression, formulate the *next_recommended_question* to advance the interview. 
      CRITICAL: For the next_recommended_question, you MUST combine multiple specific points from the Resume Context (e.g. asking about two specific skills or a specific project constraint). DO NOT ask generic questions like "Tell me about your experience." Instead, ask something like: "Your resume mentions Project X using technology Y. Can you explain the specific challenges you faced regarding Z?"
      If answers are incomplete, ask follow-up questions instead of moving immediately to the next topic.
      
      1. Score relevance (1-10).
      2. Tag sentiment (e.g., "Confident", "Struggling", "Articulate").
      3. ${AI_PROMPTS.FRAUD_MONITORING} If the answer is a verbatim match to online definitions, flag it as "Potential Scripted Response".
      4. DYNAMIC QUESTIONING: Always maintain formal conversation and encourage the candidate.
      5. Include voice analysis (tone detection, fluency based on pauses explicitly in tone_analysis and fluency_report).`,
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
                                communication: { type: Type.NUMBER },
                                confidence: { type: Type.NUMBER, description: "Voice Confidence Score (1-10) based on metrics" }
                            },
                            required: ["technical", "relevance", "communication"]
                        },
                        sentiment: { type: Type.STRING },
                        tone_analysis: { type: Type.STRING, description: "Tone detection result" },
                        fluency_report: { type: Type.STRING, description: "Fluency based on pauses and hesitations" },
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

export const generateFinalReport = async (resumeContext, jobDescription, interviewHistory, aggregatedMetrics) => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: `${AI_PROMPTS.REPORT_GENERATOR}
      
      Context:
      Resume: ${resumeContext}
      Job Description: ${jobDescription}
      
      Interview Transcript & Evaluations:
      ${interviewHistory}
      
      Aggregated System Metrics:
      ${JSON.stringify(aggregatedMetrics, null, 2)}
      
      Format the output as a precise, professional JSON object with these sections:
      1. overall_score (numeric 1-10)
      2. technical_score (numeric 1-10)
      3. communication_score (numeric 1-10)
      4. strengths (array of strings)
      5. weaknesses (array of strings)
      6. fraud_analysis (string summarizing integrity/fraud alerts from the transcript/metrics)
      7. ai_recommendation (enum: "Hire", "Reject", "Review")
      8. detailed_feedback (string summarizing the candidate's performance)
      `,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        overall_score: { type: Type.NUMBER },
                        technical_score: { type: Type.NUMBER },
                        communication_score: { type: Type.NUMBER },
                        strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                        weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
                        fraud_analysis: { type: Type.STRING },
                        ai_recommendation: { type: Type.STRING },
                        detailed_feedback: { type: Type.STRING }
                    },
                    required: ["overall_score", "technical_score", "communication_score", "strengths", "weaknesses", "fraud_analysis", "ai_recommendation", "detailed_feedback"]
                }
            }
        });

        return JSON.parse(response.text || "{}");
    } catch (e) {
        console.error("generateFinalReport error", e);
        return {
            overall_score: 5, technical_score: 5, communication_score: 5,
            strengths: ["Completed interview"], weaknesses: ["Could not generate full report"],
            fraud_analysis: "No data", ai_recommendation: "Review", detailed_feedback: "Error generating report"
        };
    }
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const generateInterviewQuestions = async (resumeBuffer) => {
    try {
        // 1. Extract Text from the PDF Buffer
        const data = await pdf(resumeBuffer);
        const resumeText = data.text;

        // 2. Access the Gemini Model (Flash is recommended for speed/cost)
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // 3. Construct the Master Prompt
        const prompt = `
      You are an intelligent AI Interviewer for a MERN stack application.
      Analyze the following resume text and return a structured JSON response.
      
      Resume Text: ${resumeText}

      Return exactly this JSON format:
      {
        "candidate_name": "Name",
        "experience_level": "Beginner/Intermediate/Advanced",
        "questions": [
          { "type": "Technical", "question": "...", "reason": "Based on [Skill]" },
          { "type": "Project-based", "question": "...", "reason": "Based on [Project Name]" },
          { "type": "HR", "question": "...", "reason": "Behavioral assessment" }
        ]
      }
    `;

        // 4. Generate Content
        const result = await model.generateContent(prompt);
        const response = await result.response;

        // Clean and parse the JSON response
        const jsonString = response.text().replace(/```json|```/g, "");
        const parsedData = JSON.parse(jsonString);
        return {
            ...parsedData,
            rawText: resumeText
        };

    } catch (error) {
        console.error("Error generating questions:", error);
        throw error;
    }
};
