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

// === In-Memory Databases ===
const users_db = {};
const moods_db = {};
const quiz_responses_db = {};
const messages_db = {}; // { userId: [ {role, content, timestamp} ] }
const volunteer_requests_db = {}; // { userId: { requested_at, note, status } }
const volunteer_assignments_db = {}; // { volunteerId: { [userId]: { assigned_at } } }
const user_volunteer_map = {}; // { userId: volunteerId }
const secure_chat_db = {}; // { "userId:volunteerId": [messages] }
let next_user_id = 1;

const getSecureConversationKey = (userId, volunteerId) => `${userId}:${volunteerId}`;

// Mock data
const QUIZ_QUESTIONS = [
    { id: 1, question: "How often do you feel stressed?", options: ["Never","Rarely","Sometimes","Often","Always"], weight: [0,1,2,3,4] },
    { id: 2, question: "How many hours do you sleep on average?", options: ["Less than 5","5-6","6-7","7-8","More than 8"], weight: [4,3,2,0,1] },
    { id: 3, question: "How would you rate your work-life balance?", options: ["Excellent","Good","Fair","Poor","Very Poor"], weight: [0,1,2,3,4] },
    { id: 4, question: "Do you take regular breaks during work?", options: ["Always","Often","Sometimes","Rarely","Never"], weight: [0,1,2,3,4] },
    { id: 5, question: "How is your physical health?", options: ["Excellent","Good","Fair","Poor","Very Poor"], weight: [0,1,2,3,4] }
];

const MOOD_EMOJI = { happy:"😊", sad:"😢", stressed:"😰", anxious:"😟", calm:"😌" };
const MOOD_COLORS = { happy:"#FFD700", sad:"#4169E1", stressed:"#FF6347", anxious:"#FF8C00", calm:"#90EE90" };

// ==================== Nyxie AI (Mistral) ====================

const NYXIE_SYSTEM_PROMPT = `
You are Nyxie, a compassionate peer listener on MindMitra — a safe mental wellness space for youth.

YOUR IDENTITY & ROLE:
- You are NOT a therapist, doctor, or counselor. You are a warm, non-judgmental listener.
- You were trained on youth mental health conversation principles, active listening, and empathetic reflection.
- You are calm, grounded, and never panicked — even when someone shares something heavy.

CORE RULES — NEVER BREAK THESE:
1. NEVER diagnose the user. Do not use clinical labels like "depression", "anxiety disorder", "OCD", or similar.
2. NEVER tell the user what they SHOULD feel or SHOULD do.
3. NEVER minimize their experience. Phrases like "it's not that bad" or "others have it worse" are forbidden.
4. NEVER claim to be a human if sincerely asked.
5. Keep responses SHORT — 2–4 sentences max. This is a mobile chat app.

CONVERSATION STYLE:
- Acknowledge what the user shared before asking anything.
- Ask only ONE open-ended question at a time.
- Mirror back what you heard before adding anything new.
- Normalize emotions — make the user feel they are not alone and not "broken."

JOURNALING MODE (activated by system flag):
When Journaling Mode is ON:
- Do NOT offer advice, suggestions, or questions.
- Simply reflect themes and emotions back without judgment, like a mirror.
- Keep reflections poetic, gentle, and brief. The goal is for the user to feel WITNESSED, not guided.
`;

const buildSystemPrompt = (isJournalingMode) => {
    const flag = isJournalingMode
        ? '\n\n[SYSTEM FLAG]: JOURNALING MODE ACTIVE. Reflect themes and emotions only. No advice. No questions.'
        : '\n\n[SYSTEM FLAG]: STANDARD LISTENER MODE ACTIVE.';
    return NYXIE_SYSTEM_PROMPT + flag;
};

const CRISIS_KEYWORDS = [
    'hopeless','worthless','hurt myself','kill myself','end my life',
    'suicide','want to die','no reason to live','better off dead',
    'self harm','cut myself','overdose',
];
const detectCrisis = (message) => {
    const lower = message.toLowerCase();
    return CRISIS_KEYWORDS.some((kw) => lower.includes(kw));
};

// Lazy Mistral singleton
let _mistralClient = null;
const getMistral = async () => {
    if (!_mistralClient) {
        const { Mistral } = await import('@mistralai/mistralai');
        _mistralClient = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
    }
    return _mistralClient;
};

