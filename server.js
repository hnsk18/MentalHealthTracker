require('dotenv').config({ path: './quiz-module/.env', override: true });

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 5000;

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

const QUIZ_QUESTIONS = [
  { id: 1, question: 'How often do you feel stressed?', options: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'], weight: [0, 1, 2, 3, 4] },
  { id: 2, question: 'How many hours do you sleep on average?', options: ['Less than 5', '5-6', '6-7', '7-8', 'More than 8'], weight: [4, 3, 2, 0, 1] },
  { id: 3, question: 'How would you rate your work-life balance?', options: ['Excellent', 'Good', 'Fair', 'Poor', 'Very Poor'], weight: [0, 1, 2, 3, 4] },
  { id: 4, question: 'Do you take regular breaks during work?', options: ['Always', 'Often', 'Sometimes', 'Rarely', 'Never'], weight: [0, 1, 2, 3, 4] },
  { id: 5, question: 'How is your physical health?', options: ['Excellent', 'Good', 'Fair', 'Poor', 'Very Poor'], weight: [0, 1, 2, 3, 4] }
];

const MOOD_EMOJI = { happy: '😊', sad: '😢', stressed: '😰', anxious: '😟', calm: '😌' };
const MOOD_COLORS = { happy: '#FFD700', sad: '#4169E1', stressed: '#FF6347', anxious: '#FF8C00', calm: '#90EE90' };

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
      { label: '📊 View Dashboard', route: 'dashboard' }
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
      { label: '📊 View Progress', route: 'dashboard' }
    ]
  }
};

