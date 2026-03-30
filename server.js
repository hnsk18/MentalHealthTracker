require('dotenv').config({ path: './quiz-module/.env', override: true });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, 'frontend')));
app.use('/quiz', express.static(path.join(__dirname, 'quiz-module/public')));

// === In-Memory Databases (From Flask app.py) ===
const users_db = {};
const moods_db = {};
const quiz_responses_db = {};
const messages_db = {};
let next_user_id = 1;

// Mock data
const QUIZ_QUESTIONS = [
    {
        "id": 1,
        "question": "How often do you feel stressed?",
        "options": ["Never", "Rarely", "Sometimes", "Often", "Always"],
        "weight": [0, 1, 2, 3, 4]
    },
    {
        "id": 2,
        "question": "How many hours do you sleep on average?",
        "options": ["Less than 5", "5-6", "6-7", "7-8", "More than 8"],
        "weight": [4, 3, 2, 0, 1]
    },
    {
        "id": 3,
        "question": "How would you rate your work-life balance?",
        "options": ["Excellent", "Good", "Fair", "Poor", "Very Poor"],
        "weight": [0, 1, 2, 3, 4]
    },
    {
        "id": 4,
        "question": "Do you take regular breaks during work?",
        "options": ["Always", "Often", "Sometimes", "Rarely", "Never"],
        "weight": [0, 1, 2, 3, 4]
    },
    {
        "id": 5,
        "question": "How is your physical health?",
        "options": ["Excellent", "Good", "Fair", "Poor", "Very Poor"],
        "weight": [0, 1, 2, 3, 4]
    }
];

const MOOD_EMOJI = {
    "happy": "😊",
    "sad": "😢",
    "stressed": "😰",
    "anxious": "😟",
    "calm": "😌"
};

const MOOD_COLORS = {
    "happy": "#FFD700",
    "sad": "#4169E1",
    "stressed": "#FF6347",
    "anxious": "#FF8C00",
    "calm": "#90EE90"
};

// ==================== Authentication Routes ====================

