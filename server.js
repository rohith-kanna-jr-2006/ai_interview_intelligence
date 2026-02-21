import express from "express";
import { createServer as createViteServer } from "vite";
import mysql from "mysql2/promise";
import { MongoClient } from "mongodb";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const PORT = 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const MONGODB_DB_NAME = "interview_iq";

// Database connections
let mysqlConn = null;
let mongoClient = null;

async function initDatabases() {
  try {
    // MySQL Initialization
    mysqlConn = await mysql.createConnection({
      host: process.env.MYSQL_HOST || "localhost",
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "password",
      database: process.env.MYSQL_DATABASE || "interview_iq",
    });

    await mysqlConn.execute(`
      CREATE TABLE IF NOT EXISTS interviews (
        id VARCHAR(50) PRIMARY KEY,
        candidate_name VARCHAR(255),
        job_description TEXT,
        mode VARCHAR(20),
        status VARCHAR(20),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await mysqlConn.execute(`
      CREATE TABLE IF NOT EXISTS fraud_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        interview_id VARCHAR(50),
        flag_type VARCHAR(100),
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(interview_id) REFERENCES interviews(id)
      )
    `);

    console.log("MySQL connected and initialized.");

    // MongoDB Initialization
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

  // API Routes
  app.get("/api/interviews", async (req, res) => {
    try {
      if (!mysqlConn) return res.status(500).json({ error: "MySQL not connected" });
      const [rows] = await mysqlConn.execute("SELECT * FROM interviews ORDER BY created_at DESC");
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/interviews", async (req, res) => {
    try {
      const { id, candidate_name, resume_text, job_description, mode, analysis } = req.body;
      
      // Save structured data to MySQL
      if (!mysqlConn) throw new Error("MySQL not connected");
      await mysqlConn.execute(
        "INSERT INTO interviews (id, candidate_name, job_description, mode, status) VALUES (?, ?, ?, ?, 'ongoing')",
        [id, candidate_name, job_description, mode]
      );

      // Save unstructured data to MongoDB
      if (!resumesColl || !transcriptsColl) throw new Error("MongoDB not connected");
      await resumesColl.insertOne({ interview_id: id, resume_text, analysis });
      await transcriptsColl.insertOne({ interview_id: id, messages: [] });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/interviews/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!mysqlConn) throw new Error("MySQL not connected");
      const [interviews] = await mysqlConn.execute("SELECT * FROM interviews WHERE id = ?", [id]);
      const interview = interviews[0];

      if (!interview) return res.status(404).json({ error: "Interview not found" });

      // Fetch resume and transcript from MongoDB
      if (!resumesColl || !transcriptsColl) throw new Error("MongoDB not connected");
      const resumeDoc = await resumesColl.findOne({ interview_id: id });
      const transcriptDoc = await transcriptsColl.findOne({ interview_id: id });

      res.json({ 
        ...interview, 
        resume_text: resumeDoc?.resume_text,
        analysis: resumeDoc?.analysis,
        messages: transcriptDoc?.messages || [] 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/interviews/:id/messages", async (req, res) => {
    try {
      const { id } = req.params;
      const { role, content, evaluation } = req.body;
      
      if (!transcriptsColl) throw new Error("MongoDB not connected");
      
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

      // If there are red flags, log them to MySQL (structured fraud logs)
      if (evaluation?.red_flags?.length > 0 && mysqlConn) {
        for (const flag of evaluation.red_flags) {
          await mysqlConn.execute(
            "INSERT INTO fraud_logs (interview_id, flag_type, description) VALUES (?, ?, ?)",
            [id, "Potential Fraud", flag]
          );
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
