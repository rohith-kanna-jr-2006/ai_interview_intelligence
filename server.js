import express from "express";
import { createServer as createViteServer } from "vite";
import { MongoClient } from "mongodb";
import path from "path";
import dotenv from "dotenv";
import multer from "multer";
import { analyzeResume, evaluateResponse, generateInitialQuestion, generateFinalReport, generateInterviewQuestions } from "./services/aiService.js";

dotenv.config();

const PORT = 3005;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const MONGODB_DB_NAME = "InterviewIq";

console.log("--- INTERVIEW IQ SERVER V3.0 (MongoDB ONLY) ---");

// MongoDB Global State
let mongoClient = null;
let db = null;

// Collections
let usersColl, resumesColl, interviewsColl, questionsColl, responsesColl, analysisColl, fraudColl, reportsColl, transcriptsColl;

async function initDatabases() {
  try {
    console.log("Connecting to MongoDB at:", MONGODB_URI);
    mongoClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    await mongoClient.connect();
    db = mongoClient.db(MONGODB_DB_NAME);

    // Initialize 8 Collections + Heritage Transcript
    usersColl = db.collection("users");
    resumesColl = db.collection("resumes");
    interviewsColl = db.collection("interviews");
    questionsColl = db.collection("questions");
    responsesColl = db.collection("responses");
    analysisColl = db.collection("ai_analysis");
    fraudColl = db.collection("fraud_detection");
    reportsColl = db.collection("final_reports");
    transcriptsColl = db.collection("transcripts");

    console.log("MongoDB connected and collections initialized.");

  } catch (error) {
    console.error("MongoDB initialization failed:", error);
    process.exit(1);
  }
}

