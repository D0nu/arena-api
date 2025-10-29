import dotenv from "dotenv";
import mongoose from "mongoose";
import { generateQuestions } from "./utils/questionGenerator.js"; // adjust path if different
//import { Question } from "./Models/Question.js";

dotenv.config();

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/airdrop-arena";

async function testQuestionGeneration() {
  try {
    // Connect to your MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Choose a topic to test
    const topic = "music"; // You can test: solana, music, sports, movies, history, fashion
    const questions = await generateQuestions(topic, 5);

    console.log(`🎯 Generated ${questions.length} questions for topic "${topic}"`);
    console.log("🧠 Sample Question Output:\n");

    questions.forEach((q, i) => {
      console.log(`Q${i + 1}: ${q.question}`);
      q.options.forEach((opt, j) => {
        console.log(`   ${j}: ${opt}`);
      });
      console.log(`✅ Correct Answer Index: ${q.correctAnswer}`);
      console.log(`🔹 Difficulty: ${q.difficulty}`);
      console.log("------------------------");
    });

    // Close DB connection
    await mongoose.connection.close();
    console.log("🔌 MongoDB connection closed.");
  } catch (error) {
    console.error("❌ Error during test:", error.message);
  }
}

testQuestionGeneration();
