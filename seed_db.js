import { MongoClient } from "mongodb";
const uri = "mongodb://127.0.0.1:27017";
const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
        const db = client.db("InterviewIq");

        // Force creation by inserting a record
        const result = await db.collection("users").updateOne(
            { user_id: "seed_admin" },
            { $set: { name: "System Admin", role: "admin", email: "admin@interviewiq.ai" } },
            { upsert: true }
        );

        console.log("Seed admin user created/updated.");

        const collections = await db.listCollections().toArray();
        console.log("Visible Collections:", collections.map(c => c.name));

    } finally {
        await client.close();
    }
}
run().catch(console.dir);