async function startServer() {
  await initDatabases();

  const app = express();
  app.use(express.json());
  const upload = multer({ storage: multer.memoryStorage() });

  // --- Auth Endpoints ---
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { regNo, password } = req.body;
      const existingUser = await usersColl.findOne({ regNo: regNo.toUpperCase() });

      if (existingUser) {
        if (existingUser.password === password) {
          return res.json({ success: true, message: 'Already registered, logged in automatically.', user: existingUser });
        } else {
          return res.status(401).json({ error: 'Register number already exists with a different password.' });
        }
      }

      const user_id = 'u_' + Math.random().toString(36).substring(7);
      const newUser = {
        user_id,
        ...req.body,
        regNo: regNo.toUpperCase(),
        created_at: new Date()
      };
      await usersColl.insertOne(newUser);

      res.json({ success: true, message: 'Account created successfully.', user: newUser });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { regNo, password } = req.body;
      const user = await usersColl.findOne({ regNo: regNo.toUpperCase(), password });
      if (user) {
        res.json({ success: true, user });
      } else {
        res.status(401).json({ error: 'Invalid register number or password' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- User & Resume Endpoints ---
  app.post("/api/users", async (req, res) => {
    try {
      const userData = req.body;
      await usersColl.updateOne(
        { user_id: userData.user_id },
        { $set: { ...userData, created_at: new Date() } },
        { upsert: true }
      );
      res.json({ success: true, user_id: userData.user_id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/resumes", async (req, res) => {
    try {
      const resumeData = req.body;
      await resumesColl.updateOne(
        { resume_id: resumeData.resume_id },
        { $set: { ...resumeData, upload_date: new Date() } },
        { upsert: true }
      );
      res.json({ success: true, resume_id: resumeData.resume_id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Interview Endpoints ---
  app.get("/api/interviews", async (req, res) => {
    try {
      // Aggregate to get candidate name from users collection
      const rows = await interviewsColl.aggregate([
        {
          $lookup: {
            from: "users",
            localField: "user_id",
            foreignField: "user_id",
            as: "user"
          }
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            interview_id: 1,
            user_id: 1,
            job_role: 1,
            job_description: 1,
            interview_mode: 1,
            interview_language: 1,
            interview_duration: 1,
            interview_level: 1,
            status: 1,
            created_at: 1,
            candidate_name: "$user.name"
          }
        },
        { $sort: { created_at: -1 } }
      ]).toArray();
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/interviews", async (req, res) => {
    try {
      const interviewData = req.body;
      await interviewsColl.insertOne({
        ...interviewData,
        status: 'ongoing',
        created_at: new Date()
      });

      // Initialize transcription
      await transcriptsColl.insertOne({ interview_id: interviewData.interview_id, messages: [] });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- AI Logic Endpoints ---
  app.post("/api/ai/analyze-resume", async (req, res) => {
    try {
      const { resume_text, job_description } = req.body;
      const analysis = await analyzeResume(resume_text, job_description);
      res.json(analysis);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai/evaluate-response", async (req, res) => {
    try {
      const { question, answer, resumeContext, jobDescription, previousHistory, voiceMetrics } = req.body;
      const evaluation = await evaluateResponse(question, answer, resumeContext, jobDescription, previousHistory, voiceMetrics);
      res.json(evaluation);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai/generate-initial-question", async (req, res) => {
    try {
      const { resumeData, jobDescription } = req.body;
      const question = await generateInitialQuestion(resumeData, jobDescription);
      res.json({ question });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai/generate-questions-from-resume", upload.single("resume"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No resume file uploaded" });
      }
      const questionsData = await generateInterviewQuestions(req.file.buffer);
      res.json(questionsData);
    } catch (error) {
      console.error("Resume to Questions Error:", error);
      res.status(500).json({ error: "Failed to generate questions from resume" });
    }
  });

  app.get("/api/interviews/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const interview = await interviewsColl.aggregate([
        { $match: { interview_id: id } },
        {
          $lookup: {
            from: "users",
            localField: "user_id",
            foreignField: "user_id",
            as: "user"
          }
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } }
      ]).next();

      if (!interview) return res.status(404).json({ error: "Interview not found" });

      // Fetch resume
      const resume = await resumesColl.findOne(
        { user_id: interview.user_id },
        { sort: { upload_date: -1 } }
      );

      // Fetch transcript
      const transcriptDoc = await transcriptsColl.findOne({ interview_id: id });

      res.json({
        ...interview,
        candidate_name: interview.user?.name,
        resume_text: resume?.resume_text,
        extracted_skills: resume?.extracted_skills,
        analysis: resume?.analysis,
        messages: transcriptDoc?.messages || []
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/interviews/:id/messages", async (req, res) => {
    try {
      const { id } = req.params;
      const { role, content, evaluation, question_id, response_id } = req.body;

      // 1. Save to transcription
      const newMessage = {
        role,
        content,
        evaluation,
        created_at: new Date()
      };
      await transcriptsColl.updateOne(
        { interview_id: id },
        { $push: { messages: newMessage } }
      );

      // 2. Questions Tracking
      if (role === 'interviewer' && question_id) {
        await questionsColl.insertOne({
          question_id,
          interview_id: id,
          question_text: content,
          question_type: 'technical',
          created_at: new Date()
        });
      }

      // 3. Responses Tracking
      if (role === 'candidate' && response_id && question_id) {
        await responsesColl.insertOne({
          response_id,
          interview_id: id,
          question_id,
          candidate_answer: content,
          timestamp: new Date()
        });

        if (evaluation) {
          const analysis_id = Math.random().toString(36).substring(7);
          await analysisColl.insertOne({
            analysis_id,
            response_id,
            relevance_score: evaluation.scores?.relevance || 0,
            confidence_score: evaluation.scores?.technical || 0,
            sentiment_score: 0.5,
            emotion_detected: evaluation.sentiment || 'neutral',
            speech_clarity_score: 0.8, // Default or calculated
            created_at: new Date()
          });

          if (evaluation.red_flags?.length > 0) {
            const fraud_id = Math.random().toString(36).substring(7);
            await fraudColl.insertOne({
              fraud_id,
              interview_id: id,
              face_mismatch_flag: 0,
              multiple_face_detected: 0,
              tab_switch_count: 0,
              voice_anomaly: 0,
              suspicious_behavior_score: evaluation.red_flags.length * 0.1,
              fraud_alert: 'Yes',
              created_at: new Date()
            });
          }
        }
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/interviews/:id/finalize", async (req, res) => {
    try {
      const { id } = req.params;
      const { feedback_notes, isFraud } = req.body;

      // 1. Fetch interview details, transcript, and resume
      const interview = await interviewsColl.findOne({ interview_id: id });
      if (!interview) return res.status(404).json({ error: "Interview not found" });

      const resume = await resumesColl.findOne({ user_id: interview.user_id }, { sort: { upload_date: -1 } });
      const transcriptDoc = await transcriptsColl.findOne({ interview_id: id });
      const transcriptText = (transcriptDoc?.messages || []).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

      // 2. Aggregate fraud/metrics data
      const fraudCount = await fraudColl.countDocuments({ interview_id: id, fraud_alert: 'Yes' });
      const aggregatedMetrics = {
        total_fraud_flags: fraudCount,
        interview_mode: interview.interview_mode,
        duration: interview.interview_duration,
        feedback: feedback_notes || 'None'
      };

      // 3. Generate structured AI report
      let aiReport = await generateFinalReport(
        resume?.resume_text || "No resume provided",
        interview.job_description || "No job description",
        transcriptText,
        aggregatedMetrics
      );

      // 4. Overwrite scores if Fraud detected
      if (isFraud) {
        aiReport.overall_score = 0;
        aiReport.technical_score = 0;
        aiReport.communication_score = 0;
        aiReport.ai_recommendation = "Reject (Fraud)";
        aiReport.detailed_feedback = "Interview terminated automatically due to maximum fraud risk (100%).";
      }

      // 5. Save report
      const report_id = 'rep_' + Math.random().toString(36).substring(7);
      await reportsColl.insertOne({
        report_id,
        interview_id: id,
        overall_score: aiReport.overall_score || 0,
        technical_score: aiReport.technical_score || 0,
        communication_score: aiReport.communication_score || 0,
        strengths: aiReport.strengths || [],
        weaknesses: aiReport.weaknesses || [],
        fraud_risk_level: isFraud ? 'Maximum' : (fraudCount > 0 ? 'High' : 'Low'),
        fraud_analysis: isFraud ? "Maximum risk score reached (100%)." : (aiReport.fraud_analysis || "No flags mentioned"),
        ai_recommendation: aiReport.ai_recommendation || "Review",
        detailed_feedback: aiReport.detailed_feedback || "No feedback generated",
        generated_at: new Date()
      });

      // 6. Update interview status
      await interviewsColl.updateOne(
        { interview_id: id },
        { $set: { status: isFraud ? 'terminated' : 'completed' } }
      );

      res.json({ success: true, report_id });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

