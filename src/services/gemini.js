export const analyzeResume = async (resumeText, jobDescription) => {
  try {
    const response = await fetch('/api/ai/analyze-resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume_text: resumeText, job_description: jobDescription })
    });
    return await response.json();
  } catch (error) {
    console.error(error);
    return {
      technical_skills: [], soft_skills: [], experience_years: 0, probing_questions: [], summary: "Error"
    };
  }
};

export const evaluateResponse = async (question, answer, resumeContext, jobDescription, previousHistory, voiceMetrics = null) => {
  try {
    const response = await fetch('/api/ai/evaluate-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, answer, resumeContext, jobDescription, previousHistory, voiceMetrics })
    });
    return await response.json();
  } catch (error) {
    console.error(error);
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
    const response = await fetch('/api/ai/generate-initial-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeData, jobDescription })
    });
    const data = await response.json();
    return data.question;
  } catch (error) {
    console.error(error);
    return "Can you walk me through your resume?";
  }
};