// ==================== Authentication Routes ====================

app.post('/api/register', async (req, res) => {
    try {
        const { email, password, name, role = 'user' } = req.body;
        const emailExists = Object.values(users_db).some(u => u.email === email);
        if (emailExists) return res.status(400).json({ error: 'Email already exists' });

        const user_id = next_user_id++;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        users_db[user_id] = { id: user_id, name, email, password: hashedPassword, role, created_at: new Date().toISOString() };
        moods_db[user_id] = [];
        quiz_responses_db[user_id] = [];
        messages_db[user_id] = [];
        volunteer_requests_db[user_id] = null;

        res.status(201).json({ success: true, user_id, message: 'Registration successful' });
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
                if (isMatch) return res.status(200).json({ success: true, user_id: parseInt(user_id), name: user.name, role: user.role, email: user.email });
            }
        }
        res.status(401).json({ error: 'Invalid credentials' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/user/:user_id', (req, res) => {
    const user_id = parseInt(req.params.user_id);
    if (!users_db[user_id]) return res.status(404).json({ error: 'User not found' });
    const user = users_db[user_id];
    res.status(200).json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

// ==================== Mood Routes ====================

// Mood-specific response data
const MOOD_RESPONSES = {
    happy: {
        message: "Great to see you feeling good! Keep it up 💙",
        actions: [
            { label: "📓 Write Journal", route: "journal" },
            { label: "📊 View Dashboard", route: "dashboard" }
        ]
    },
    sad: {
        message: "It's okay to feel this way. You're not alone 💙",
        actions: [
            { label: "🤖 Talk to AI", route: "messaging" },
            { label: "🤝 Connect to Volunteer", route: "volunteer-dashboard" },
            { label: "📓 Write Journal", route: "journal" }
        ]
    },
    stressed: {
        message: "Let's slow down together. Take a deep breath 🫁",
        actions: [
            { label: "🧘 Start Breathing Exercise", route: "breathing" },
            { label: "🤖 Talk to AI", route: "messaging" }
        ]
    },
    anxious: {
        message: "You're safe. Let's take this one step at a time 💙",
        actions: [
            { label: "🤖 Talk to AI", route: "messaging" },
            { label: "🧘 Calm Exercise", route: "breathing" }
        ]
    },
    calm: {
        message: "You're in a good place. Keep maintaining your balance 🌿",
        actions: [
            { label: "📓 Write Journal", route: "journal" },
            { label: "📊 View Progress", route: "dashboard" }
        ]
    }
};

app.post('/api/mood', (req, res) => {
    const { user_id, mood } = req.body;
    if (!users_db[user_id]) return res.status(404).json({ error: 'User not found' });
    const mood_entry = { mood, timestamp: new Date().toISOString(), emoji: MOOD_EMOJI[mood] || '😐', color: MOOD_COLORS[mood] || '#808080' };
    if (!moods_db[user_id]) moods_db[user_id] = [];
    moods_db[user_id].push(mood_entry);

    const moodResponse = MOOD_RESPONSES[mood] || {
        message: "Thank you for sharing how you feel 💙",
        actions: [{ label: "📊 View Dashboard", route: "dashboard" }]
    };

    res.status(201).json({
        success: true,
        mood_entry,
        response: moodResponse
    });
});

app.get('/api/mood/:user_id', (req, res) => {
    const user_id = parseInt(req.params.user_id);
    if (!users_db[user_id]) return res.status(404).json({ error: 'User not found' });
    const moods = moods_db[user_id] || [];
    const mood_counts = {};
    for (const mood_entry of moods) {
        mood_counts[mood_entry.mood] = (mood_counts[mood_entry.mood] || 0) + 1;
    }
    const current_mood = moods.length > 0 ? moods[moods.length - 1] : { mood: 'neutral', emoji: '😐', color: '#808080' };
    res.status(200).json({ current_mood, mood_history: moods.slice(-7), mood_counts, total_moods: moods.length });
});

// ==================== Old Quiz Routes ====================

app.get('/api/quiz', (req, res) => {
    res.status(200).json({ questions: QUIZ_QUESTIONS, total_questions: QUIZ_QUESTIONS.length });
});

app.post('/api/quiz/submit', (req, res) => {
    const { user_id, answers } = req.body;
    if (!users_db[user_id]) return res.status(404).json({ error: 'User not found' });
    let total_score = 0;
    answers.forEach((answer, i) => {
        if (i < QUIZ_QUESTIONS.length) {
            const question = QUIZ_QUESTIONS[i];
            if (answer >= 0 && answer < question.weight.length) total_score += question.weight[answer];
        }
    });
    const average_score = QUIZ_QUESTIONS.length ? total_score / QUIZ_QUESTIONS.length : 0;
    let stress_level, recommendation;
    if (average_score < 1.5) { stress_level = "Low"; recommendation = "Great! Keep maintaining your healthy habits."; }
    else if (average_score < 2.5) { stress_level = "Medium"; recommendation = "Consider taking more breaks and practicing mindfulness."; }
    else { stress_level = "High"; recommendation = "Please consider seeking professional help and taking rest."; }
    const quiz_result = { timestamp: new Date().toISOString(), score: total_score, average_score: Math.round(average_score * 100) / 100, stress_level, recommendation };
    if (!quiz_responses_db[user_id]) quiz_responses_db[user_id] = [];
    quiz_responses_db[user_id].push(quiz_result);
    res.status(201).json({ success: true, result: quiz_result });
});

app.get('/api/quiz/history/:user_id', (req, res) => {
    const user_id = parseInt(req.params.user_id);
    if (!users_db[user_id]) return res.status(404).json({ error: 'User not found' });
    const history = quiz_responses_db[user_id] || [];
    res.status(200).json({ history: history.slice(-5) });
});

// ==================== AI Chat Route (Nyxie) ====================

app.post('/api/chat', async (req, res) => {
    const { user_id, message, isJournalingMode = false } = req.body;
    if (!users_db[user_id]) return res.status(404).json({ error: 'User not found' });
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message is required' });

    // Store user message
    if (!messages_db[user_id]) messages_db[user_id] = [];
    const userMsg = { role: 'user', content: message, timestamp: new Date().toISOString() };
    messages_db[user_id].push(userMsg);

    // Crisis detection — intercept before Mistral
    if (detectCrisis(message)) {
        const crisisReply = {
            sender: 'ai',
            type: 'CRISIS_ESCALATION',
            text: "It sounds like you might be going through something really painful right now. You deserve support from a real person.",
            helpline: 'iCall (TISS): 9152987821',
            timestamp: new Date().toISOString()
        };
        messages_db[user_id].push({ role: 'assistant', content: crisisReply.text, timestamp: crisisReply.timestamp });
        return res.status(200).json({ success: true, user_message: userMsg, ai_response: crisisReply });
    }

    // Check if Mistral key is available
    if (!process.env.MISTRAL_API_KEY) {
        // Fallback to a warm placeholder when key not set
        const fallback = {
            sender: 'ai',
            type: 'AI_RESPONSE',
            text: "I'm here and listening. Tell me more about what's on your mind.",
            timestamp: new Date().toISOString()
        };
        messages_db[user_id].push({ role: 'assistant', content: fallback.text, timestamp: fallback.timestamp });
        return res.status(200).json({ success: true, user_message: userMsg, ai_response: fallback });
    }

    try {
        // Build history (last 12 exchanges)
        const history = messages_db[user_id]
            .slice(-13)       // grab 13 so after pushing user it's at most 12 prior
            .slice(0, -1)     // exclude the message we just pushed
            .map(m => ({ role: m.role, content: m.content }));

        const mistral = await getMistral();
        const chatResponse = await mistral.chat.complete({
            model: 'mistral-small-latest',
            messages: [
                { role: 'system', content: buildSystemPrompt(isJournalingMode) },
                ...history,
                { role: 'user', content: message }
            ],
            maxTokens: 300,
            temperature: 0.75,
        });

        const aiText = chatResponse.choices[0].message.content;
        const aiMsg = { role: 'assistant', content: aiText, timestamp: new Date().toISOString() };
        messages_db[user_id].push(aiMsg);

        return res.status(200).json({
            success: true,
            user_message: userMsg,
            ai_response: { sender: 'ai', type: 'AI_RESPONSE', text: aiText, timestamp: aiMsg.timestamp }
        });

    } catch (err) {
        console.error('[/api/chat] Mistral error:', err.message);
        const fallback = {
            sender: 'ai',
            type: 'AI_RESPONSE',
            text: "I'm here with you. Something went wrong on my end — want to try sharing again?",
            timestamp: new Date().toISOString()
        };
        messages_db[user_id].push({ role: 'assistant', content: fallback.text, timestamp: fallback.timestamp });
        return res.status(200).json({ success: true, user_message: userMsg, ai_response: fallback });
    }
});

app.get('/api/chat/:user_id', (req, res) => {
    const user_id = parseInt(req.params.user_id);
    if (!users_db[user_id]) return res.status(404).json({ error: 'User not found' });
    const messages = (messages_db[user_id] || []).map(m => ({
        sender: m.role === 'user' ? 'user' : 'ai',
        text: m.content,
        timestamp: m.timestamp
    }));
    res.status(200).json({ messages });
});

// Clear chat history for a user (new session)
app.delete('/api/chat/:user_id', (req, res) => {
    const user_id = parseInt(req.params.user_id);
    if (!users_db[user_id]) return res.status(404).json({ error: 'User not found' });
    messages_db[user_id] = [];
    res.status(200).json({ success: true });
});

// ==================== Music Recommendation Routes ====================

app.get('/api/music-recommendation/:mood', (req, res) => {
    const mood = req.params.mood;
    const music_recommendations = {
        happy: { genre: 'Upbeat Pop', youtube_query: 'upbeat happy music', description: 'Feel-good tracks to boost your mood!' },
        sad: { genre: 'Emotional Ballads', youtube_query: 'emotional healing music', description: 'Soothing music to help you process emotions.' },
        stressed: { genre: 'Chill Ambient', youtube_query: 'ambient relaxation music', description: 'Calming background music for stress relief.' },
        anxious: { genre: 'Meditation Sounds', youtube_query: 'meditation relaxation music', description: 'Peaceful sounds to ease anxiety.' },
        calm: { genre: 'Soft Jazz', youtube_query: 'smooth jazz music', description: 'Smooth tunes to maintain your peaceful state.' }
    };
    res.status(200).json(music_recommendations[mood] || { genre: 'Peaceful Music', youtube_query: 'relaxing music', description: 'Enjoy some calming music.' });
});

// ==================== Admin Analytics Routes ====================

app.get('/api/admin/analytics', (req, res) => {
    const total_users = Object.keys(users_db).length;
    const role_distribution = {};
    Object.values(users_db).forEach(user => { role_distribution[user.role] = (role_distribution[user.role] || 0) + 1; });
    const mood_distribution = {};
    Object.values(moods_db).forEach(user_moods => { user_moods.forEach(entry => { mood_distribution[entry.mood] = (mood_distribution[entry.mood] || 0) + 1; }); });
    const all_stress_scores = [];
    Object.values(quiz_responses_db).forEach(user_quizzes => { user_quizzes.forEach(quiz => { all_stress_scores.push(quiz.average_score); }); });
    const average_stress = all_stress_scores.length ? all_stress_scores.reduce((a, b) => a + b, 0) / all_stress_scores.length : 0;
    let total_mood_entries = 0;
    Object.values(moods_db).forEach(m => total_mood_entries += m.length);
    let total_quiz_attempts = 0;
    Object.values(quiz_responses_db).forEach(q => total_quiz_attempts += q.length);
    res.status(200).json({ total_users, role_distribution, mood_distribution, average_stress_level: Math.round(average_stress * 100) / 100, total_mood_entries, total_quiz_attempts });
});

app.get('/api/volunteer/users-needing-help', (req, res) => {
    const users_needing_help = [];
    const includedIds = new Set();

    for (const [uid, quizzes] of Object.entries(quiz_responses_db)) {
        if (quizzes.length > 0) {
            const latest_quiz = quizzes[quizzes.length - 1];
            if (latest_quiz.stress_level === 'High') {
                const user = users_db[uid] || {};
                const userId = parseInt(uid);
                if (user_volunteer_map[userId]) continue;
                users_needing_help.push({
                    user_id: userId,
                    name: user.name || 'Unknown',
                    stress_level: latest_quiz.stress_level,
                    last_quiz_date: latest_quiz.timestamp,
                    source: 'high-stress-quiz'
                });
                includedIds.add(userId);
            }
        }
    }

    for (const [uid, request] of Object.entries(volunteer_requests_db)) {
        if (!request || request.status !== 'open') continue;
        const userId = parseInt(uid);
        if (includedIds.has(userId)) continue;
        if (user_volunteer_map[userId]) continue;
        const user = users_db[uid] || {};
        users_needing_help.push({
            user_id: userId,
            name: user.name || 'Unknown',
            stress_level: 'Requested Support',
            last_quiz_date: request.requested_at,
            source: 'user-request',
            request_note: request.note || ''
        });
    }

    users_needing_help.sort((a, b) => new Date(b.last_quiz_date) - new Date(a.last_quiz_date));
    res.status(200).json({ users: users_needing_help });
});

app.post('/api/volunteer/request', (req, res) => {
    const { user_id, note = '' } = req.body;
    if (!users_db[user_id]) return res.status(404).json({ error: 'User not found' });

    const user = users_db[user_id];
    if (user.role !== 'user') {
        return res.status(403).json({ error: 'Only user accounts can request volunteer support' });
    }

    const existingRequest = volunteer_requests_db[user_id];
    if (existingRequest && existingRequest.status === 'open') {
        return res.status(200).json({
            success: true,
            already_requested: true,
            message: 'Volunteer support request is already open',
            request: existingRequest
        });
    }

    volunteer_requests_db[user_id] = {
        requested_at: new Date().toISOString(),
        note: typeof note === 'string' ? note.trim().slice(0, 280) : '',
        status: 'open'
    };

    res.status(201).json({ success: true, message: 'Volunteer support request submitted' });
});

app.get('/api/volunteer/request/:user_id', (req, res) => {
    const user_id = parseInt(req.params.user_id);
    if (!users_db[user_id]) return res.status(404).json({ error: 'User not found' });

    const request = volunteer_requests_db[user_id];
    if (!request || request.status !== 'open') {
        return res.status(200).json({ requested: false });
    }

    return res.status(200).json({
        requested: true,
        request: {
            requested_at: request.requested_at,
            note: request.note,
            status: request.status
        }
    });
});

app.post('/api/volunteer/request/resolve', (req, res) => {
    const { user_id } = req.body;
    if (!users_db[user_id]) return res.status(404).json({ error: 'User not found' });

    const request = volunteer_requests_db[user_id];
    if (!request || request.status !== 'open') {
        return res.status(200).json({ success: true, updated: false, message: 'No open request found' });
    }

    volunteer_requests_db[user_id] = {
        ...request,
        status: 'resolved',
        resolved_at: new Date().toISOString()
    };

    return res.status(200).json({ success: true, updated: true });
});

app.post('/api/volunteer/assign', (req, res) => {
    const { volunteer_id, user_id } = req.body;
    if (!users_db[volunteer_id] || users_db[volunteer_id].role !== 'volunteer') {
        return res.status(403).json({ error: 'Invalid volunteer account' });
    }
    if (!users_db[user_id] || users_db[user_id].role !== 'user') {
        return res.status(404).json({ error: 'User not found' });
    }

    const existingVolunteerId = user_volunteer_map[user_id];
    if (existingVolunteerId && existingVolunteerId !== volunteer_id) {
        return res.status(409).json({ error: 'User is already assigned to another volunteer' });
    }

    if (!volunteer_assignments_db[volunteer_id]) volunteer_assignments_db[volunteer_id] = {};
    if (!volunteer_assignments_db[volunteer_id][user_id]) {
        volunteer_assignments_db[volunteer_id][user_id] = { assigned_at: new Date().toISOString() };
    }
    user_volunteer_map[user_id] = volunteer_id;

    const request = volunteer_requests_db[user_id];
    if (request && request.status === 'open') {
        volunteer_requests_db[user_id] = {
            ...request,
            status: 'resolved',
            resolved_at: new Date().toISOString()
        };
    }

    return res.status(200).json({ success: true, assigned_at: volunteer_assignments_db[volunteer_id][user_id].assigned_at });
});

app.post('/api/volunteer/release', (req, res) => {
    const { volunteer_id, user_id } = req.body;
    if (!users_db[volunteer_id] || users_db[volunteer_id].role !== 'volunteer') {
        return res.status(403).json({ error: 'Invalid volunteer account' });
    }
    if (!users_db[user_id] || users_db[user_id].role !== 'user') {
        return res.status(404).json({ error: 'User not found' });
    }

    if (volunteer_assignments_db[volunteer_id]) {
        delete volunteer_assignments_db[volunteer_id][user_id];
    }
    if (user_volunteer_map[user_id] === volunteer_id) {
        delete user_volunteer_map[user_id];
    }

    return res.status(200).json({ success: true });
});

app.get('/api/volunteer/handling/:volunteer_id', (req, res) => {
    const volunteer_id = parseInt(req.params.volunteer_id);
    if (!users_db[volunteer_id] || users_db[volunteer_id].role !== 'volunteer') {
        return res.status(403).json({ error: 'Invalid volunteer account' });
    }

    const assignedMap = volunteer_assignments_db[volunteer_id] || {};
    const users = Object.entries(assignedMap).map(([uid, meta]) => {
        const userId = parseInt(uid);
        const user = users_db[userId] || {};
        const recentQuiz = quiz_responses_db[userId] && quiz_responses_db[userId].length
            ? quiz_responses_db[userId][quiz_responses_db[userId].length - 1]
            : null;
        return {
            user_id: userId,
            name: user.name || 'Unknown',
            stress_level: recentQuiz ? recentQuiz.stress_level : 'Unknown',
            assigned_at: meta.assigned_at
        };
    });

    return res.status(200).json({ users });
});

app.get('/api/secure-chat/user/:user_id', (req, res) => {
    const user_id = parseInt(req.params.user_id);
    if (!users_db[user_id] || users_db[user_id].role !== 'user') {
        return res.status(404).json({ error: 'User not found' });
    }

    const volunteer_id = user_volunteer_map[user_id];
    if (!volunteer_id) {
        return res.status(200).json({ connected: false, messages: [] });
    }

    const key = getSecureConversationKey(user_id, volunteer_id);
    const messages = secure_chat_db[key] || [];
    return res.status(200).json({
        connected: true,
        volunteer_id,
        volunteer_name: users_db[volunteer_id] ? users_db[volunteer_id].name : 'Volunteer',
        messages
    });
});

app.post('/api/secure-chat/user/:user_id', (req, res) => {
    const user_id = parseInt(req.params.user_id);
    const { sender_id, text } = req.body;

    if (!users_db[user_id] || users_db[user_id].role !== 'user') {
        return res.status(404).json({ error: 'User not found' });
    }
    if (parseInt(sender_id) !== user_id) {
        return res.status(403).json({ error: 'Invalid sender for this chat' });
    }
    if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'Message text is required' });
    }

    const volunteer_id = user_volunteer_map[user_id];
    if (!volunteer_id) {
        return res.status(403).json({ error: 'No volunteer is assigned yet' });
    }

    const key = getSecureConversationKey(user_id, volunteer_id);
    if (!secure_chat_db[key]) secure_chat_db[key] = [];

    const message = {
        sender_role: 'user',
        sender_id: user_id,
        text: text.trim().slice(0, 500),
        timestamp: new Date().toISOString()
    };
    secure_chat_db[key].push(message);

    return res.status(201).json({ success: true, message });
});

