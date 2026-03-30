from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime
import json
import os
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
CORS(app)

# Simple in-memory database
users_db = {}
moods_db = {}
quiz_responses_db = {}
messages_db = {}
next_user_id = 1

# Mock data for admin analytics
QUIZ_QUESTIONS = [
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
]

MOOD_EMOJI = {
    "happy": "😊",
    "sad": "😢",
    "stressed": "😰",
    "anxious": "😟",
    "calm": "😌"
}

MOOD_COLORS = {
    "happy": "#FFD700",
    "sad": "#4169E1",
    "stressed": "#FF6347",
    "anxious": "#FF8C00",
    "calm": "#90EE90"
}

# ==================== Authentication Routes ====================

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    name = data.get('name')
    role = data.get('role', 'user')

    if email in [users_db[uid]['email'] for uid in users_db]:
        return jsonify({'error': 'Email already exists'}), 400

    global next_user_id
    user_id = next_user_id
    next_user_id += 1

    users_db[user_id] = {
        'id': user_id,
        'name': name,
        'email': email,
        'password': generate_password_hash(password),
        'role': role,
        'created_at': datetime.now().isoformat()
    }

    moods_db[user_id] = []
    quiz_responses_db[user_id] = []
    messages_db[user_id] = []

    return jsonify({
        'success': True,
        'user_id': user_id,
        'message': 'Registration successful'
    }), 201


@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    role = data.get('role', 'user')

    for user_id, user in users_db.items():
        if user['email'] == email and user['role'] == role:
            if check_password_hash(user['password'], password):
                return jsonify({
                    'success': True,
                    'user_id': user_id,
                    'name': user['name'],
                    'role': user['role'],
                    'email': user['email']
                }), 200

    return jsonify({'error': 'Invalid credentials'}), 401


# ==================== User Routes ====================

@app.route('/api/user/<int:user_id>', methods=['GET'])
def get_user(user_id):
    if user_id not in users_db:
        return jsonify({'error': 'User not found'}), 404
    
    user = users_db[user_id]
    return jsonify({
        'id': user['id'],
        'name': user['name'],
        'email': user['email'],
        'role': user['role']
    }), 200


# ==================== Mood Routes ====================

@app.route('/api/mood', methods=['POST'])
def add_mood():
    data = request.json
    user_id = data.get('user_id')
    mood = data.get('mood')

    if user_id not in users_db:
        return jsonify({'error': 'User not found'}), 404

    mood_entry = {
        'mood': mood,
        'timestamp': datetime.now().isoformat(),
        'emoji': MOOD_EMOJI.get(mood, '😐'),
        'color': MOOD_COLORS.get(mood, '#808080')
    }

    if user_id not in moods_db:
        moods_db[user_id] = []
    
    moods_db[user_id].append(mood_entry)

    return jsonify({
        'success': True,
        'mood_entry': mood_entry
    }), 201


@app.route('/api/mood/<int:user_id>', methods=['GET'])
def get_moods(user_id):
    if user_id not in users_db:
        return jsonify({'error': 'User not found'}), 404

    moods = moods_db.get(user_id, [])
    
    # Calculate mood statistics
    mood_counts = {}
    for mood_entry in moods:
        mood = mood_entry['mood']
        mood_counts[mood] = mood_counts.get(mood, 0) + 1

    current_mood = moods[-1] if moods else {'mood': 'neutral', 'emoji': '😐', 'color': '#808080'}

    return jsonify({
        'current_mood': current_mood,
        'mood_history': moods[-7:],  # Last 7 moods
        'mood_counts': mood_counts,
        'total_moods': len(moods)
    }), 200


# ==================== Quiz Routes ====================

@app.route('/api/quiz', methods=['GET'])
def get_quiz():
    return jsonify({
        'questions': QUIZ_QUESTIONS,
        'total_questions': len(QUIZ_QUESTIONS)
    }), 200


@app.route('/api/quiz/submit', methods=['POST'])
def submit_quiz():
    data = request.json
    user_id = data.get('user_id')
    answers = data.get('answers')

    if user_id not in users_db:
        return jsonify({'error': 'User not found'}), 404

    # Calculate score
    total_score = 0
    for i, answer in enumerate(answers):
        if i < len(QUIZ_QUESTIONS):
            question = QUIZ_QUESTIONS[i]
            if 0 <= answer < len(question['weight']):
                total_score += question['weight'][answer]

    average_score = total_score / len(QUIZ_QUESTIONS) if QUIZ_QUESTIONS else 0

    # Determine stress level
    if average_score < 1.5:
        stress_level = "Low"
        recommendation = "Great! Keep maintaining your healthy habits."
    elif average_score < 2.5:
        stress_level = "Medium"
        recommendation = "Consider taking more breaks and practicing mindfulness."
    else:
        stress_level = "High"
        recommendation = "Please consider seeking professional help and taking rest."

    quiz_result = {
        'timestamp': datetime.now().isoformat(),
        'score': total_score,
        'average_score': round(average_score, 2),
        'stress_level': stress_level,
        'recommendation': recommendation
    }

    if user_id not in quiz_responses_db:
        quiz_responses_db[user_id] = []

    quiz_responses_db[user_id].append(quiz_result)

    return jsonify({
        'success': True,
        'result': quiz_result
    }), 201