const NYXIE_SYSTEM_PROMPT = `
You are Nyxie, a compassionate peer listener on MindMitra - a safe mental wellness space for youth.

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
    .select('id, dummy_name, role')
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
    const { email, password, name, role = 'user' } = req.body;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError || !authData.user) {
      return res.status(400).json({ error: authError ? authError.message : 'Unable to register user' });
    }

    const userId = authData.user.id;

    const { error: insertError } = await supabase.from('users').insert([
      {
        id: userId,
        dummy_name: name,
        role
      }
    ]);

    if (insertError) {
      return res.status(400).json({ error: insertError.message });
    }

    moods_db[userId] = [];
    quiz_responses_db[userId] = [];
    messages_db[userId] = [];
    volunteer_requests_db[userId] = null;

    return res.status(201).json({ success: true, user_id: userId, message: 'Registration successful' });
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

    const profile = await getUserProfile(data.user.id);
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    return res.status(200).json({
      success: true,
      user_id: data.user.id,
      name: profile.dummy_name,
      role: profile.role,
      email: data.user.email
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
    role: profile.role
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
    actions: [{ label: '\ud83d\udcca View Dashboard', route: 'dashboard' }]
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

  if (!quiz_responses_db[user_id]) quiz_responses_db[user_id] = [];
  quiz_responses_db[user_id].push(quiz_result);

  return res.status(201).json({ success: true, result: quiz_result });
});

app.get('/api/quiz/history/:user_id', async (req, res) => {
  const userId = req.params.user_id;
  const check = await requireUserWithRole(userId, 'user');
  if (!check.ok) {
    return res.status(404).json({ error: 'User not found' });
  }

  const history = quiz_responses_db[userId] || [];
  return res.status(200).json({ history: history.slice(-5) });
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

app.get('/api/admin/analytics', async (req, res) => {
  try {
    const { data: users, error } = await supabase.from('users').select('role');
    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const role_distribution = {};
    users.forEach((user) => {
      role_distribution[user.role] = (role_distribution[user.role] || 0) + 1;
    });

    // Fetch mood distribution from Supabase mood_logs table
    const { data: moodLogs, error: moodError } = await supabase.from('mood_logs').select('mood');
    const mood_distribution = {};
    let total_mood_entries = 0;
    if (!moodError && moodLogs) {
      moodLogs.forEach(entry => {
        mood_distribution[entry.mood] = (mood_distribution[entry.mood] || 0) + 1;
        total_mood_entries++;
      });
    }

    const all_stress_scores = [];
    Object.values(quiz_responses_db).forEach((user_quizzes) => {
      user_quizzes.forEach((quiz) => {
        all_stress_scores.push(quiz.average_score);
      });
    });

    const average_stress = all_stress_scores.length ? all_stress_scores.reduce((a, b) => a + b, 0) / all_stress_scores.length : 0;

    let total_quiz_attempts = 0;
    Object.values(quiz_responses_db).forEach((q) => {
      total_quiz_attempts += q.length;
    });

    return res.status(200).json({
      total_users: users.length,
      role_distribution,
      mood_distribution,
      average_stress_level: Math.round(average_stress * 100) / 100,
      total_mood_entries,
      total_quiz_attempts
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// ==================== Volunteer ====================

const VOLUNTEER_CTRL_ASSIGN = '__CTRL__:ASSIGNED';
const VOLUNTEER_CTRL_RELEASE = '__CTRL__:RELEASED';

function parseStressLevel(avg) {
  if (avg < 1.5) return 'Low';
  if (avg < 2.5) return 'Medium';
  return 'High';
}

async function getQuizRiskByUser() {
  const { data, error } = await supabase
    .from('quiz_answers')
    .select('user_id, question_id, option_id, created_at');

  if (error || !data) return {};

  const riskMap = {};
  for (const ans of data) {
    if (!riskMap[ans.user_id]) {
      riskMap[ans.user_id] = { total: 0, count: 0, last_quiz_date: ans.created_at };
    }
    const question = QUIZ_QUESTIONS.find((q) => q.id === ans.question_id);
    if (question) {
      const score = question.weight[ans.option_id] || 0;
      riskMap[ans.user_id].total += score;
      riskMap[ans.user_id].count += 1;
    }
    if (new Date(ans.created_at) > new Date(riskMap[ans.user_id].last_quiz_date)) {
      riskMap[ans.user_id].last_quiz_date = ans.created_at;
    }
  }

  Object.keys(riskMap).forEach((uid) => {
    const avg = riskMap[uid].count ? riskMap[uid].total / riskMap[uid].count : 0;
    riskMap[uid].average_score = Math.round(avg * 100) / 100;
    riskMap[uid].stress_level = parseStressLevel(avg);
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

app.get('/api/volunteer/users-needing-help', async (req, res) => {
  try {
    const users_needing_help = [];
    const includedIds = new Set();

    const assignments = await getAssignmentSnapshot();
    const assignedUsers = new Set(Object.keys(assignments.byUser).map((id) => `${id}`));

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
  return res.status(201).json({ success: true, message: 'Volunteer support request submitted' });
});

app.get('/api/volunteer/request/:user_id', async (req, res) => {
  const userId = req.params.user_id;
  const check = await requireUserWithRole(userId, 'user');
  if (!check.ok) return res.status(404).json({ error: 'User not found' });

  if (!check.profile.critical_state) {
    return res.status(200).json({ requested: false });
  }

  return res.status(200).json({
    requested: true,
    request: {
      requested_at: new Date().toISOString(),
      note: '',
      status: 'open'
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
    name: getAnonymousName(a.user_id),
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
    .from('moods')
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

  return res.status(200).json({
    user: {
      user_id: userCheck.profile.id,
      name: getAnonymousName(userCheck.profile.id),
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
            stress_level: riskMap[userId].stress_level,
            average_score: riskMap[userId].average_score,
            timestamp: riskMap[userId].last_quiz_date
          }
        : null,
      recent_history: []
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
  const { answers } = req.body;
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
    if (!mistralKey) throw new Error('MISTRAL_API_KEY is not defined.');

    const response = await axios.post(
      'https://api.mistral.ai/v1/chat/completions',
      { model: 'mistral-small-latest', messages: [{ role: 'user', content: prompt }] },
      { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mistralKey}` } }
    );

    const aiText = response.data.choices[0].message.content.trim();
    const aiResult = JSON.parse(aiText.replace(/```json/g, '').replace(/```/g, '').trim());
    return res.json({ score: percentage, feedback: aiResult });
  } catch (error) {
    let category = percentage >= 75 ? 'Good' : percentage <= 40 ? 'Needs Support' : 'Moderate';
    let fallbackMood = percentage >= 75 ? 'Positive/Calm' : percentage <= 40 ? 'Stressed/Anxious' : 'Neutral';
    return res.json({
      score: percentage,
      feedback: {
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
      }
    });
  }
});

// ==================== Health ====================

app.get('/api/health', (req, res) => {
  return res.status(200).json({ status: 'OK', message: 'MindMitra + Nyxie AI Backend running' });
});

app.listen(PORT, () => {
  console.log(`MindMitra backend running on http://localhost:${PORT}`);
  if (!process.env.MISTRAL_API_KEY) {
    console.warn('MISTRAL_API_KEY not set - AI chat will use fallback responses');
  }
});