app.post('/api/register', async (req, res) => {
    try {
        const { email, password, name, role = 'user' } = req.body;

        const emailExists = Object.values(users_db).some(u => u.email === email);
        if (emailExists) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        const user_id = next_user_id++;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        users_db[user_id] = {
            id: user_id,
            name,
            email,
            password: hashedPassword,
            role,
            created_at: new Date().toISOString()
        };

        moods_db[user_id] = [];
        quiz_responses_db[user_id] = [];
        messages_db[user_id] = [];

        res.status(201).json({
            success: true,
            user_id: user_id,
            message: 'Registration successful'
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password, role = 'user' } = req.body;

        for (const [user_id, user] of Object.entries(users_db)) {
            if (user.email === email && user.role === role) {
                const isMatch = await bcrypt.compare(password, user.password);
                if (isMatch) {
                    return res.status(200).json({
                        success: true,
                        user_id: parseInt(user_id),
                        name: user.name,
                        role: user.role,
                        email: user.email
                    });
                }
            }
        }

        res.status(401).json({ error: 'Invalid credentials' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== User Routes ====================

app.get('/api/user/:user_id', (req, res) => {
    const user_id = parseInt(req.params.user_id);
    if (!users_db[user_id]) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    const user = users_db[user_id];
    res.status(200).json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
    });
});

// ==================== Mood Routes ====================

app.post('/api/mood', (req, res) => {
    const { user_id, mood } = req.body;

    if (!users_db[user_id]) {
        return res.status(404).json({ error: 'User not found' });
    }

    const mood_entry = {
        mood: mood,
        timestamp: new Date().toISOString(),
        emoji: MOOD_EMOJI[mood] || '😐',
        color: MOOD_COLORS[mood] || '#808080'
    };

    if (!moods_db[user_id]) moods_db[user_id] = [];
    moods_db[user_id].push(mood_entry);

    res.status(201).json({
        success: true,
        mood_entry
    });
});

app.get('/api/mood/:user_id', (req, res) => {
    const user_id = parseInt(req.params.user_id);
    if (!users_db[user_id]) {
        return res.status(404).json({ error: 'User not found' });
    }

    const moods = moods_db[user_id] || [];
    
    const mood_counts = {};
    for (const mood_entry of moods) {
        mood_counts[mood_entry.mood] = (mood_counts[mood_entry.mood] || 0) + 1;
    }

    const current_mood = moods.length > 0 ? moods[moods.length - 1] : { mood: 'neutral', emoji: '😐', color: '#808080' };

    res.status(200).json({
        current_mood,
        mood_history: moods.slice(-7), // Last 7
        mood_counts,
        total_moods: moods.length
    });
});

// ==================== Old Quiz Routes (from Flask) ====================

app.get('/api/quiz', (req, res) => {
    res.status(200).json({
        questions: QUIZ_QUESTIONS,
        total_questions: QUIZ_QUESTIONS.length
    });
});

app.post('/api/quiz/submit', (req, res) => {
    const { user_id, answers } = req.body;

    if (!users_db[user_id]) {
        return res.status(404).json({ error: 'User not found' });
    }

    let total_score = 0;
    answers.forEach((answer, i) => {
        if (i < QUIZ_QUESTIONS.length) {
            const question = QUIZ_QUESTIONS[i];
            if (answer >= 0 && answer < question.weight.length) {
                total_score += question.weight[answer];
            }
        }
    });

    const average_score = QUIZ_QUESTIONS.length ? total_score / QUIZ_QUESTIONS.length : 0;
    
    let stress_level, recommendation;
    if (average_score < 1.5) {
        stress_level = "Low";
        recommendation = "Great! Keep maintaining your healthy habits.";
    } else if (average_score < 2.5) {
        stress_level = "Medium";
        recommendation = "Consider taking more breaks and practicing mindfulness.";
    } else {
        stress_level = "High";
        recommendation = "Please consider seeking professional help and taking rest.";
    }

    const quiz_result = {
        timestamp: new Date().toISOString(),
        score: total_score,
        average_score: Math.round(average_score * 100) / 100,
        stress_level,
        recommendation
    };

    if (!quiz_responses_db[user_id]) quiz_responses_db[user_id] = [];
    quiz_responses_db[user_id].push(quiz_result);

    res.status(201).json({
        success: true,
        result: quiz_result
    });
});

app.get('/api/quiz/history/:user_id', (req, res) => {
    const user_id = parseInt(req.params.user_id);
    if (!users_db[user_id]) {
        return res.status(404).json({ error: 'User not found' });
    }

    const history = quiz_responses_db[user_id] || [];
    res.status(200).json({ history: history.slice(-5) });
});

// ==================== Messaging/Chat Routes ====================

app.post('/api/chat', (req, res) => {
    const { user_id, message } = req.body;

    if (!users_db[user_id]) {
        return res.status(404).json({ error: 'User not found' });
    }

    const user_message = {
        sender: 'user',
        text: message,
        timestamp: new Date().toISOString()
    };

    if (!messages_db[user_id]) messages_db[user_id] = [];
    messages_db[user_id].push(user_message);

    const ai_responses = [
        "That's interesting. Tell me more about how you're feeling.",
        "I understand. Remember, it's okay to take breaks when you need them.",
        "Thank you for sharing. Have you tried any relaxation techniques?",
        "It sounds like you're going through a lot. Be kind to yourself.",
        "That's a valid concern. What steps can you take to address it?",
        "I'm here to listen. Is there anything specific bothering you?"
    ];

    const ai_response_text = ai_responses[Math.floor(Math.random() * ai_responses.length)];

    const ai_message = {
        sender: 'ai',
        text: ai_response_text,
        timestamp: new Date().toISOString()
    };

    messages_db[user_id].push(ai_message);

    res.status(201).json({
        success: true,
        user_message,
        ai_response: ai_message
    });
});

app.get('/api/chat/:user_id', (req, res) => {
    const user_id = parseInt(req.params.user_id);
    if (!users_db[user_id]) {
        return res.status(404).json({ error: 'User not found' });
    }

    const messages = messages_db[user_id] || [];
    res.status(200).json({ messages });
});

// ==================== Music Recommendation Routes ====================

app.get('/api/music-recommendation/:mood', (req, res) => {
    const mood = req.params.mood;
    const music_recommendations = {
        'happy': {
            genre: 'Upbeat Pop',
            youtube_query: 'upbeat happy music',
            description: 'Feel-good tracks to boost your mood!'
        },
        'sad': {
            genre: 'Emotional Ballads',
            youtube_query: 'emotional healing music',
            description: 'Soothing music to help you process emotions.'
        },
        'stressed': {
            genre: 'Chill Ambient',
            youtube_query: 'ambient relaxation music',
            description: 'Calming background music for stress relief.'
        },
        'anxious': {
            genre: 'Meditation Sounds',
            youtube_query: 'meditation relaxation music',
            description: 'Peaceful sounds to ease anxiety.'
        },
        'calm': {
            genre: 'Soft Jazz',
            youtube_query: 'smooth jazz music',
            description: 'Smooth tunes to maintain your peaceful state.'
        }
    };

    const recommendation = music_recommendations[mood] || {
        genre: 'Peaceful Music',
        youtube_query: 'relaxing music',
        description: 'Enjoy some calming music.'
    };

    res.status(200).json(recommendation);
});

// ==================== Admin Analytics Routes ====================

app.get('/api/admin/analytics', (req, res) => {
    const total_users = Object.keys(users_db).length;

    const role_distribution = {};
    Object.values(users_db).forEach(user => {
        role_distribution[user.role] = (role_distribution[user.role] || 0) + 1;
    });

    const mood_distribution = {};
    Object.values(moods_db).forEach(user_moods => {
        user_moods.forEach(entry => {
            mood_distribution[entry.mood] = (mood_distribution[entry.mood] || 0) + 1;
        });
    });

    const all_stress_scores = [];
    Object.values(quiz_responses_db).forEach(user_quizzes => {
        user_quizzes.forEach(quiz => {
            all_stress_scores.push(quiz.average_score);
        });
    });

    const average_stress = all_stress_scores.length 
        ? all_stress_scores.reduce((a, b) => a + b, 0) / all_stress_scores.length 
        : 0;

    let total_mood_entries = 0;
    Object.values(moods_db).forEach(m => total_mood_entries += m.length);

    let total_quiz_attempts = 0;
    Object.values(quiz_responses_db).forEach(q => total_quiz_attempts += q.length);

    res.status(200).json({
        total_users,
        role_distribution,
        mood_distribution,
        average_stress_level: Math.round(average_stress * 100) / 100,
        total_mood_entries,
        total_quiz_attempts
    });
});

app.get('/api/volunteer/users-needing-help', (req, res) => {
    const users_needing_help = [];

    for (const [uid, quizzes] of Object.entries(quiz_responses_db)) {
        if (quizzes.length > 0) {
            const latest_quiz = quizzes[quizzes.length - 1];
            if (latest_quiz.stress_level === 'High') {
                const user = users_db[uid] || {};
                users_needing_help.push({
                    user_id: parseInt(uid),
                    name: user.name || 'Unknown',
                    stress_level: latest_quiz.stress_level,
                    last_quiz_date: latest_quiz.timestamp
                });
            }
        }
    }

    res.status(200).json({ users: users_needing_help });
});

// ==================== Health Route ====================

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'MindMitra Backend is running (Express)' });
});