app.get('/api/secure-chat/volunteer/:volunteer_id/:user_id', (req, res) => {
    const volunteer_id = parseInt(req.params.volunteer_id);
    const user_id = parseInt(req.params.user_id);

    if (!users_db[volunteer_id] || users_db[volunteer_id].role !== 'volunteer') {
        return res.status(403).json({ error: 'Invalid volunteer account' });
    }
    if (!users_db[user_id] || users_db[user_id].role !== 'user') {
        return res.status(404).json({ error: 'User not found' });
    }

    if (user_volunteer_map[user_id] !== volunteer_id) {
        return res.status(403).json({ error: 'Volunteer is not assigned to this user' });
    }

    const key = getSecureConversationKey(user_id, volunteer_id);
    const messages = secure_chat_db[key] || [];
    return res.status(200).json({ connected: true, messages });
});

app.post('/api/secure-chat/volunteer/:volunteer_id/:user_id', (req, res) => {
    const volunteer_id = parseInt(req.params.volunteer_id);
    const user_id = parseInt(req.params.user_id);
    const { sender_id, text } = req.body;

    if (!users_db[volunteer_id] || users_db[volunteer_id].role !== 'volunteer') {
        return res.status(403).json({ error: 'Invalid volunteer account' });
    }
    if (!users_db[user_id] || users_db[user_id].role !== 'user') {
        return res.status(404).json({ error: 'User not found' });
    }
    if (parseInt(sender_id) !== volunteer_id) {
        return res.status(403).json({ error: 'Invalid sender for this chat' });
    }
    if (user_volunteer_map[user_id] !== volunteer_id) {
        return res.status(403).json({ error: 'Volunteer is not assigned to this user' });
    }
    if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'Message text is required' });
    }

    const key = getSecureConversationKey(user_id, volunteer_id);
    if (!secure_chat_db[key]) secure_chat_db[key] = [];

    const message = {
        sender_role: 'volunteer',
        sender_id: volunteer_id,
        text: text.trim().slice(0, 500),
        timestamp: new Date().toISOString()
    };
    secure_chat_db[key].push(message);

    return res.status(201).json({ success: true, message });
});

