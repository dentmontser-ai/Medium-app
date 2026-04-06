const express = require('express');
const cors = require('cors');
const serverless = require('serverless-http');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const router = express.Router();

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- إعدادات الاتصال ---
const geminiApiKey = process.env.GOOGLE_API_KEY;
const mongoUri = process.env.MONGO_URI;

const genAI = new GoogleGenerativeAI(geminiApiKey);

// --- إعداد عميل MongoDB ---
let client;
let isConnected = false;

async function connectToDb() {
  if (isConnected) return;
  try {
    client = new MongoClient(mongoUri, {
      serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
    });
    await client.connect();
    isConnected = true;
  } catch (error) {
    console.error("❌ MongoDB Error:", error);
    throw error;
  }
}

// --- نقطة النهاية الرئيسية لتوليد الأسئلة ---
router.post('/generate-questions', async (req, res) => {
    const { specialty, year, subject } = req.body;

    try {
        if (!isConnected) await connectToDb();
        const questionsCollection = client.db("MedSimDB").collection("questions");
        const numberOfQuestionsToGenerate = 20;

        // 1. ابحث في قاعدة البيانات
        const existingQuestions = await questionsCollection.find({
            subject: { $regex: new RegExp(subject, "i") },
            specialty: specialty,
            year: year
        }).toArray();

        if (existingQuestions.length >= numberOfQuestionsToGenerate) {
            const shuffled = existingQuestions.sort(() => 0.5 - Math.random());
            const selectedQuestions = shuffled.slice(0, numberOfQuestionsToGenerate);
            return res.json({ questions: selectedQuestions });
        }

        // 2. Gemini API
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const prompt = `
            أنت خبير في إعداد الاختبارات الطبية. قم بإنشاء ${numberOfQuestionsToGenerate} سؤال اختيار من متعدد (MCQ)
            حول مادة "${subject}" لطلاب "${year}" في تخصص "${specialty}".
            أعد النتائج حصرياً بتنسيق JSON على شكل مصفوفة من الكائنات.
            كل كائن يجب أن يحتوي على: "question", "options" (كمصفوفة من 4 نصوص), و "correct_answer".
            لا تضف أي نص أو مقدمات قبل أو بعد مصفوفة JSON.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        const newQuestions = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
        
        const questionsToStore = newQuestions.map(q => ({
            ...q,
            subject: subject,
            specialty: specialty,
            year: year,
            createdAt: new Date()
        }));

        await questionsCollection.insertMany(questionsToStore);
        res.json({ questions: newQuestions });

    } catch (error) {
        console.error("❌ API Error:", error);
        res.status(500).json({ error: "فشل في توليد الأسئلة. يرجى التأكد من إضافة المفاتيح السرية." });
    }
});

router.get('/health', (req, res) => {
    res.json({ status: "✅ Serverless Function is running!" });
});

// --- ربط الرواتر بمسار Netlify ---
app.use('/.netlify/functions/server', router);

module.exports.handler = serverless(app);
