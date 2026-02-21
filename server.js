import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { MongoClient } from "mongodb";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const PORT = 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const MONGODB_DB_NAME = "InterviewIq";

// Database connections
let db_sqlite = null;
let mongoClient = null;

async function initDatabases() {
  try {
    // SQLite Initialization
    db_sqlite = new Database("interview_iq.db");

    // 1. Users Table
    db_sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        role TEXT CHECK(role IN ('candidate', 'interviewer', 'admin')) DEFAULT 'candidate',
        password_hash TEXT,
        profile_photo_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Resume Table
    db_sqlite.exec(`
      CREATE TABLE IF NOT EXISTS resumes (
        resume_id TEXT PRIMARY KEY,
        user_id TEXT,
        resume_file_path TEXT,
        resume_text TEXT,
        extracted_skills TEXT,
        experience_years REAL,
        education TEXT,
        upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(user_id)
      )
    `);

    // 3. Job & Interview Table
    db_sqlite.exec(`
      CREATE TABLE IF NOT EXISTS interviews (
        interview_id TEXT PRIMARY KEY,
        user_id TEXT,
        job_role TEXT,
        job_description TEXT,
        interview_mode TEXT CHECK(interview_mode IN ('AI', 'Manual', 'Hybrid')),
        interview_language TEXT DEFAULT 'English',
        interview_date DATETIME,
        interview_duration INTEGER,
        interview_level TEXT,
        status TEXT CHECK(status IN ('scheduled', 'ongoing', 'completed')) DEFAULT 'scheduled',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(user_id)
      )
    `);

    // 4. Questions Table
    db_sqlite.exec(`
      CREATE TABLE IF NOT EXISTS questions (
        question_id TEXT PRIMARY KEY,
        interview_id TEXT,
        question_text TEXT NOT NULL,
        question_type TEXT CHECK(question_type IN ('technical', 'HR', 'resume-based')),
        difficulty_level TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(interview_id) REFERENCES interviews(interview_id)
      )
    `);

    // 5. Responses Table
    db_sqlite.exec(`
      CREATE TABLE IF NOT EXISTS responses (
        response_id TEXT PRIMARY KEY,
        interview_id TEXT,
        question_id TEXT,
        candidate_answer TEXT,
        audio_file_path TEXT,
        video_file_path TEXT,
        response_time INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(interview_id) REFERENCES interviews(interview_id),
        FOREIGN KEY(question_id) REFERENCES questions(question_id)
      )
    `);

    // 6. AI Analysis Table
    db_sqlite.exec(`
      CREATE TABLE IF NOT EXISTS ai_analysis (
        analysis_id TEXT PRIMARY KEY,
        response_id TEXT,
        relevance_score REAL,
        confidence_score REAL,
        sentiment_score REAL,
        emotion_detected TEXT,
        speech_clarity_score REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(response_id) REFERENCES responses(response_id)
      )
    `);

    // 7. Fraud Detection Table
    db_sqlite.exec(`
      CREATE TABLE IF NOT EXISTS fraud_detection (
        fraud_id TEXT PRIMARY KEY,
        interview_id TEXT,
        face_mismatch_flag INTEGER DEFAULT 0,
        multiple_face_detected INTEGER DEFAULT 0,
        tab_switch_count INTEGER DEFAULT 0,
        voice_anomaly INTEGER DEFAULT 0,
        suspicious_behavior_score REAL,
        fraud_alert TEXT CHECK(fraud_alert IN ('Yes', 'No')) DEFAULT 'No',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(interview_id) REFERENCES interviews(interview_id)
      )
    `);

    // 8. Final Report Table
    db_sqlite.exec(`
      CREATE TABLE IF NOT EXISTS final_reports (
        report_id TEXT PRIMARY KEY,
        interview_id TEXT,
        overall_score REAL,
        technical_score REAL,
        communication_score REAL,
        confidence_score REAL,
        fraud_risk_level TEXT,
        ai_recommendation TEXT CHECK(ai_recommendation IN ('Hire', 'Reject', 'Review')),
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(interview_id) REFERENCES interviews(interview_id)
      )
    `);

    console.log("SQLite connected and initialized with 8-table normalized schema.");

    // MongoDB Initialization
    console.log("Connecting to MongoDB at:", MONGODB_URI);
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    console.log("MongoDB connected.");

  } catch (error) {
    console.error("Database initialization failed:", error);
  }
}

