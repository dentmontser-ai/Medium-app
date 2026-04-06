const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- إعدادات الاتصال ---
const geminiApiKey = process.env.GOOGLE_API_KEY;
const mongoUri = process.env.MONGO_URI;

if (!geminiApiKey || !mongoUri) {
  console.warn("⚠️ تحذير: المفاتيح السرية غير موجودة. تأكد من إضافتها في إعدادات Netlify.");
}

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
    console.log("✅ تم الاتصال بنجاح بقاعدة بيانات MongoDB!");
    isConnected = true;
  } catch (error) {
    console.error("❌ فشل الاتصال بقاعدة البيانات", error);
    throw error;
  }
}

// --- نقطة النهاية الرئيسية لتوليد الأسئلة ---
app.post('/generate-questions', async (req, res) => {
    const { specialty, year, subject } = req.body;

    try {
        console.log(`📚 طلب جديد: ${specialty} - ${year} - ${subject}`);

        // التأكد من الاتصال بقاعدة البيانات
        if (!isConnected) {
          await connectToDb();
        }

        const questionsCollection = client.db("MedSimDB").collection("questions");
        const numberOfQuestionsToGenerate = 20;

        // 1. ابحث أولاً في قاعدة البيانات
        const existingQuestions = await questionsCollection.find({
            subject: { $regex: new RegExp(subject, "i") },
            specialty: specialty,
            year: year
        }).toArray();

        if (existingQuestions.length >= numberOfQuestionsToGenerate) {
            console.log(`✅ تم العثور على ${existingQuestions.length} سؤالاً في قاعدة البيانات.`);
            const shuffled = existingQuestions.sort(() => 0.5 - Math.random());
            const selectedQuestions = shuffled.slice(0, numberOfQuestionsToGenerate);
            return res.json({ questions: selectedQuestions });
        }

        // 2. إذا لم نجد أسئلة كافية، اذهب إلى Gemini API
        console.log("🤖 لا توجد أسئلة كافية. جاري توليد أسئلة جديدة من Gemini...");
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

        console.log("✅ تم إنشاء الأسئلة بنجاح! جاري تخزينها...");
        
        const questionsToStore = newQuestions.map(q => ({
            ...q,
            subject: subject,
            specialty: specialty,
            year: year,
            createdAt: new Date()
        }));

        await questionsCollection.insertMany(questionsToStore);
        console.log("💾 تم تخزين الأسئلة الجديدة في قاعدة البيانات.");

        res.json({ questions: newQuestions });

    } catch (error) {
        console.error("❌ حدث خطأ في عملية توليد الأسئلة:", error);
        res.status(500).json({ error: "فشل في توليد الأسئلة. يرجى التأكد من إضافة المفاتيح السرية (GOOGLE_API_KEY و MONGO_URI) في إعدادات Netlify." });
    }
});

// --- نقطة نهاية للتحقق من صحة الخادم ---
app.get('/health', (req, res) => {
    res.json({ status: "✅ الخادم يعمل بشكل صحيح!" });
});

// --- معالج الأخطاء العام ---
app.use((err, req, res, next) => {
    console.error("❌ خطأ عام:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
});

// --- بدء الخادم ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
});

module.exports = app;
