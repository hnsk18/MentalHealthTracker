require('dotenv').config({ path: './quiz-module/.env', override: true });

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');


const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

// Keep a dedicated admin client for all server-side DB operations.
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

const createAuthClient = () =>
  createClient(supabaseUrl, supabaseAnonKey || supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'frontend')));
app.use('/quiz', express.static(path.join(__dirname, 'quiz-module/public')));

// In-memory runtime stores for app activity.
const moods_db = {};
const quiz_responses_db = {};
const messages_db = {};
const volunteer_requests_db = {}; // { userId: { requested_at, note, status, resolved_at? } }
const volunteer_assignments_db = {}; // { volunteerId: { [userId]: { assigned_at } } }
const user_volunteer_map = {}; // { userId: volunteerId }
const secure_chat_db = {}; // { "userId:volunteerId": [messages] }

const getSecureConversationKey = (userId, volunteerId) => `${userId}:${volunteerId}`;

// SSE clients for admin real-time notifications
const adminSSEClients = new Set();

function broadcastAdminNotification(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of adminSSEClients) {
    try { client.write(msg); } catch (_) { adminSSEClients.delete(client); }
  }
}

const QUIZ_QUESTIONS = [
  { id: 1, question: 'How often do you feel stressed?', options: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'], weight: [0, 1, 2, 3, 4] },
  { id: 2, question: 'How many hours do you sleep on average?', options: ['Less than 5', '5-6', '6-7', '7-8', 'More than 8'], weight: [4, 3, 2, 0, 1] },
  { id: 3, question: 'How would you rate your work-life balance?', options: ['Excellent', 'Good', 'Fair', 'Poor', 'Very Poor'], weight: [0, 1, 2, 3, 4] },
  { id: 4, question: 'Do you take regular breaks during work?', options: ['Always', 'Often', 'Sometimes', 'Rarely', 'Never'], weight: [0, 1, 2, 3, 4] },
  { id: 5, question: 'How is your physical health?', options: ['Excellent', 'Good', 'Fair', 'Poor', 'Very Poor'], weight: [0, 1, 2, 3, 4] }
];

const MOOD_EMOJI = { happy: '😊', sad: '😢', stressed: '😰', anxious: '😟', calm: '😌' };
const MOOD_COLORS = { happy: '#FFD700', sad: '#4169E1', stressed: '#FF6347', anxious: '#FF8C00', calm: '#90EE90' };

// ─── Emotion-to-Mood Mapping (GoEmotions → 5 app moods) ────────────────────
const EMOTION_TO_MOOD = {
  joy: 'happy', amusement: 'happy', excitement: 'happy', love: 'happy',
  admiration: 'happy', pride: 'happy',
  sadness: 'sad', grief: 'sad', disappointment: 'sad', remorse: 'sad',
  anger: 'stressed', annoyance: 'stressed', disgust: 'stressed', embarrassment: 'stressed',
  fear: 'anxious', nervousness: 'anxious', confusion: 'anxious',
  relief: 'calm', gratitude: 'calm', approval: 'calm', caring: 'calm',
  optimism: 'calm', neutral: 'calm', curiosity: 'calm', desire: 'calm',
  realization: 'calm', surprise: 'calm'
};

function mapEmotionToMood(dominantEmotion) {
  return EMOTION_TO_MOOD[(dominantEmotion || '').toLowerCase()] || 'calm';
}

// ─── Node.js keyword-based fallback classifier ─────────────────────────────
const KEYWORD_MOOD_MAP = {
  happy: ['happy', 'joy', 'excited', 'great', 'wonderful', 'amazing', 'love', 'fun',
    'laugh', 'smile', 'grateful', 'thankful', 'proud', 'awesome', 'fantastic',
    'good', 'blessed', 'cheerful', 'delighted', 'pleased'],
  sad: ['sad', 'cry', 'crying', 'depressed', 'lonely', 'alone', 'miss', 'lost',
    'grief', 'heartbroken', 'disappointed', 'unhappy', 'miserable', 'regret',
    'sorry', 'hopeless', 'empty', 'numb', 'pain', 'hurt'],
  stressed: ['stressed', 'pressure', 'overwhelmed', 'angry', 'frustrated',
    'irritated', 'annoyed', 'exhausted', 'burnout', 'tired', 'overwork',
    'deadline', 'tension', 'rage', 'furious', 'hate'],
  anxious: ['anxious', 'anxiety', 'worried', 'nervous', 'panic', 'scared',
    'afraid', 'fear', 'restless', 'uneasy', 'dread', 'overthink',
    'insecure', 'uncertain', 'confused', 'tense'],
  calm: ['calm', 'peaceful', 'relaxed', 'content', 'serene', 'fine', 'okay',
    'alright', 'balanced', 'steady', 'mindful', 'meditat', 'breathing',
    'chill', 'comfortable', 'safe', 'secure']
};

function keywordFallbackClassifier(text) {
  const lower = (text || '').toLowerCase();
  const scores = {};
  for (const [mood, keywords] of Object.entries(KEYWORD_MOOD_MAP)) {
    scores[mood] = 0;
    for (const kw of keywords) {
      // Count occurrences
      const regex = new RegExp(`\\b${kw}`, 'gi');
      const matches = lower.match(regex);
      if (matches) scores[mood] += matches.length;
    }
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const topMood = sorted[0][1] > 0 ? sorted[0][0] : 'calm';
  return {
    dominant_emotion: topMood,
    sentiment_score: topMood === 'happy' ? 0.6 : topMood === 'calm' ? 0.3 : topMood === 'sad' ? -0.6 : topMood === 'anxious' ? -0.4 : -0.3,
    emotions: sorted.filter(([, s]) => s > 0).map(([label, score]) => ({ label, score: Math.min(score / 5, 1) })),
    source: 'keyword_fallback'
  };
}

// ─── Analyze chat transcript and push mood ──────────────────────────────────
async function analyzeAndPushMood(userId, sessionId = 'default') {
  try {
    // 1. Fetch user messages from this session
    const { data: chatMessages, error: chatError } = await supabase
      .from('ai_chats')
      .select('sender, message, created_at')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .eq('sender', 'user')
      .order('created_at', { ascending: true });

    if (chatError || !chatMessages || chatMessages.length === 0) {
      return { analyzed: false, reason: 'no_messages' };
    }

    // 2. Concatenate user messages into a transcript
    const transcript = chatMessages.map(m => m.message).join('. ');
    if (transcript.trim().length < 10) {
      return { analyzed: false, reason: 'transcript_too_short' };
    }

    let classifierResult = null;

    // 3. Try Mistral API for emotion classification
    if (process.env.MISTRAL_API_KEY) {
      try {
        const mistral = await getMistral();
        const classifyPrompt = `Analyze the emotional content of the following user messages from a mental health chat session. Return ONLY valid JSON with no markdown formatting.

User messages:
"""${transcript.slice(0, 3000)}"""

Return this exact JSON structure:
{
  "dominant_emotion": "<one of: joy, sadness, anger, fear, love, surprise, disgust, grief, nervousness, embarrassment, pride, relief, gratitude, optimism, excitement, amusement, admiration, approval, caring, confusion, curiosity, desire, disappointment, disapproval, annoyance, remorse, realization, neutral>",
  "sentiment_score": <number from -1.0 (very negative) to 1.0 (very positive)>,
  "emotions": [
    {"label": "<emotion>", "score": <0.0 to 1.0>},
    {"label": "<emotion>", "score": <0.0 to 1.0>},
    {"label": "<emotion>", "score": <0.0 to 1.0>}
  ]
}

Respond with ONLY the JSON object, nothing else.`;

        const classifyResponse = await mistral.chat.complete({
          model: 'mistral-small-latest',
          messages: [{ role: 'user', content: classifyPrompt }],
          maxTokens: 200,
          temperature: 0.1
        });

        const rawText = classifyResponse.choices[0].message.content.trim();
        const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        classifierResult = {
          dominant_emotion: parsed.dominant_emotion || 'neutral',
          sentiment_score: typeof parsed.sentiment_score === 'number' ? parsed.sentiment_score : 0,
          emotions: Array.isArray(parsed.emotions) ? parsed.emotions.slice(0, 4) : [],
          source: 'mistral'
        };
        console.log('Mistral emotion classification for user:', userId, '->', classifierResult.dominant_emotion);
      } catch (mistralError) {
        console.warn('Mistral classifier failed, using keyword fallback:', mistralError.message);
      }
    }

    // 4. Fall back to keyword classifier if Mistral didn't work
    if (!classifierResult) {
      console.log('Using keyword fallback classifier for user:', userId);
      classifierResult = keywordFallbackClassifier(transcript);
    }

    // 5. Map to app mood
    const mood = classifierResult.source === 'keyword_fallback'
      ? classifierResult.dominant_emotion
      : mapEmotionToMood(classifierResult.dominant_emotion);

    // 6. Insert mood into mood_logs
    const { data: insertedMood, error: insertError } = await supabase
      .from('mood_logs')
      .insert([{ user_id: userId, mood }])
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert auto mood:', insertError.message);
      return { analyzed: true, saved: false, error: insertError.message };
    }

    // 7. Save to chat_sessions for history tracking
    try {
      await supabase.from('chat_sessions').insert([{
        session_id: sessionId,
        user_id: userId,
        transcript: transcript.slice(0, 5000),
        dominant_emotion: classifierResult.dominant_emotion || 'neutral',
        sentiment_score: classifierResult.sentiment_score || 0,
        emotion_tags: classifierResult.emotions || [],
        analyzed_at: new Date().toISOString()
      }]);
    } catch (csErr) {
      console.warn('chat_sessions insert failed (non-fatal):', csErr.message);
    }

    return {
      analyzed: true,
      saved: true,
      mood,
      mood_entry: {
        mood: insertedMood.mood,
        timestamp: insertedMood.created_at,
        emoji: MOOD_EMOJI[insertedMood.mood] || '😐',
        color: MOOD_COLORS[insertedMood.mood] || '#808080',
        source: 'ai_chat'
      },
      classifier: {
        dominant_emotion: classifierResult.dominant_emotion,
        sentiment_score: classifierResult.sentiment_score,
        emotions: (classifierResult.emotions || []).slice(0, 4),
        source: classifierResult.source
      }
    };
  } catch (err) {
    console.error('analyzeAndPushMood error:', err);
    return { analyzed: false, reason: 'internal_error', error: err.message };
  }
}

const ANON_PREFIXES = ['Calm', 'Kind', 'Brave', 'Quiet', 'Gentle', 'Bright', 'Steady', 'Hopeful'];
const ANON_ANIMALS = ['Otter', 'Robin', 'Koala', 'Panda', 'Fox', 'Dolphin', 'Sparrow', 'Turtle'];

const getAnonymousName = (userId) => {
  const id = `${userId || ''}`;
  if (!id) return 'Anonymous Friend';
  const seed = id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return `${ANON_PREFIXES[seed % ANON_PREFIXES.length]} ${ANON_ANIMALS[(seed * 7) % ANON_ANIMALS.length]}`;
};

const MOOD_RESPONSES = {
  happy: {
    message: 'Great to see you feeling good! Keep it up 💙',
    actions: [
      { label: '📓 Write Journal', route: 'journal' },
      { label: '📊 View Dashboard', route: 'profile' }
    ]
  },
  sad: {
    message: "It's okay to feel this way. You're not alone 💙",
    actions: [
      { label: '🤖 Talk to AI', route: 'messaging' },
      { label: '🤝 Connect to Volunteer', route: 'volunteer-dashboard' },
      { label: '📓 Write Journal', route: 'journal' }
    ]
  },
  stressed: {
    message: "Let's slow down together. Take a deep breath 🫁",
    actions: [
      { label: '🧘 Start Breathing Exercise', route: 'breathing' },
      { label: '🤖 Talk to AI', route: 'messaging' }
    ]
  },
  anxious: {
    message: "You're safe. Let's take this one step at a time 💙",
    actions: [
      { label: '🤖 Talk to AI', route: 'messaging' },
      { label: '🧘 Calm Exercise', route: 'breathing' }
    ]
  },
  calm: {
    message: "You're in a good place. Keep maintaining your balance 🌿",
    actions: [
      { label: '📓 Write Journal', route: 'journal' },
      { label: '📊 View Progress', route: 'profile' }
    ]
  }
};

const NYXIE_SYSTEM_PROMPT = `
You are Nyxie, a compassionate peer listener on Sevak - a safe mental wellness space for youth.

YOUR IDENTITY & ROLE:
- You are NOT a therapist, doctor, or counselor. You are a warm, non-judgmental listener.
- You were trained on youth mental health conversation principles, active listening, and empathetic reflection.
- You are calm, grounded, and never panicked - even when someone shares something heavy.

CORE RULES - NEVER BREAK THESE:
1. NEVER diagnose the user. Do not use clinical labels like "depression", "anxiety disorder", "OCD", or similar.
2. NEVER tell the user what they SHOULD feel or SHOULD do.
3. NEVER minimize their experience. Phrases like "it's not that bad" or "others have it worse" are forbidden.
4. NEVER claim to be a human if sincerely asked.
5. Keep responses SHORT - 2-4 sentences max. This is a mobile chat app.

CONVERSATION STYLE:
- Acknowledge what the user shared before asking anything.
- Ask only ONE open-ended question at a time.
- Mirror back what you heard before adding anything new.
- Normalize emotions - make the user feel they are not alone and not "broken."

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
  'hopeless', 'worthless', 'hurt myself', 'kill myself', 'end my life',
  'suicide', 'want to die', 'no reason to live', 'better off dead',
  'self harm', 'cut myself', 'overdose'
];

const detectCrisis = (message) => {
  const lower = message.toLowerCase();
  return CRISIS_KEYWORDS.some((kw) => lower.includes(kw));
};

let _mistralClient = null;
const getMistral = async () => {
  if (!_mistralClient) {
    const { Mistral } = await import('@mistralai/mistralai');
    _mistralClient = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  }
  return _mistralClient;
};

async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, dummy_name, role, region, age')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data;
}

async function requireUserWithRole(userId, role) {
  const profile = await getUserProfile(userId);
  if (!profile) return { ok: false, reason: 'not_found' };
  if (role && profile.role !== role) return { ok: false, reason: 'wrong_role', profile };
  return { ok: true, profile };
}

// ==================== Authentication ====================

app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name, role = 'user', is_licensed = false, expertise = '',region, age } = req.body;

    // Admin accounts can only be created via direct SQL by the DBMS manager
    if (role === 'admin') {
      return res.status(403).json({ error: 'Admin accounts cannot be registered through the application. Contact the database administrator.' });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError || !authData.user) {
      return res.status(400).json({ error: authError ? authError.message : 'Unable to register user' });
    }

    const userId = authData.user.id;

    // Volunteers start with 'pending' approval; users are auto-approved
    const approval_status = role === 'volunteer' ? 'pending' : 'approved';

    const userRow = {
      id: userId,
      dummy_name: name,
      role,
      approval_status,
      region: region || null,
      age: age ? parseInt(age) : null
    };

    // Add volunteer-specific fields
    if (role === 'volunteer') {
      userRow.is_licensed = !!is_licensed;
      userRow.expertise = `${expertise}`.trim().slice(0, 500);
    }

    const { error: insertError } = await supabase.from('users').insert([userRow]);

    if (insertError) {
      return res.status(400).json({ error: insertError.message });
    }

    moods_db[userId] = [];
    quiz_responses_db[userId] = [];
    messages_db[userId] = [];
    volunteer_requests_db[userId] = null;

    // Notify connected admin dashboards in real-time
    broadcastAdminNotification('new_account', {
      user_id: userId,
      name,
      role,
      approval_status,
      region: region || null,
      age: age ? parseInt(age) : null,
      created_at: new Date().toISOString()
    });

    const message = role === 'volunteer'
      ? 'Registration successful! Your account is pending admin approval.'
      : 'Registration successful';

    return res.status(201).json({ success: true, user_id: userId, approval_status, message });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Use an isolated auth client so user sign-in does not overwrite admin client auth state.
    const authClient = createAuthClient();
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Fetch full profile including approval_status
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, dummy_name, role, approval_status, is_licensed, expertise')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Check volunteer approval status
    if (profile.role === 'volunteer') {
      if (profile.approval_status === 'pending') {
        return res.status(403).json({
          error: 'Your volunteer account is pending admin approval. Please wait for an administrator to review your application.',
          code: 'PENDING_APPROVAL'
        });
      }
      if (profile.approval_status === 'rejected') {
        return res.status(403).json({
          error: 'Your volunteer application has been rejected by an administrator. Please contact support for more information.',
          code: 'REJECTED'
        });
      }
    }

    return res.status(200).json({
      success: true,
      user_id: data.user.id,
      name: profile.dummy_name,
      role: profile.role,
      email: data.user.email,
      approval_status: profile.approval_status || 'approved'
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/user/:user_id', async (req, res) => {
  const userId = req.params.user_id;
  const profile = await getUserProfile(userId);
  if (!profile) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.status(200).json({
    id: profile.id,
    name: profile.dummy_name,
    role: profile.role,
    region: profile.region,
    age: profile.age
  });
});

// ==================== Community Feed (DB) ====================

app.get('/api/feed/posts', async (req, res) => {
  try {
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select('id, user_id, caption, image_url, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (postsError) {
      return res.status(500).json({ error: postsError.message });
    }

    const userIds = [...new Set((posts || []).map((p) => p.user_id))];
    const postIds = (posts || []).map((p) => p.id);

    let usersById = {};
    if (userIds.length) {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, dummy_name')
        .in('id', userIds);

      if (usersError) return res.status(500).json({ error: usersError.message });
      usersById = (users || []).reduce((acc, u) => {
        acc[u.id] = getAnonymousName(u.id);
        return acc;
      }, {});
    }

    let commentsByPost = {};
    if (postIds.length) {
      const { data: comments, error: commentsError } = await supabase
        .from('comments')
        .select('id, post_id, user_id, comment, created_at')
        .in('post_id', postIds)
        .order('created_at', { ascending: true });

      if (commentsError) return res.status(500).json({ error: commentsError.message });

      const commentUserIds = [...new Set((comments || []).map((c) => c.user_id))];
      let commentUsersById = {};
      if (commentUserIds.length) {
        const { data: commentUsers, error: commentUsersError } = await supabase
          .from('users')
          .select('id, dummy_name')
          .in('id', commentUserIds);
        if (commentUsersError) return res.status(500).json({ error: commentUsersError.message });
        commentUsersById = (commentUsers || []).reduce((acc, u) => {
          acc[u.id] = getAnonymousName(u.id);
          return acc;
        }, {});
      }

      (comments || []).forEach((c) => {
        if (!commentsByPost[c.post_id]) commentsByPost[c.post_id] = [];
        commentsByPost[c.post_id].push({
          id: c.id,
          userId: c.user_id,
          petName: commentUsersById[c.user_id] || 'Pet Friend',
          text: c.comment,
          timestamp: c.created_at
        });
      });
    }

    const payload = (posts || []).map((p) => ({
      id: p.id,
      userId: p.user_id,
      petName: usersById[p.user_id] || 'Pet Friend',
      text: p.caption || '',
      image_url: p.image_url || null,
      timestamp: p.created_at,
      comments: commentsByPost[p.id] || []
    }));

    return res.status(200).json({ posts: payload });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/feed/posts', async (req, res) => {
  try {
    const { user_id, caption = '' } = req.body;
    const check = await requireUserWithRole(user_id, null);
    if (!check.ok) return res.status(404).json({ error: 'User not found' });
    if (!['user', 'volunteer'].includes(check.profile.role)) {
      return res.status(403).json({ error: 'Only users and volunteers can post' });
    }

    const cleanCaption = `${caption}`.trim();
    if (!cleanCaption) return res.status(400).json({ error: 'caption is required' });

    const { data: inserted, error } = await supabase
      .from('posts')
      .insert([{ user_id, caption: cleanCaption }])
      .select('id, user_id, caption, created_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json({
      success: true,
      post: {
        id: inserted.id,
        userId: inserted.user_id,
        petName: getAnonymousName(inserted.user_id),
        text: inserted.caption,
        timestamp: inserted.created_at,
        comments: []
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/feed/posts/:post_id/comments', async (req, res) => {
  try {
    const { post_id } = req.params;
    const { user_id, comment = '' } = req.body;

    const check = await requireUserWithRole(user_id, null);
    if (!check.ok) return res.status(404).json({ error: 'User not found' });
    if (!['user', 'volunteer'].includes(check.profile.role)) {
      return res.status(403).json({ error: 'Only users and volunteers can comment' });
    }

    const cleanComment = `${comment}`.trim();
    if (!cleanComment) return res.status(400).json({ error: 'comment is required' });

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id')
      .eq('id', post_id)
      .single();

    if (postError || !post) return res.status(404).json({ error: 'Post not found' });

    const { data: inserted, error } = await supabase
      .from('comments')
      .insert([{ post_id, user_id, comment: cleanComment }])
      .select('id, post_id, user_id, comment, created_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json({
      success: true,
      comment: {
        id: inserted.id,
        postId: inserted.post_id,
        userId: inserted.user_id,
        petName: getAnonymousName(inserted.user_id),
        text: inserted.comment,
        timestamp: inserted.created_at
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// ==================== Mood ====================

app.post('/api/mood', async (req, res) => {
  const { user_id, mood } = req.body;
  const check = await requireUserWithRole(user_id, 'user');
  if (!check.ok) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!mood) return res.status(400).json({ error: 'mood is required' });

  const { data: insertedMood, error: insertError } = await supabase
    .from('mood_logs')
    .insert([{ user_id, mood }])
    .select()
    .single();

  if (insertError) {
    console.error('mood_logs insert error:', insertError.message);
    return res.status(500).json({ error: insertError.message });
  }

  const mood_entry = {
    mood: insertedMood.mood,
    timestamp: insertedMood.created_at,
    emoji: MOOD_EMOJI[insertedMood.mood] || '\ud83d\ude10',
    color: MOOD_COLORS[insertedMood.mood] || '#808080'
  };

  const moodResponse = MOOD_RESPONSES[mood] || {
    message: 'Thank you for sharing how you feel \ud83d\udc99',
    actions: [{ label: '\ud83d\udcca View Dashboard', route: 'profile' }]
  };

  return res.status(201).json({ success: true, mood_entry, response: moodResponse });
});

app.get('/api/mood/:user_id', async (req, res) => {
  const userId = req.params.user_id;
  const check = await requireUserWithRole(userId, 'user');
  if (!check.ok) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { data: moods, error } = await supabase
    .from('mood_logs')
    .select('mood, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const mood_counts = {};
  const formatted_moods = (moods || []).map(m => {
    mood_counts[m.mood] = (mood_counts[m.mood] || 0) + 1;
    return {
      mood: m.mood,
      timestamp: m.created_at,
      emoji: MOOD_EMOJI[m.mood] || '\ud83d\ude10',
      color: MOOD_COLORS[m.mood] || '#808080'
    };
  });

  const current_mood = formatted_moods.length > 0
    ? formatted_moods[formatted_moods.length - 1]
    : { mood: 'neutral', emoji: '\ud83d\ude10', color: '#808080' };

  return res.status(200).json({
    current_mood,
    mood_history: formatted_moods.slice(-7),
    mood_counts,
    total_moods: formatted_moods.length
  });
});

// ==================== Quiz ====================

app.get('/api/quiz', (req, res) => {
  return res.status(200).json({ questions: QUIZ_QUESTIONS, total_questions: QUIZ_QUESTIONS.length });
});

app.post('/api/quiz/submit', async (req, res) => {
  const { user_id, answers } = req.body;
  const check = await requireUserWithRole(user_id, 'user');
  if (!check.ok) {
    return res.status(404).json({ error: 'User not found' });
  }

  let total_score = 0;
  answers.forEach((answer, i) => {
    if (i < QUIZ_QUESTIONS.length) {
      const question = QUIZ_QUESTIONS[i];
      if (answer >= 0 && answer < question.weight.length) total_score += question.weight[answer];
    }
  });

  const average_score = QUIZ_QUESTIONS.length ? total_score / QUIZ_QUESTIONS.length : 0;
  let stress_level;
  let recommendation;

  if (average_score < 1.5) {
    stress_level = 'Low';
    recommendation = 'Great! Keep maintaining your healthy habits.';
  } else if (average_score < 2.5) {
    stress_level = 'Medium';
    recommendation = 'Consider taking more breaks and practicing mindfulness.';
  } else {
    stress_level = 'High';
    recommendation = 'Please consider seeking professional help and taking rest.';
  }

  const quiz_result = {
    timestamp: new Date().toISOString(),
    score: total_score,
    average_score: Math.round(average_score * 100) / 100,
    stress_level,
    recommendation
  };

  try {
    const { data: attempt, error: attemptError } = await supabase
      .from('quiz_attempts')
      .insert([{
        user_id,
        score: quiz_result.score,
        average_score: quiz_result.average_score,
        stress_level: quiz_result.stress_level,
        recommendation: quiz_result.recommendation
      }])
      .select()
      .single();

    if (attemptError) {
      console.error('quiz_attempts insert error:', attemptError.message);
      return res.status(500).json({ success: false, error: 'Failed to save quiz attempt' });
    }

    if (Array.isArray(answers) && answers.length > 0) {
      const answerRows = answers.map((answer, i) => {
        const question = QUIZ_QUESTIONS[i] || {};
        return {
          attempt_id: attempt.id,
          question_id: question.id || i + 1,
          answer: String(answer),
          weight: typeof answer === 'number' ? question.weight?.[answer] ?? null : null
        };
      });

      const { error: answersError } = await supabase.from('quiz_answers').insert(answerRows);
      if (answersError) console.error('quiz_answers insert error:', answersError.message);
    }

    const summaryText = `Stress level: ${stress_level}. ${recommendation}`;
    const { error: summaryError } = await supabase.from('ai_summaries').insert([{
      user_id,
      quiz_attempt_id: attempt.id,
      summary: summaryText,
      risk_level: stress_level,
      source: 'quiz_assessment'
    }]);

    if (summaryError) console.error('ai_summaries insert error:', summaryError.message);
  } catch (err) {
    console.error('quiz submit DB error:', err.message);
    return res.status(500).json({ success: false, error: 'Database write failed' });
  }

  return res.status(201).json({ success: true, result: quiz_result });
});

app.get('/api/quiz/history/:user_id', async (req, res) => {
  const userId = req.params.user_id;
  const check = await requireUserWithRole(userId, 'user');
  if (!check.ok) {
    return res.status(404).json({ error: 'User not found' });
  }

  let { data: history, error } = await supabase
    .from('quiz_attempts')
    .select('id, score, average_score, stress_level, recommendation, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.warn('quiz_history query (full fields) error:', error.message);
    const fallback = await supabase
      .from('quiz_attempts')
      .select('id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (fallback.error) {
      console.error('quiz_history fallback query error:', fallback.error.message);
      return res.status(500).json({ error: fallback.error.message });
    }
    history = (fallback.data || []).map((r) => ({
      id: r.id,
      created_at: r.created_at,
      score: null,
      average_score: null,
      stress_level: null,
      recommendation: null
    }));
  }

  return res.status(200).json({ history: history || [] });
});

// ==================== Nyxie Chat ====================

app.post('/api/chat', async (req, res) => {
  const { user_id, message, isJournalingMode = false, skipHistory = false } = req.body;
  const check = await requireUserWithRole(user_id, 'user');
  if (!check.ok) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  const session_id = req.body.session_id || 'default';
  const userMsg = { role: 'user', content: message, timestamp: new Date().toISOString() };

  // Only persist to DB if not a system/context-only message
  if (!skipHistory) {
    await supabase.from('ai_chats').insert([
      {
        user_id,
        message,
        sender: 'user',
        session_id
      }
    ]);
  }

  if (detectCrisis(message)) {
    const crisisReply = {
      sender: 'ai',
      type: 'CRISIS_ESCALATION',
      text: 'It sounds like you might be going through something really painful right now. You deserve support from a real person.',
      helpline: 'iCall (TISS): 9152987821',
      timestamp: new Date().toISOString()
    };

    if (!skipHistory) {
      await supabase.from('ai_chats').insert([
        {
          user_id,
          message: crisisReply.text,
          sender: 'ai',
          session_id
        }
      ]);
    }
    return res.status(200).json({ success: true, user_message: userMsg, ai_response: crisisReply });
  }

  if (!process.env.MISTRAL_API_KEY) {
    const fallback = {
      sender: 'ai',
      type: 'AI_RESPONSE',
      text: "I'm here and listening. Tell me more about what's on your mind.",
      timestamp: new Date().toISOString()
    };
    if (!skipHistory) {
      await supabase.from('ai_chats').insert([
        {
          user_id,
          message: fallback.text,
          sender: 'ai',
          session_id
        }
      ]);
    }
    return res.status(200).json({ success: true, user_message: userMsg, ai_response: fallback });
  }

  try {
    const { data: dbHistory } = await supabase
      .from('ai_chats')
      .select('sender, message, created_at')
      .eq('user_id', user_id)
      .eq('session_id', session_id)
      .order('created_at', { ascending: false })
      .limit(12);

    const history = (dbHistory || [])
      .slice()
      .reverse()
      .map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.message }));

    const mistral = await getMistral();
    const chatResponse = await mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: buildSystemPrompt(isJournalingMode) },
        ...history,
        { role: 'user', content: message }
      ],
      maxTokens: 300,
      temperature: 0.75
    });

    const aiText = chatResponse.choices[0].message.content;
    const aiMsg = { role: 'assistant', content: aiText, timestamp: new Date().toISOString() };

    if (!skipHistory) {
      await supabase.from('ai_chats').insert([
        {
          user_id,
          message: aiText,
          sender: 'ai',
          session_id
        }
      ]);
    }

    return res.status(200).json({
      success: true,
      user_message: userMsg,
      ai_response: { sender: 'ai', type: 'AI_RESPONSE', text: aiText, timestamp: aiMsg.timestamp }
    });
  } catch (err) {
    const fallback = {
      sender: 'ai',
      type: 'AI_RESPONSE',
      text: "I'm here with you. Something went wrong on my end - want to try sharing again?",
      timestamp: new Date().toISOString()
    };

    if (!skipHistory) {
      await supabase.from('ai_chats').insert([
        {
          user_id,
          message: fallback.text,
          sender: 'ai',
          session_id
        }
      ]);
    }
    return res.status(200).json({ success: true, user_message: userMsg, ai_response: fallback });
  }
});

app.get('/api/chat/:user_id', async (req, res) => {
  const userId = req.params.user_id;
  const check = await requireUserWithRole(userId, 'user');
  if (!check.ok) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { data, error } = await supabase
    .from('ai_chats')
    .select('sender, message, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const messages = (data || []).map((m) => ({
    sender: m.sender === 'user' ? 'user' : 'ai',
    text: m.message,
    timestamp: m.created_at
  }));

  return res.status(200).json({ messages });
});

// ─── Analyze mood from chat conversation ────────────────────────────────────
app.post('/api/chat/analyze-mood', async (req, res) => {
  const { user_id, session_id } = req.body;
  const check = await requireUserWithRole(user_id, 'user');
  if (!check.ok) {
    return res.status(404).json({ error: 'User not found' });
  }

  const result = await analyzeAndPushMood(user_id, session_id || 'default');
  return res.status(200).json(result);
});

app.delete('/api/chat/:user_id', async (req, res) => {
  const userId = req.params.user_id;
  const check = await requireUserWithRole(userId, 'user');
  if (!check.ok) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { error } = await supabase.from('ai_chats').delete().eq('user_id', userId);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true });
});

// ==================== Recommendations ====================

app.get('/api/music-recommendation/:mood', (req, res) => {
  const mood = req.params.mood;
  const music_recommendations = {
    happy: { genre: 'Upbeat Pop', youtube_query: 'upbeat happy music', description: 'Feel-good tracks to boost your mood!' },
    sad: { genre: 'Emotional Ballads', youtube_query: 'emotional healing music', description: 'Soothing music to help you process emotions.' },
    stressed: { genre: 'Chill Ambient', youtube_query: 'ambient relaxation music', description: 'Calming background music for stress relief.' },
    anxious: { genre: 'Meditation Sounds', youtube_query: 'meditation relaxation music', description: 'Peaceful sounds to ease anxiety.' },
    calm: { genre: 'Soft Jazz', youtube_query: 'smooth jazz music', description: 'Smooth tunes to maintain your peaceful state.' }
  };

  return res.status(200).json(music_recommendations[mood] || { genre: 'Peaceful Music', youtube_query: 'relaxing music', description: 'Enjoy some calming music.' });
});

// ==================== Admin ====================

// SSE: Real-time notifications stream for admin
app.get('/api/admin/notifications/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send a heartbeat every 25s to keep connection alive
  const heartbeat = setInterval(() => {
    try { res.write(':heartbeat\n\n'); } catch (_) {}
  }, 25000);

  adminSSEClients.add(res);

  req.on('close', () => {
    clearInterval(heartbeat);
    adminSSEClients.delete(res);
  });
});

// GET /api/admin/volunteers — list all volunteers
app.get('/api/admin/volunteers', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, dummy_name, role')
      .eq('role', 'volunteer');

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ volunteers: data || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/volunteers — add a new volunteer
app.post('/api/admin/volunteers', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, and name are required' });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError || !authData.user) {
      return res.status(400).json({ error: authError ? authError.message : 'Could not create user' });
    }

    const userId = authData.user.id;
    const { error: insertError } = await supabase.from('users').insert([{
      id: userId,
      dummy_name: name,
      role: 'volunteer'
    }]);

    if (insertError) return res.status(400).json({ error: insertError.message });

    moods_db[userId] = [];
    quiz_responses_db[userId] = [];
    messages_db[userId] = [];
    volunteer_requests_db[userId] = null;

    return res.status(201).json({ success: true, volunteer: { id: userId, name, email } });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/volunteers/:id — remove a volunteer
app.delete('/api/admin/volunteers/:id', async (req, res) => {
  try {
    const volunteerId = req.params.id;

    const { error: deleteUserErr } = await supabase.from('users').delete().eq('id', volunteerId);
    if (deleteUserErr) return res.status(500).json({ error: deleteUserErr.message });

    const { error: deleteAuthErr } = await supabase.auth.admin.deleteUser(volunteerId);
    if (deleteAuthErr) return res.status(500).json({ error: deleteAuthErr.message });

    return res.status(200).json({ success: true, message: 'Volunteer removed' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// ==================== Admin: User Management ====================

// GET /api/admin/users — list all users (all roles)
app.get('/api/admin/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, dummy_name, role, approval_status, is_licensed, expertise, created_at')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ users: data || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/users/:id — delete any user
app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    const { error: deleteUserErr } = await supabase.from('users').delete().eq('id', userId);
    if (deleteUserErr) return res.status(500).json({ error: deleteUserErr.message });

    const { error: deleteAuthErr } = await supabase.auth.admin.deleteUser(userId);
    if (deleteAuthErr) return res.status(500).json({ error: deleteAuthErr.message });

    return res.status(200).json({ success: true, message: 'User removed' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// ==================== Admin: Volunteer Approval ====================

// GET /api/admin/pending-volunteers — list volunteers pending approval
app.get('/api/admin/pending-volunteers', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, dummy_name, role, approval_status, is_licensed, expertise, created_at')
      .eq('role', 'volunteer')
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ volunteers: data || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/volunteers/:id/approve — approve a volunteer
app.post('/api/admin/volunteers/:id/approve', async (req, res) => {
  try {
    const volunteerId = req.params.id;
    const { error } = await supabase
      .from('users')
      .update({ approval_status: 'approved' })
      .eq('id', volunteerId)
      .eq('role', 'volunteer');

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, message: 'Volunteer approved' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/volunteers/:id/reject — reject a volunteer
app.post('/api/admin/volunteers/:id/reject', async (req, res) => {
  try {
    const volunteerId = req.params.id;
    const { error } = await supabase
      .from('users')
      .update({ approval_status: 'rejected' })
      .eq('id', volunteerId)
      .eq('role', 'volunteer');

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, message: 'Volunteer rejected' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// ==================== Student Feedback ====================

// POST /api/feedback — submit feedback after volunteer session
app.post('/api/feedback', async (req, res) => {
  try {
    const { user_id, volunteer_id, rating, feedback_text = '' } = req.body;

    if (!user_id || !volunteer_id) {
      return res.status(400).json({ error: 'user_id and volunteer_id are required' });
    }
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating must be between 1 and 5' });
    }

    const userCheck = await requireUserWithRole(user_id, 'user');
    if (!userCheck.ok) return res.status(404).json({ error: 'User not found' });

    const volunteerCheck = await requireUserWithRole(volunteer_id, 'volunteer');
    if (!volunteerCheck.ok) return res.status(404).json({ error: 'Volunteer not found' });

    // AI sentiment analysis via Mistral
    let sentiment_score = 0;
    let ai_analysis = '';
    const cleanText = `${feedback_text}`.trim();

    if (cleanText.length > 5 && process.env.MISTRAL_API_KEY) {
      try {
        const mistral = await getMistral();
        const analysisPrompt = `Analyze the following student feedback about a volunteer mentor in a mental health support platform. Return ONLY valid JSON with no markdown formatting.

Student feedback: "${cleanText.slice(0, 2000)}"
Rating given: ${rating}/5

Return this exact JSON structure:
{
  "sentiment_score": <number from -1.0 (very negative) to 1.0 (very positive)>,
  "summary": "<one sentence summary of the feedback>",
  "key_positives": ["<positive aspect 1>", "<positive aspect 2>"],
  "key_concerns": ["<concern 1>", "<concern 2>"],
  "volunteer_quality": "<one of: Excellent, Good, Average, Below Average, Poor>"
}

Respond with ONLY the JSON object, nothing else.`;

        const response = await mistral.chat.complete({
          model: 'mistral-small-latest',
          messages: [{ role: 'user', content: analysisPrompt }],
          maxTokens: 300,
          temperature: 0.1
        });

        const rawText = response.choices[0].message.content.trim();
        const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        sentiment_score = typeof parsed.sentiment_score === 'number' ? parsed.sentiment_score : 0;
        ai_analysis = JSON.stringify(parsed);
        console.log('Feedback AI analysis for volunteer:', volunteer_id, '-> sentiment:', sentiment_score);
      } catch (aiErr) {
        console.warn('Feedback AI analysis failed (non-fatal):', aiErr.message);
        // Fallback: estimate sentiment from rating
        sentiment_score = (rating - 3) / 2; // Maps 1-5 to -1.0 to 1.0
      }
    } else {
      // No text or no API key — estimate from rating
      sentiment_score = (rating - 3) / 2;
    }

    const { data: inserted, error } = await supabase
      .from('volunteer_feedback')
      .insert([{
        user_id,
        volunteer_id,
        rating,
        feedback_text: cleanText.slice(0, 1000),
        sentiment_score,
        ai_analysis
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json({
      success: true,
      feedback: {
        id: inserted.id,
        rating: inserted.rating,
        sentiment_score: inserted.sentiment_score,
        created_at: inserted.created_at
      }
    });
  } catch (err) {
    console.error('Feedback error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/feedback/volunteer/:volunteer_id — get all feedback for a volunteer
app.get('/api/feedback/volunteer/:volunteer_id', async (req, res) => {
  try {
    const volunteerId = req.params.volunteer_id;
    const { data, error } = await supabase
      .from('volunteer_feedback')
      .select('id, user_id, rating, feedback_text, sentiment_score, ai_analysis, created_at')
      .eq('volunteer_id', volunteerId)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const feedbacks = (data || []).map(f => {
      let analysis = {};
      try { analysis = JSON.parse(f.ai_analysis || '{}'); } catch (_) {}
      return {
        ...f,
        ai_analysis: analysis
      };
    });

    // Calculate aggregate stats
    const ratings = feedbacks.map(f => f.rating);
    const avg_rating = ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;
    const avg_sentiment = feedbacks.length > 0
      ? Math.round((feedbacks.reduce((a, f) => a + (f.sentiment_score || 0), 0) / feedbacks.length) * 100) / 100
      : null;

    return res.status(200).json({
      feedbacks,
      stats: {
        total_feedbacks: feedbacks.length,
        avg_rating,
        avg_sentiment
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/feedback/pending/:user_id — check if user has unreviewd released volunteers
app.get('/api/feedback/pending/:user_id', async (req, res) => {
  try {
    const userId = req.params.user_id;
    const userCheck = await requireUserWithRole(userId, 'user');
    if (!userCheck.ok) return res.status(404).json({ error: 'User not found' });

    // Find the most recent RELEASE event for this user
    const { data: releases, error: relErr } = await supabase
      .from('volunteer_chats')
      .select('user_id, volunteer_id, created_at')
      .eq('user_id', userId)
      .eq('message', VOLUNTEER_CTRL_RELEASE)
      .order('created_at', { ascending: false })
      .limit(5);

    if (relErr || !releases || releases.length === 0) {
      return res.status(200).json({ has_pending: false });
    }

    // Check which of these releases the user has NOT yet given feedback for
    for (const release of releases) {
      const { data: existingFeedback } = await supabase
        .from('volunteer_feedback')
        .select('id')
        .eq('user_id', userId)
        .eq('volunteer_id', release.volunteer_id)
        .gte('created_at', release.created_at)
        .limit(1);

      if (!existingFeedback || existingFeedback.length === 0) {
        // Get volunteer name
        const volProfile = await getUserProfile(release.volunteer_id);
        return res.status(200).json({
          has_pending: true,
          volunteer_id: release.volunteer_id,
          volunteer_name: volProfile ? volProfile.dummy_name : 'Your Volunteer',
          released_at: release.created_at
        });
      }
    }

    return res.status(200).json({ has_pending: false });
  } catch (err) {
    console.error('Pending feedback check error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/volunteer-rankings — rank volunteers by student impact + feedback
app.get('/api/admin/volunteer-rankings', async (req, res) => {
  try {
    const POSITIVE_MOODS = new Set(['happy', 'calm', 'content', 'hopeful', 'relaxed', 'joyful', 'grateful', 'excited']);
    const NEGATIVE_MOODS = new Set(['sad', 'anxious', 'stressed', 'overwhelmed', 'angry', 'scared', 'depressed', 'worried']);

    // 1. Get all volunteers
    const { data: volunteers, error: vErr } = await supabase
      .from('users')
      .select('id, dummy_name')
      .eq('role', 'volunteer');
    if (vErr) return res.status(500).json({ error: vErr.message });

    // 2. Get all assignment control messages to know who was assigned to whom and when
    const { data: ctrlMsgs, error: ctrlErr } = await supabase
      .from('volunteer_chats')
      .select('user_id, volunteer_id, message, created_at')
      .in('message', ['__CTRL__:ASSIGNED', '__CTRL__:RELEASED'])
      .order('created_at', { ascending: true });
    if (ctrlErr) return res.status(500).json({ error: ctrlErr.message });

    // Build assignment windows per (volunteer, user): [{start, end|null}]
    const assignmentWindows = {}; // key: 'volunteerId:userId' -> [{start, end}]
    const openAssignments = {}; // key: 'volunteerId:userId' -> start timestamp

    for (const msg of (ctrlMsgs || [])) {
      const key = msg.volunteer_id + ':' + msg.user_id;
      if (msg.message === '__CTRL__:ASSIGNED') {
        openAssignments[key] = msg.created_at;
      } else if (msg.message === '__CTRL__:RELEASED') {
        if (!assignmentWindows[key]) assignmentWindows[key] = [];
        assignmentWindows[key].push({
          start: openAssignments[key] || msg.created_at,
          end: msg.created_at
        });
        delete openAssignments[key];
      }
    }
    // Close still-open assignments with now as end
    for (const [key, start] of Object.entries(openAssignments)) {
      if (!assignmentWindows[key]) assignmentWindows[key] = [];
      assignmentWindows[key].push({ start, end: new Date().toISOString() });
    }

    // 3. Get all mood logs
    const { data: moodLogs, error: moodErr } = await supabase
      .from('mood_logs')
      .select('user_id, mood, created_at')
      .order('created_at', { ascending: true });
    if (moodErr) return res.status(500).json({ error: moodErr.message });

    // 4. Get all volunteer feedback
    const { data: allFeedback, error: fbErr } = await supabase
      .from('volunteer_feedback')
      .select('volunteer_id, rating, sentiment_score');
    // Non-fatal if feedback table doesn't exist yet
    const feedbackByVolunteer = {};
    if (!fbErr && allFeedback) {
      for (const fb of allFeedback) {
        if (!feedbackByVolunteer[fb.volunteer_id]) feedbackByVolunteer[fb.volunteer_id] = [];
        feedbackByVolunteer[fb.volunteer_id].push(fb);
      }
    }

    // 5. Score each volunteer
    const rankings = [];

    for (const vol of (volunteers || [])) {
      let positiveImpacts = 0;
      let negativeImpacts = 0;
      let neutralImpacts = 0;
      const studentsSet = new Set();

      // Find all assignment windows for this volunteer
      for (const [key, windows] of Object.entries(assignmentWindows)) {
        if (!key.startsWith(vol.id + ':')) continue;
        const userId = key.split(':')[1];
        studentsSet.add(userId);

        for (const window of windows) {
          // Find moods just before and just after the assignment window
          const userMoods = (moodLogs || []).filter(m => m.user_id === userId);

          const before = userMoods.filter(m => new Date(m.created_at) < new Date(window.start)).slice(-1)[0];
          const after = userMoods.filter(m => new Date(m.created_at) > new Date(window.start))[0];

          if (!before || !after) { neutralImpacts++; continue; }

          const beforePos = POSITIVE_MOODS.has(before.mood?.toLowerCase());
          const beforeNeg = NEGATIVE_MOODS.has(before.mood?.toLowerCase());
          const afterPos = POSITIVE_MOODS.has(after.mood?.toLowerCase());
          const afterNeg = NEGATIVE_MOODS.has(after.mood?.toLowerCase());

          // Improved: was negative, now positive
          if (beforeNeg && afterPos) positiveImpacts++;
          // Worsened: was positive, now negative
          else if (beforePos && afterNeg) negativeImpacts++;
          // Both negative but stayed: slight negative
          else if (beforeNeg && afterNeg) negativeImpacts++;
          // Both positive: maintained positive
          else if (beforePos && afterPos) positiveImpacts++;
          else neutralImpacts++;
        }
      }

      const total = positiveImpacts + negativeImpacts + neutralImpacts;
      const moodScore = total > 0 ? Math.round(((positiveImpacts - negativeImpacts) / total) * 100) : null;

      // Calculate feedback-based score
      const volFeedbacks = feedbackByVolunteer[vol.id] || [];
      let feedbackAvgRating = null;
      let feedbackScore = null;
      if (volFeedbacks.length > 0) {
        feedbackAvgRating = Math.round((volFeedbacks.reduce((s, f) => s + f.rating, 0) / volFeedbacks.length) * 10) / 10;
        const avgSentiment = volFeedbacks.reduce((s, f) => s + (f.sentiment_score || 0), 0) / volFeedbacks.length;
        // Score: avg rating * 20 (maps 1-5 to 20-100) + sentiment adjustment (-10 to +10)
        feedbackScore = Math.round(feedbackAvgRating * 20 + avgSentiment * 10);
      }

      // Blended score: 60% feedback, 40% mood impact (if both available)
      let blendedScore;
      if (feedbackScore !== null && moodScore !== null) {
        blendedScore = Math.round(feedbackScore * 0.6 + moodScore * 0.4);
      } else if (feedbackScore !== null) {
        blendedScore = feedbackScore;
      } else {
        blendedScore = moodScore;
      }

      let label = 'No Data';
      let badge = 'grey';
      if (blendedScore !== null) {
        if (blendedScore >= 50) { label = 'Excellent'; badge = 'green'; }
        else if (blendedScore >= 0) { label = 'Good'; badge = 'yellow'; }
        else { label = 'Needs Improvement'; badge = 'red'; }
      }

      rankings.push({
        volunteer_id: vol.id,
        name: vol.dummy_name,
        students_helped: studentsSet.size,
        positive_impacts: positiveImpacts,
        negative_impacts: negativeImpacts,
        neutral_impacts: neutralImpacts,
        score: blendedScore,
        mood_score: moodScore,
        feedback_avg_rating: feedbackAvgRating,
        feedback_count: volFeedbacks.length,
        feedback_score: feedbackScore,
        label,
        badge
      });
    }

    // Sort: highest score first, nulls last
    rankings.sort((a, b) => {
      if (a.score === null && b.score === null) return 0;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score;
    });

    return res.status(200).json({ rankings });
  } catch (err) {
    console.error('Ranking error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/analytics', async (req, res) => {
  try {
    const { data: users, error } = await supabase.from('users').select('role');
    if (error) return res.status(500).json({ error: error.message });

    const role_distribution = {};
    users.forEach(u => { role_distribution[u.role] = (role_distribution[u.role] || 0) + 1; });

    // Mood distribution
    const { data: moodLogs } = await supabase.from('mood_logs').select('mood');
    const mood_distribution = {};
    let total_mood_entries = 0;
    (moodLogs || []).forEach(entry => {
      mood_distribution[entry.mood] = (mood_distribution[entry.mood] || 0) + 1;
      total_mood_entries++;
    });

    // ✅ NEW: Region + Age breakdown with mood
    const { data: userDetails } = await supabase
      .from('users')
      .select('id, region, age, role')
      .eq('role', 'user');

    const userIds = (userDetails || []).map(u => u.id);

    // Get negative mood counts per user
    const { data: negativeMoods } = await supabase
      .from('mood_logs')
      .select('user_id, mood')
      .in('mood', ['sad', 'anxious', 'stressed'])
      .in('user_id', userIds);

    // Count negative moods per user
    const negativeMoodsByUser = {};
    (negativeMoods || []).forEach(m => {
      negativeMoodsByUser[m.user_id] = (negativeMoodsByUser[m.user_id] || 0) + 1;
    });

    // Build region breakdown
    const region_breakdown = {};
    // Build age group breakdown
    const age_group_breakdown = {
      '13-15': { total: 0, negative_moods: 0 },
      '16-18': { total: 0, negative_moods: 0 },
      '19-21': { total: 0, negative_moods: 0 },
      '22-25': { total: 0, negative_moods: 0 },
      'Unknown': { total: 0, negative_moods: 0 }
    };

    (userDetails || []).forEach(u => {
      const region = u.region || 'Unknown';
      const negCount = negativeMoodsByUser[u.id] || 0;

      // Region
      if (!region_breakdown[region]) {
        region_breakdown[region] = { total_users: 0, negative_moods: 0 };
      }
      region_breakdown[region].total_users++;
      region_breakdown[region].negative_moods += negCount;

      // Age group
      const age = u.age ? parseInt(u.age) : null;
      let group = 'Unknown';
      if (age) {
        if (age <= 15) group = '13-15';
        else if (age <= 18) group = '16-18';
        else if (age <= 21) group = '19-21';
        else if (age <= 25) group = '22-25';
      }
      age_group_breakdown[group].total++;
      age_group_breakdown[group].negative_moods += negCount;
    });

    // Quiz attempts count
    const { data: quizAttempts } = await supabase.from('quiz_attempts').select('id');
    const total_quiz_attempts = (quizAttempts || []).length;

    return res.json({
      total_users: users.length,
      role_distribution,
      mood_distribution,
      average_stress_level: 0,
      total_mood_entries,
      total_quiz_attempts,
      region_breakdown,      // ← new
      age_group_breakdown    // ← new
    });

  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// ==================== Volunteer ====================

const VOLUNTEER_CTRL_ASSIGN = '__CTRL__:ASSIGNED';
const VOLUNTEER_CTRL_RELEASE = '__CTRL__:RELEASED';
const VOLUNTEER_CTRL_PENDING = '__CTRL__:PENDING_REQUEST';

function parseStressLevel(avg) {
  if (avg < 1.5) return 'Low';
  if (avg < 2.5) return 'Medium';
  return 'High';
}

async function getQuizRiskByUser() {
  const { data, error } = await supabase
    .from('quiz_answers')
    .select('user_id, weight, created_at');

  if (error || !data) return {};

  const riskMap = {};
  for (const ans of data) {
    if (!ans.user_id) continue;

    if (!riskMap[ans.user_id]) {
      riskMap[ans.user_id] = { total: 0, count: 0, last_quiz_date: ans.created_at };
    }

    const weight = Number(ans.weight || 0);
    riskMap[ans.user_id].total += weight;
    riskMap[ans.user_id].count += 1;

    if (new Date(ans.created_at) > new Date(riskMap[ans.user_id].last_quiz_date)) {
      riskMap[ans.user_id].last_quiz_date = ans.created_at;
    }
  }

  Object.keys(riskMap).forEach((uid) => {
    const entry = riskMap[uid];
    const avg = entry.count ? entry.total / entry.count : 0;
    entry.score = Math.round(entry.total);
    entry.average_score = Math.round(avg * 100) / 100;
    entry.stress_level = parseStressLevel(avg);
    entry.recommendation = entry.stress_level === 'Low'
      ? 'Great! Keep maintaining your healthy habits.'
      : entry.stress_level === 'Medium'
        ? 'Consider taking more breaks and practicing mindfulness.'
        : 'Please consider seeking professional help and taking rest.';
    delete entry.total;
    delete entry.count;
  });

  return riskMap;
}

async function getAssignmentSnapshot() {
  const { data, error } = await supabase
    .from('volunteer_chats')
    .select('user_id, volunteer_id, message, created_at')
    .in('message', [VOLUNTEER_CTRL_ASSIGN, VOLUNTEER_CTRL_RELEASE])
    .order('created_at', { ascending: true });

  if (error || !data) return { byUser: {}, byVolunteer: {} };

  const byUser = {};
  for (const row of data) {
    if (row.message === VOLUNTEER_CTRL_ASSIGN) {
      byUser[row.user_id] = { volunteer_id: row.volunteer_id, assigned_at: row.created_at };
    }
    if (row.message === VOLUNTEER_CTRL_RELEASE) {
      const existing = byUser[row.user_id];
      if (existing && `${existing.volunteer_id}` === `${row.volunteer_id}`) {
        delete byUser[row.user_id];
      }
    }
  }

  const byVolunteer = {};
  Object.entries(byUser).forEach(([userId, meta]) => {
    if (!byVolunteer[meta.volunteer_id]) byVolunteer[meta.volunteer_id] = [];
    byVolunteer[meta.volunteer_id].push({ user_id: userId, assigned_at: meta.assigned_at });
  });

  return { byUser, byVolunteer };
}

async function getPendingRequestsSnapshot() {
  const { data, error } = await supabase
    .from('volunteer_chats')
    .select('user_id, volunteer_id, message, created_at')
    .in('message', [VOLUNTEER_CTRL_ASSIGN, VOLUNTEER_CTRL_RELEASE, VOLUNTEER_CTRL_PENDING])
    .order('created_at', { ascending: true });

  if (error || !data) return {};

  const pendingByUser = {}; // user_id -> { volunteer_id, requested_at }
  
  for (const row of data) {
    if (row.message === VOLUNTEER_CTRL_PENDING) {
      pendingByUser[row.user_id] = { volunteer_id: row.volunteer_id, requested_at: row.created_at };
    }
    if (row.message === VOLUNTEER_CTRL_ASSIGN || row.message === VOLUNTEER_CTRL_RELEASE) {
      delete pendingByUser[row.user_id];
    }
  }
  return pendingByUser;
}

async function matchVolunteerToUser(userId) {
  const { data: volunteers } = await supabase
    .from('users')
    .select('id, dummy_name, expertise')
    .eq('role', 'volunteer')
    .eq('approval_status', 'approved');
    
  if (!volunteers || volunteers.length === 0) return null;

  const { data: moods } = await supabase
    .from('mood_logs')
    .select('mood')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);
    
  const recentMoods = (moods || []).map(m => m.mood).join(', ');
  
  try {
    if (process.env.MISTRAL_API_KEY) {
      const mistral = await getMistral();
      const prompt = `Match the user to the best volunteer based on the user's recent moods: "${recentMoods}".
      
Volunteers:
${volunteers.map(v => `- ID '${v.id}': ${v.dummy_name}, Expertise: ${v.expertise || 'None'}`).join('\n')}

Return ONLY the exact ID of the best match. No text, no quotes, no explanation.`;

      const response = await mistral.chat.complete({
        model: 'mistral-small-latest',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 10,
        temperature: 0.1
      });
      
      const idStr = response.choices[0].message.content.trim().replace(/['"]/g, '');
      const match = volunteers.find(v => v.id === idStr || String(v.id) === idStr);
      if (match) return { id: match.id, name: match.dummy_name };
    }
  } catch (e) {
    console.warn('AI matching failed, using fallback.', e.message);
  }
  
  const fallback = volunteers[Math.floor(Math.random() * volunteers.length)];
  return { id: fallback.id, name: fallback.dummy_name };
}

app.get('/api/volunteer/users-needing-help/:volunteer_id', async (req, res) => {
  try {
    const volunteerId = req.params.volunteer_id;
    const users_needing_help = [];
    const includedIds = new Set();

    const assignments = await getAssignmentSnapshot();
    const assignedUsers = new Set(Object.keys(assignments.byUser).map((id) => `${id}`));
    const pendingRequests = await getPendingRequestsSnapshot();

    const riskMap = await getQuizRiskByUser();
    const highRiskIds = Object.keys(riskMap).filter((uid) => riskMap[uid].stress_level === 'High');
    if (highRiskIds.length) {
      const { data: highRiskUsers, error: usersError } = await supabase
        .from('users')
        .select('id, dummy_name')
        .in('id', highRiskIds);

      if (usersError) return res.status(500).json({ error: usersError.message });

      (highRiskUsers || []).forEach((u) => {
        if (assignedUsers.has(`${u.id}`)) return;
        
        const pending = pendingRequests[u.id];
        if (pending && `${pending.volunteer_id}` !== `${volunteerId}`) {
           const reqDate = pending.requested_at.endsWith('Z') ? pending.requested_at : pending.requested_at + 'Z';
           const ageMs = Date.now() - new Date(reqDate).getTime();
           if (ageMs < 15 * 60 * 1000) return; // Skip if waiting < 15 mins
        }

        const risk = riskMap[u.id] || {};
        users_needing_help.push({
          user_id: u.id,
          name: u.dummy_name || 'Unknown',
          stress_level: risk.stress_level || 'High',
          last_quiz_date: risk.last_quiz_date || new Date().toISOString(),
          source: 'high-stress-quiz'
        });
        includedIds.add(`${u.id}`);
      });
    }

    const { data: requestUsers, error: requestError } = await supabase
      .from('users')
      .select('id, dummy_name, created_at, critical_state')
      .eq('role', 'user')
      .eq('critical_state', true);

    if (requestError) return res.status(500).json({ error: requestError.message });

    (requestUsers || []).forEach((u) => {
      if (includedIds.has(`${u.id}`)) return;
      if (assignedUsers.has(`${u.id}`)) return;

      const pending = pendingRequests[u.id];
      if (pending && `${pending.volunteer_id}` !== `${volunteerId}`) {
         const reqDate = pending.requested_at.endsWith('Z') ? pending.requested_at : pending.requested_at + 'Z';
         const ageMs = Date.now() - new Date(reqDate).getTime();
         if (ageMs < 15 * 60 * 1000) return; // Skip if waiting < 15 mins
      }

      users_needing_help.push({
        user_id: u.id,
        name: u.dummy_name || 'Unknown',
        stress_level: 'Requested Support',
        last_quiz_date: u.created_at || new Date().toISOString(),
        source: 'user-request',
        request_note: ''
      });
    });

    users_needing_help.sort((a, b) => new Date(b.last_quiz_date) - new Date(a.last_quiz_date));
    return res.status(200).json({ users: users_needing_help });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/volunteer/request', async (req, res) => {
  const { user_id } = req.body;
  const check = await requireUserWithRole(user_id, 'user');
  if (!check.ok) return res.status(404).json({ error: 'User not found' });

  if (check.profile.critical_state === true) {
    return res.status(200).json({ success: true, already_requested: true, message: 'Volunteer support request is already open' });
  }

  const { error } = await supabase
    .from('users')
    .update({ critical_state: true })
    .eq('id', user_id);

  if (error) return res.status(500).json({ error: error.message });
  
  // AI Matching
  const matchedVolunteer = await matchVolunteerToUser(user_id);
  let assignedName = 'a volunteer';
  if (matchedVolunteer) {
    assignedName = matchedVolunteer.name;
    await supabase.from('volunteer_chats').insert([{
      user_id,
      volunteer_id: matchedVolunteer.id,
      sender: 'user',
      message: VOLUNTEER_CTRL_PENDING
    }]);
  }

  return res.status(201).json({ success: true, message: `Volunteer support request matched with ${assignedName}`, volunteer_name: assignedName, request: { volunteer_name: assignedName, requested_at: new Date().toISOString() } });
});

app.get('/api/volunteer/request/:user_id', async (req, res) => {
  const userId = req.params.user_id;
  const check = await requireUserWithRole(userId, 'user');
  if (!check.ok) return res.status(404).json({ error: 'User not found' });

  if (!check.profile.critical_state) {
    return res.status(200).json({ requested: false });
  }

  let assignedName = 'a volunteer';
  const pendingMap = await getPendingRequestsSnapshot();
  const pending = pendingMap[userId];
  if (pending) {
    const { data: v } = await supabase.from('users').select('dummy_name').eq('id', pending.volunteer_id).single();
    if (v) assignedName = v.dummy_name;
  }

  return res.status(200).json({
    requested: true,
    request: {
      requested_at: new Date().toISOString(),
      note: '',
      status: 'open',
      volunteer_name: assignedName
    }
  });
});

app.post('/api/volunteer/request/resolve', async (req, res) => {
  const { user_id } = req.body;
  const check = await requireUserWithRole(user_id, 'user');
  if (!check.ok) return res.status(404).json({ error: 'User not found' });

  if (!check.profile.critical_state) {
    return res.status(200).json({ success: true, updated: false, message: 'No open request found' });
  }

  const { error } = await supabase
    .from('users')
    .update({ critical_state: false })
    .eq('id', user_id);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true, updated: true });
});

app.post('/api/volunteer/assign', async (req, res) => {
  const { volunteer_id, user_id } = req.body;

  const volunteerCheck = await requireUserWithRole(volunteer_id, 'volunteer');
  if (!volunteerCheck.ok) return res.status(403).json({ error: 'Invalid volunteer account' });

  const userCheck = await requireUserWithRole(user_id, 'user');
  if (!userCheck.ok) return res.status(404).json({ error: 'User not found' });

  const assignments = await getAssignmentSnapshot();
  const current = assignments.byUser[user_id];
  if (current && `${current.volunteer_id}` !== `${volunteer_id}`) {
    return res.status(409).json({ error: 'User is already assigned to another volunteer' });
  }
  if (current && `${current.volunteer_id}` === `${volunteer_id}`) {
    return res.status(200).json({ success: true, assigned_at: current.assigned_at });
  }

  const { data: inserted, error } = await supabase
    .from('volunteer_chats')
    .insert([{ user_id, volunteer_id, sender: 'volunteer', message: VOLUNTEER_CTRL_ASSIGN }])
    .select('created_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('users').update({ critical_state: false }).eq('id', user_id);
  return res.status(200).json({ success: true, assigned_at: inserted.created_at });
});

app.post('/api/volunteer/release', async (req, res) => {
  const { volunteer_id, user_id } = req.body;

  const volunteerCheck = await requireUserWithRole(volunteer_id, 'volunteer');
  if (!volunteerCheck.ok) return res.status(403).json({ error: 'Invalid volunteer account' });

  const userCheck = await requireUserWithRole(user_id, 'user');
  if (!userCheck.ok) return res.status(404).json({ error: 'User not found' });

  const assignments = await getAssignmentSnapshot();
  const current = assignments.byUser[user_id];
  if (!current || `${current.volunteer_id}` !== `${volunteer_id}`) {
    return res.status(200).json({ success: true, updated: false });
  }

  const { error } = await supabase
    .from('volunteer_chats')
    .insert([{ user_id, volunteer_id, sender: 'volunteer', message: VOLUNTEER_CTRL_RELEASE }]);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true });
});

app.get('/api/volunteer/handling/:volunteer_id', async (req, res) => {
  const volunteerId = req.params.volunteer_id;
  const volunteerCheck = await requireUserWithRole(volunteerId, 'volunteer');
  if (!volunteerCheck.ok) return res.status(403).json({ error: 'Invalid volunteer account' });

  const assignments = await getAssignmentSnapshot();
  const assigned = assignments.byVolunteer[volunteerId] || [];
  if (!assigned.length) return res.status(200).json({ users: [] });

  const userIds = assigned.map((a) => a.user_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('users')
    .select('id, dummy_name')
    .in('id', userIds);

  if (profilesError) return res.status(500).json({ error: profilesError.message });
  const profileMap = (profiles || []).reduce((acc, p) => {
    acc[p.id] = p;
    return acc;
  }, {});

  const riskMap = await getQuizRiskByUser();

  const users = assigned.map((a) => ({
    user_id: a.user_id,
    name: profileMap[a.user_id] ? profileMap[a.user_id].dummy_name : 'Unknown',
    stress_level: riskMap[a.user_id] ? riskMap[a.user_id].stress_level : 'Unknown',
    assigned_at: a.assigned_at
  }));

  return res.status(200).json({ users });
});

app.get('/api/volunteer/user-profile/:volunteer_id/:user_id', async (req, res) => {
  const volunteerId = req.params.volunteer_id;
  const userId = req.params.user_id;

  const volunteerCheck = await requireUserWithRole(volunteerId, 'volunteer');
  if (!volunteerCheck.ok) return res.status(403).json({ error: 'Invalid volunteer account' });

  const userCheck = await requireUserWithRole(userId, 'user');
  if (!userCheck.ok) return res.status(404).json({ error: 'User not found' });

  const assignments = await getAssignmentSnapshot();
  const current = assignments.byUser[userId];
  const isAssigned = !!(current && `${current.volunteer_id}` === `${volunteerId}`);

  const riskMap = await getQuizRiskByUser();
  const hasHighStress = riskMap[userId] && riskMap[userId].stress_level === 'High';

  const { data: userRow } = await supabase
    .from('users')
    .select('critical_state')
    .eq('id', userId)
    .single();
  const hasOpenRequest = !!(userRow && userRow.critical_state);

  if (!isAssigned && !hasOpenRequest && !hasHighStress) {
    return res.status(403).json({ error: 'Volunteer is not authorized to view this user profile' });
  }

  let moods = moods_db[userId] || [];
  const { data: dbMoods } = await supabase
    .from('mood_logs')
    .select('mood, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (dbMoods && dbMoods.length) {
    moods = dbMoods.map((m) => ({
      mood: m.mood,
      timestamp: m.created_at,
      emoji: MOOD_EMOJI[m.mood] || '😐',
      color: MOOD_COLORS[m.mood] || '#808080'
    }));
  }

  const mood_counts = {};
  moods.forEach((m) => {
    mood_counts[m.mood] = (mood_counts[m.mood] || 0) + 1;
  });

  // Fetch chat session history for report
  const { data: chatSessions } = await supabase
    .from('chat_sessions')
    .select('dominant_emotion, sentiment_score, emotion_tags, analyzed_at, transcript')
    .eq('user_id', userId)
    .order('analyzed_at', { ascending: false })
    .limit(5);

  // Fetch AI quiz summaries for report
  const { data: aiSummaries } = await supabase
    .from('ai_summaries')
    .select('summary, risk_level, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(3);

  // Compute overall risk assessment
  const latestMood = moods.length ? moods[moods.length - 1].mood : 'neutral';
  const latestQuizRisk = riskMap[userId] ? riskMap[userId].stress_level : null;
  const latestSentiment = chatSessions && chatSessions.length ? chatSessions[0].sentiment_score : null;
  let overallRisk = 'Low';
  const riskFactors = [];
  if (['sad', 'stressed', 'anxious'].includes(latestMood)) { riskFactors.push('negative_mood'); }
  if (latestQuizRisk === 'High' || latestQuizRisk === 'Needs Support') { riskFactors.push('high_quiz_stress'); }
  if (latestSentiment !== null && latestSentiment < -0.3) { riskFactors.push('negative_chat_sentiment'); }
  if (hasOpenRequest) { riskFactors.push('open_support_request'); }
  if (riskFactors.length >= 3) overallRisk = 'High';
  else if (riskFactors.length >= 1) overallRisk = 'Medium';

  return res.status(200).json({
    user: {
      user_id: userCheck.profile.id,
      name: userCheck.profile.dummy_name || 'Unknown',
      role: userCheck.profile.role
    },
    request: hasOpenRequest
      ? {
        status: 'open',
        requested_at: new Date().toISOString(),
        note: '',
        resolved_at: null
      }
      : null,
    mood: {
      current_mood: moods.length ? moods[moods.length - 1] : { mood: 'neutral', emoji: '😐', color: '#808080' },
      mood_counts,
      total_moods: moods.length,
      recent_history: moods.slice(-7)
    },
    quiz: {
      latest: riskMap[userId]
        ? {
          score: riskMap[userId].score,
          average_score: riskMap[userId].average_score,
          stress_level: riskMap[userId].stress_level,
          recommendation: riskMap[userId].recommendation,
          timestamp: riskMap[userId].last_quiz_date
        }
        : null,
      recent_history: []
    },
    chat_sessions: (chatSessions || []).map(s => ({
      dominant_emotion: s.dominant_emotion,
      sentiment_score: s.sentiment_score,
      emotion_tags: s.emotion_tags,
      analyzed_at: s.analyzed_at,
      transcript_preview: (s.transcript || '').slice(0, 200)
    })),
    ai_summaries: (aiSummaries || []).map(s => {
      let parsed = {};
      try { parsed = JSON.parse(s.summary); } catch (_) { parsed = { raw: s.summary }; }
      return {
        risk_level: s.risk_level,
        created_at: s.created_at,
        mood: parsed.mood,
        category: parsed.category,
        strengths: parsed.strengths,
        weaknesses: parsed.weaknesses,
        suggestions: parsed.suggestions
      };
    }),
    overall_risk: {
      level: overallRisk,
      factors: riskFactors
    },
    assignment: {
      is_assigned_to_current_volunteer: isAssigned,
      assigned_volunteer_id: current ? current.volunteer_id : null
    }
  });
});

// ==================== Secure Volunteer-User Chat ====================

app.get('/api/secure-chat/user/:user_id', async (req, res) => {
  const userId = req.params.user_id;
  const userCheck = await requireUserWithRole(userId, 'user');
  if (!userCheck.ok) {
    return res.status(404).json({ error: 'User not found' });
  }

  const assignments = await getAssignmentSnapshot();
  const current = assignments.byUser[userId];
  if (!current) {
    return res.status(200).json({ connected: false, messages: [] });
  }
  const volunteerId = current.volunteer_id;

  const volunteerProfile = await getUserProfile(volunteerId);
  const { data, error } = await supabase
    .from('volunteer_chats')
    .select('volunteer_id, sender, message, created_at')
    .eq('user_id', userId)
    .eq('volunteer_id', volunteerId)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const messages = (data || [])
    .filter((m) => m.message !== VOLUNTEER_CTRL_ASSIGN && m.message !== VOLUNTEER_CTRL_RELEASE)
    .map((m) => ({
      sender_role: m.sender === 'user' ? 'user' : 'volunteer',
      sender_id: m.sender === 'user' ? userId : volunteerId,
      text: m.message,
      timestamp: m.created_at
    }));

  return res.status(200).json({
    connected: true,
    volunteer_id: volunteerId,
    volunteer_name: volunteerProfile ? volunteerProfile.dummy_name : 'Volunteer',
    messages
  });
});

app.post('/api/secure-chat/user/:user_id', async (req, res) => {
  const userId = req.params.user_id;
  const { sender_id, text } = req.body;

  const userCheck = await requireUserWithRole(userId, 'user');
  if (!userCheck.ok) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (`${sender_id}` !== `${userId}`) {
    return res.status(403).json({ error: 'Invalid sender for this chat' });
  }
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Message text is required' });
  }

  const assignments = await getAssignmentSnapshot();
  const current = assignments.byUser[userId];
  if (!current) {
    return res.status(403).json({ error: 'No volunteer is assigned yet' });
  }
  const volunteerId = current.volunteer_id;

  const messageText = text.trim().slice(0, 500);
  const { data, error } = await supabase
    .from('volunteer_chats')
    .insert([{ user_id: userId, volunteer_id: volunteerId, message: messageText, sender: 'user' }])
    .select('created_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const message = {
    sender_role: 'user',
    sender_id: userId,
    text: messageText,
    timestamp: data.created_at
  };
  return res.status(201).json({ success: true, message });
});

app.get('/api/secure-chat/volunteer/:volunteer_id/:user_id', async (req, res) => {
  const volunteerId = req.params.volunteer_id;
  const userId = req.params.user_id;

  const volunteerCheck = await requireUserWithRole(volunteerId, 'volunteer');
  if (!volunteerCheck.ok) {
    return res.status(403).json({ error: 'Invalid volunteer account' });
  }
  const userCheck = await requireUserWithRole(userId, 'user');
  if (!userCheck.ok) {
    return res.status(404).json({ error: 'User not found' });
  }
  const assignments = await getAssignmentSnapshot();
  const current = assignments.byUser[userId];
  if (!current || `${current.volunteer_id}` !== `${volunteerId}`) {
    return res.status(403).json({ error: 'Volunteer is not assigned to this user' });
  }

  const { data, error } = await supabase
    .from('volunteer_chats')
    .select('sender, message, created_at')
    .eq('user_id', userId)
    .eq('volunteer_id', volunteerId)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const messages = (data || [])
    .filter((m) => m.message !== VOLUNTEER_CTRL_ASSIGN && m.message !== VOLUNTEER_CTRL_RELEASE)
    .map((m) => ({
      sender_role: m.sender === 'user' ? 'user' : 'volunteer',
      sender_id: m.sender === 'user' ? userId : volunteerId,
      text: m.message,
      timestamp: m.created_at
    }));
  return res.status(200).json({ connected: true, messages });
});

app.post('/api/secure-chat/volunteer/:volunteer_id/:user_id', async (req, res) => {
  const volunteerId = req.params.volunteer_id;
  const userId = req.params.user_id;
  const { sender_id, text } = req.body;

  const volunteerCheck = await requireUserWithRole(volunteerId, 'volunteer');
  if (!volunteerCheck.ok) {
    return res.status(403).json({ error: 'Invalid volunteer account' });
  }
  const userCheck = await requireUserWithRole(userId, 'user');
  if (!userCheck.ok) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (`${sender_id}` !== `${volunteerId}`) {
    return res.status(403).json({ error: 'Invalid sender for this chat' });
  }
  const assignments = await getAssignmentSnapshot();
  const current = assignments.byUser[userId];
  if (!current || `${current.volunteer_id}` !== `${volunteerId}`) {
    return res.status(403).json({ error: 'Volunteer is not assigned to this user' });
  }
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Message text is required' });
  }

  const messageText = text.trim().slice(0, 500);
  const { data, error } = await supabase
    .from('volunteer_chats')
    .insert([{ user_id: userId, volunteer_id: volunteerId, message: messageText, sender: 'volunteer' }])
    .select('created_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const message = {
    sender_role: 'volunteer',
    sender_id: volunteerId,
    text: messageText,
    timestamp: data.created_at
  };
  return res.status(201).json({ success: true, message });
});

// ==================== Mistral Quiz Module ====================

const questionsFilePath = path.join(__dirname, 'quiz-module/questions.json');
let allQuestions = [];
try {
  if (fs.existsSync(questionsFilePath)) {
    allQuestions = JSON.parse(fs.readFileSync(questionsFilePath, 'utf8'));
  }
} catch (e) {
  console.error('Error loading questions:', e);
}

app.get('/api/questions', (req, res) => {
  if (allQuestions.length < 10) {
    return res.status(500).json({ error: 'Not enough questions available.' });
  }

  const shuffled = [...allQuestions].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, 10).map((q) => ({
    id: q.id,
    question: q.question,
    options: q.options.map((opt, i) => ({ id: i, description: opt.description }))
  }));

  return res.json(selected);
});

app.post('/api/submit', async (req, res) => {
  const { answers, user_id } = req.body;
  if (!answers || !Array.isArray(answers)) {
    return res.status(400).json({ error: 'Invalid answers format.' });
  }

  let totalScore = 0;
  let maxPossibleScore = 0;
  const answeredDetails = [];

  answers.forEach((ans) => {
    const question = allQuestions.find((q) => q.id === ans.questionId);
    if (question) {
      const selectedOption = question.options[ans.optionId];
      if (selectedOption) {
        totalScore += selectedOption.score;
        answeredDetails.push(`Q: ${question.question}\nA: ${selectedOption.description}`);
      }
      maxPossibleScore += Math.max(...question.options.map((opt) => opt.score));
    }
  });

  const percentage = Math.round((totalScore / Math.max(maxPossibleScore, 1)) * 100);

  // --- Persist quiz attempt and answers to DB ---
  let attemptId = null;
  if (user_id) {
    try {
      // 1. Create quiz_attempt
      const { data: attempt, error: attemptError } = await supabase
        .from('quiz_attempts')
        .insert([{ user_id }])
        .select('id')
        .single();

      if (!attemptError && attempt) {
        attemptId = attempt.id;

        // 2. Insert quiz_answers
        const answerRows = answers.map((ans) => ({
          attempt_id: attemptId,
          question_id: ans.questionId,
          answer: String(ans.optionId)
        }));
        await supabase.from('quiz_answers').insert(answerRows);
      }
    } catch (dbErr) {
      console.warn('Quiz DB persist failed (non-fatal):', dbErr.message);
    }
  }

  // --- AI Analysis ---
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

  let feedback;
  try {
    const mistralKey = process.env.MISTRAL_API_KEY;
    if (!mistralKey) throw new Error('MISTRAL_API_KEY is not defined.');

    const response = await axios.post(
      'https://api.mistral.ai/v1/chat/completions',
      { model: 'mistral-small-latest', messages: [{ role: 'user', content: prompt }] },
      { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mistralKey}` } }
    );

    const aiText = response.data.choices[0].message.content.trim();
    feedback = JSON.parse(aiText.replace(/```json/g, '').replace(/```/g, '').trim());
  } catch (error) {
    let category = percentage >= 75 ? 'Good' : percentage <= 40 ? 'Needs Support' : 'Moderate';
    let fallbackMood = percentage >= 75 ? 'Positive/Calm' : percentage <= 40 ? 'Stressed/Anxious' : 'Neutral';
    feedback = {
      personalityType: 'Unknown (AI Offline)',
      strengths: ['Self-awareness'],
      weaknesses: ['Unable to analyze further currently'],
      emotionalScore: percentage,
      category,
      mood: fallbackMood,
      suggestions: [
        'Take a moment to breathe and reflect.',
        'Drink some water and rest your mind.',
        'If you feel overwhelmed, consider talking to someone close to you.'
      ]
    };
  }

  // --- Save AI summary to ai_summaries ---
  if (user_id && feedback) {
    try {
      await supabase.from('ai_summaries').insert([{
        user_id,
        summary: JSON.stringify(feedback),
        risk_level: feedback.category || 'Moderate'
      }]);
    } catch (summaryErr) {
      console.warn('ai_summaries insert failed (non-fatal):', summaryErr.message);
    }
  }

  return res.json({ score: percentage, feedback, attempt_id: attemptId });
});

// ==================== Health ====================

app.get('/api/health', (req, res) => {
  return res.status(200).json({ status: 'OK', message: 'Sevak + Nyxie AI Backend running' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Sevak backend running on http://localhost:${PORT}`);
    if (!process.env.MISTRAL_API_KEY) {
      console.warn('MISTRAL_API_KEY not set - AI chat will use fallback responses');
    }
  });
}

module.exports = app;