async function startServer() {
  await initDatabases();

  const app = express();
  app.use(express.json());

  const db = mongoClient?.db(MONGODB_DB_NAME);
  const resumesColl = db?.collection("resumes");
  const transcriptsColl = db?.collection("transcripts");

  // --- User & Resume Endpoints ---
  app.post("/api/users", async (req, res) => {
    try {
      const { user_id, name, email, phone, role, password_hash } = req.body;
      if (!db_sqlite) throw new Error("SQLite not connected");
      db_sqlite.prepare(
        "INSERT INTO users (user_id, name, email, phone, role, password_hash) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(user_id, name, email, phone, role, password_hash);
      res.json({ success: true, user_id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/resumes", async (req, res) => {
    try {
      const { resume_id, user_id, resume_text, extracted_skills, experience_years, education } = req.body;
      if (!db_sqlite) throw new Error("SQLite not connected");
      db_sqlite.prepare(
        "INSERT INTO resumes (resume_id, user_id, resume_text, extracted_skills, experience_years, education) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(resume_id, user_id, resume_text, extracted_skills, experience_years, education);
      res.json({ success: true, resume_id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Interview Endpoints ---
  app.get("/api/interviews", async (req, res) => {
    try {
      if (!db_sqlite) return res.status(500).json({ error: "SQLite not connected" });
      // JOIN with users to get candidate name if needed, or just return interviews
      const rows = db_sqlite.prepare(`
        SELECT i.*, u.name as candidate_name 
        FROM interviews i 
        LEFT JOIN users u ON i.user_id = u.user_id 
        ORDER BY i.created_at DESC
      `).all();
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/interviews", async (req, res) => {
    try {
      const {
        interview_id,
        user_id,
        job_role,
        job_description,
        interview_mode,
        interview_language,
        interview_duration,
        interview_level
      } = req.body;

      if (!db_sqlite) throw new Error("SQLite not connected");
      db_sqlite.prepare(`
        INSERT INTO interviews (
          interview_id, user_id, job_role, job_description, 
          interview_mode, interview_language, interview_duration, 
          interview_level, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ongoing')
      `).run(
        interview_id, user_id, job_role, job_description,
        interview_mode, interview_language, interview_duration,
        interview_level
      );

      // Initialize transcription in MongoDB (optional but kept for heritage)
      if (transcriptsColl) {
        await transcriptsColl.insertOne({ interview_id, messages: [] });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/interviews/:id", async (req, res) => {
    try {
      const { id } = req.params;

      if (!db_sqlite) throw new Error("SQLite not connected");
      const interview = db_sqlite.prepare(`
        SELECT i.*, u.name as candidate_name 
        FROM interviews i 
        LEFT JOIN users u ON i.user_id = u.user_id 
        WHERE i.interview_id = ?
      `).get(id);

      if (!interview) return res.status(404).json({ error: "Interview not found" });

      // Fetch resume from SQLite
      const resume = db_sqlite.prepare("SELECT * FROM resumes WHERE user_id = ? ORDER BY upload_date DESC LIMIT 1").get(interview.user_id);

      // Fetch transcript from MongoDB
      const transcriptDoc = transcriptsColl ? await transcriptsColl.findOne({ interview_id: id }) : null;

      res.json({
        ...interview,
        resume_text: resume?.resume_text,
        extracted_skills: resume?.extracted_skills,
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

      if (!db_sqlite) throw new Error("SQLite not connected");

      // 1. Save message to transcription (MongoDB)
      if (transcriptsColl) {
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
      }

      // 2. If it's a question from the interviewer, save to questions table
      if (role === 'interviewer' && question_id) {
        db_sqlite.prepare(`
          INSERT INTO questions (question_id, interview_id, question_text, question_type)
          VALUES (?, ?, ?, ?)
        `).run(question_id, id, content, 'technical'); // Defaulting to technical for now
      }

      // 3. If it's a candidate response, save to responses and ai_analysis
      if (role === 'candidate' && response_id && question_id) {
        db_sqlite.prepare(`
          INSERT INTO responses (response_id, interview_id, question_id, candidate_answer)
          VALUES (?, ?, ?, ?)
        `).run(response_id, id, question_id, content);

        if (evaluation) {
          const analysis_id = Math.random().toString(36).substring(7);
          db_sqlite.prepare(`
            INSERT INTO ai_analysis (
              analysis_id, response_id, relevance_score, 
              confidence_score, sentiment_score, emotion_detected
            ) VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            analysis_id,
            response_id,
            evaluation.scores?.relevance || 0,
            evaluation.scores?.technical || 0, // Mapping technical score to confidence/tech
            0.5, // Default sentiment
            evaluation.sentiment || 'neutral'
          );

          // 4. Handle Red Flags in fraud_detection
          if (evaluation.red_flags?.length > 0) {
            const fraud_id = Math.random().toString(36).substring(7);
            db_sqlite.prepare(`
              INSERT INTO fraud_detection (
                fraud_id, interview_id, suspicious_behavior_score, fraud_alert
              ) VALUES (?, ?, ?, ?)
            `).run(
              fraud_id,
              id,
              evaluation.red_flags.length * 0.1, // Simple score
              'Yes'
            );
          }
        }
      }

      res.json({ success: true });
    } catch (error) {
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