// ==================== Mistral AI Quiz Module Routes ====================

const questionsFilePath = path.join(__dirname, 'quiz-module/questions.json');
let allQuestions = [];
try {
    if (fs.existsSync(questionsFilePath)) {
        allQuestions = JSON.parse(fs.readFileSync(questionsFilePath, 'utf8'));
    }
} catch (e) {
    console.error("Error loading questions:", e);
}

app.get('/api/questions', (req, res) => {
    if (allQuestions.length < 10) return res.status(500).json({ error: 'Not enough questions available.' });
    const shuffled = [...allQuestions].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 10).map(q => ({ id: q.id, question: q.question, options: q.options.map((opt, i) => ({ id: i, description: opt.description })) }));
    res.json(selected);
});

app.post('/api/submit', async (req, res) => {
    const { answers } = req.body;
    if (!answers || !Array.isArray(answers)) return res.status(400).json({ error: 'Invalid answers format.' });
    let totalScore = 0, maxPossibleScore = 0;
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
DO NOT output markdown formatting blocks. Output ONLY raw JSON text.
    `;
    try {
        const mistralKey = process.env.MISTRAL_API_KEY;
        if (!mistralKey) throw new Error("MISTRAL_API_KEY is not defined.");
        const response = await axios.post('https://api.mistral.ai/v1/chat/completions',
            { model: 'mistral-small-latest', messages: [{ role: 'user', content: prompt }] },
            { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mistralKey}` } }
        );
        const aiText = response.data.choices[0].message.content.trim();
        const aiResult = JSON.parse(aiText.replace(/```json/g, '').replace(/```/g, '').trim());
        res.json({ score: percentage, feedback: aiResult });
    } catch (error) {
        console.error("AI Processing Error:", error.message);
        let category = percentage >= 75 ? "Good" : percentage <= 40 ? "Needs Support" : "Moderate";
        let fallbackMood = percentage >= 75 ? "Positive/Calm" : percentage <= 40 ? "Stressed/Anxious" : "Neutral";
        res.json({ score: percentage, feedback: { personalityType: "Unknown (AI Offline)", strengths: ["Self-awareness"], weaknesses: ["Unable to analyze further currently"], emotionalScore: percentage, category, mood: fallbackMood, suggestions: ["Take a moment to breathe and reflect.", "Drink some water and rest your mind.", "If you feel overwhelmed, consider talking to someone close to you."] } });
    }
});

// ==================== Health Route ====================

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'MindMitra + Nyxie AI Backend running' });
});

app.listen(PORT, () => {
    console.log(`✨ MindMitra + Nyxie AI running on http://localhost:${PORT}`);
    if (!process.env.MISTRAL_API_KEY) {
        console.warn('⚠️  MISTRAL_API_KEY not set — AI chat will use fallback responses');
    }
});