@app.route('/api/quiz/history/<int:user_id>', methods=['GET'])
def get_quiz_history(user_id):
    if user_id not in users_db:
        return jsonify({'error': 'User not found'}), 404

    history = quiz_responses_db.get(user_id, [])
    return jsonify({'history': history[-5:]}), 200  # Last 5 quiz attempts


# ==================== Messaging/Chat Routes ====================

@app.route('/api/chat', methods=['POST'])
def send_message():
    data = request.json
    user_id = data.get('user_id')
    message = data.get('message')

    if user_id not in users_db:
        return jsonify({'error': 'User not found'}), 404

    # Store user message
    user_message = {
        'sender': 'user',
        'text': message,
        'timestamp': datetime.now().isoformat()
    }

    if user_id not in messages_db:
        messages_db[user_id] = []

    messages_db[user_id].append(user_message)

    # Generate mock AI response based on mood context
    ai_responses = [
        "That's interesting. Tell me more about how you're feeling.",
        "I understand. Remember, it's okay to take breaks when you need them.",
        "Thank you for sharing. Have you tried any relaxation techniques?",
        "It sounds like you're going through a lot. Be kind to yourself.",
        "That's a valid concern. What steps can you take to address it?",
        "I'm here to listen. Is there anything specific bothering you?"
    ]

    import random
    ai_response_text = random.choice(ai_responses)

    ai_message = {
        'sender': 'ai',
        'text': ai_response_text,
        'timestamp': datetime.now().isoformat()
    }

    messages_db[user_id].append(ai_message)

    return jsonify({
        'success': True,
        'user_message': user_message,
        'ai_response': ai_message
    }), 201


@app.route('/api/chat/<int:user_id>', methods=['GET'])
def get_messages(user_id):
    if user_id not in users_db:
        return jsonify({'error': 'User not found'}), 404

    messages = messages_db.get(user_id, [])
    return jsonify({'messages': messages}), 200


# ==================== Music Recommendation Routes ====================

@app.route('/api/music-recommendation/<mood>', methods=['GET'])
def get_music_recommendation(mood):
    music_recommendations = {
        'happy': {
            'genre': 'Upbeat Pop',
            'youtube_query': 'upbeat happy music',
            'description': 'Feel-good tracks to boost your mood!'
        },
        'sad': {
            'genre': 'Emotional Ballads',
            'youtube_query': 'emotional healing music',
            'description': 'Soothing music to help you process emotions.'
        },
        'stressed': {
            'genre': 'Chill Ambient',
            'youtube_query': 'ambient relaxation music',
            'description': 'Calming background music for stress relief.'
        },
        'anxious': {
            'genre': 'Meditation Sounds',
            'youtube_query': 'meditation relaxation music',
            'description': 'Peaceful sounds to ease anxiety.'
        },
        'calm': {
            'genre': 'Soft Jazz',
            'youtube_query': 'smooth jazz music',
            'description': 'Smooth tunes to maintain your peaceful state.'
        }
    }

    recommendation = music_recommendations.get(mood, {
        'genre': 'Peaceful Music',
        'youtube_query': 'relaxing music',
        'description': 'Enjoy some calming music.'
    })

    return jsonify(recommendation), 200


# ==================== Admin Analytics Routes ====================

@app.route('/api/admin/analytics', methods=['GET'])
def get_analytics():
    total_users = len(users_db)
    
    # Count users by role
    role_distribution = {}
    for user in users_db.values():
        role = user['role']
        role_distribution[role] = role_distribution.get(role, 0) + 1

    # Mood distribution
    mood_distribution = {}
    for user_moods in moods_db.values():
        for mood_entry in user_moods:
            mood = mood_entry['mood']
            mood_distribution[mood] = mood_distribution.get(mood, 0) + 1

    # Average stress level from quizzes
    all_stress_scores = []
    for user_quizzes in quiz_responses_db.values():
        for quiz in user_quizzes:
            all_stress_scores.append(quiz['average_score'])

    average_stress = sum(all_stress_scores) / len(all_stress_scores) if all_stress_scores else 0

    return jsonify({
        'total_users': total_users,
        'role_distribution': role_distribution,
        'mood_distribution': mood_distribution,
        'average_stress_level': round(average_stress, 2),
        'total_mood_entries': sum(len(moods) for moods in moods_db.values()),
        'total_quiz_attempts': sum(len(quizzes) for quizzes in quiz_responses_db.values())
    }), 200


# ==================== Volunteer Routes ====================

@app.route('/api/volunteer/users-needing-help', methods=['GET'])
def get_users_needing_help():
    """Return mock list of users with high stress/anxiety needing volunteer support"""
    users_needing_help = []
    
    for user_id, quizzes in quiz_responses_db.items():
        if quizzes:
            latest_quiz = quizzes[-1]
            if latest_quiz['stress_level'] == 'High':
                user = users_db.get(user_id, {})
                users_needing_help.append({
                    'user_id': user_id,
                    'name': user.get('name', 'Unknown'),
                    'stress_level': latest_quiz['stress_level'],
                    'last_quiz_date': latest_quiz['timestamp']
                })

    return jsonify({'users': users_needing_help}), 200


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'OK', 'message': 'MindMitra Backend is running'}), 200


if __name__ == '__main__':
    app.run(debug=True, port=5000)
