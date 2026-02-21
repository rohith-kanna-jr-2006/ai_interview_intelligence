import Database from "better-sqlite3";
const db = new Database("interviewiq_v2.db");
try {
    const info = db.pragma("table_info(interviews)");
    console.log("Interviews table info:", JSON.stringify(info, null, 2));
    const rows = db.prepare("SELECT i.*, u.name as candidate_name FROM interviews i LEFT JOIN users u ON i.user_id = u.user_id").all();
    console.log("Query successful, rows:", rows.length);
} catch (err) {
    console.error("Query failed:", err.message);
}
db.close();