// ==================== Mistral AI Quiz Module Routes ====================

const questionsFilePath = path.join(__dirname, 'quiz-module/questions.json');
let allQuestions = [];
try {
    if (fs.existsSync(questionsFilePath)) {
        allQuestions = JSON.parse(fs.readFileSync(questionsFilePath, 'utf8'));
    } else {
        console.error("questions.json file not found at", questionsFilePath);
    }
} catch (e) {
    console.error("Error loading questions:", e);
}

app.get('/api/questions', (req, res) => {
    if (allQuestions.length < 10) {
        return res.status(500).json({ error: 'Not enough questions available in the database.' });
    }
    const shuffled = [...allQuestions].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 10).map(q => ({
        id: q.id,
        question: q.question,
        options: q.options.map((opt, i) => ({ id: i, description: opt.description }))
    }));
    res.json(selected);
});

app.post('/api/submit', async (req, res) => {
    const { answers } = req.body;
    if (!answers || !Array.isArray(answers)) {
        return res.status(400).json({ error: 'Invalid answers format.' });
    }

    let totalScore = 0;
    let maxPossibleScore = 0;
    const answeredDetails = [];

    answers.forEach(ans => {
        const question = allQuestions.find(q => q.id === ans.questionId);
        if (question) {
            const selectedOption = question.options[ans.optionId];
            if (selectedOption) {
                totalScore += selectedOption.score;
                answeredDetails.push(`Q: ${question.question}\nA: ${selectedOption.description}`);
            }
            maxPossibleScore += Math.max(...question.options.map(opt => opt.score));
        }
    });

    const percentage = Math.round((totalScore / Math.max(maxPossibleScore, 1)) * 100);

    const prompt = `
A user took an emotional assessment quiz. Their total emotional well-being score is ${percentage}% (out of 100).
Here are their answers:
${answeredDetails.join('\n\n')}

Analyze their responses and provide a JSON response with the following keys EXACTLY:
{
  "personalityType": "Short trait description",
  "strengths": ["list", "of", "strengths"],
  "weaknesses": ["list", "of", "weaknesses"],
  "emotionalScore": ${percentage},
  "category": "Good / Moderate / Needs Support",
  "mood": "Describe user's mood based on responses (e.g., Happy, Sad, Stressed, Calm)",
  "suggestions": ["actionable advice 1", "actionable advice 2"]
}
DO NOT output markdown formatting blocks like \`\`\`json. Output ONLY raw JSON text.
    `;

    try {
        const mistralKey = process.env.MISTRAL_API_KEY;
        if (!mistralKey) {
            throw new Error("MISTRAL_API_KEY is not defined in the environment.");
        }

        const response = await axios.post(
            'https://api.mistral.ai/v1/chat/completions',
            {
                model: 'mistral-small-latest',
                messages: [{ role: 'user', content: prompt }]
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${mistralKey}`
                }
            }
        );

        const aiText = response.data.choices[0].message.content.trim();
        let aiResult = {};
        
        try {
            const cleanedText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
            aiResult = JSON.parse(cleanedText);
        } catch (e) {
            console.error("AI Response Parsing error:", aiText);
            throw new Error("Invalid JSON format from AI");
        }

        res.json({
            score: percentage,
            feedback: aiResult
        });

    } catch (error) {
        console.error("AI Processing Error:", error.message);
        
        // --- FALLBACK SYSTEM ---
        let category = "Moderate";
        let fallbackMood = "Neutral";
        if (percentage >= 75) { 
            category = "Good"; 
            fallbackMood = "Positive/Calm"; 
        } else if (percentage <= 40) { 
            category = "Needs Support"; 
            fallbackMood = "Stressed/Anxious"; 
        }

        res.json({
            score: percentage,
            feedback: {
                personalityType: "Unknown (AI Offline)",
                strengths: ["Self-awareness"],
                weaknesses: ["Unable to analyze further currently"],
                emotionalScore: percentage,
                category: category,
                mood: fallbackMood,
                suggestions: [
                    "Take a moment to breathe and reflect.",
                    "Drink some water and rest your mind momentarily.",
                    "If you feel overwhelmed, consider talking to someone close to you."
                ]
            }
        });
    }
});


// Start server
app.listen(PORT, () => {
    console.log(`Unified server running on http://localhost:${PORT}`);
});
