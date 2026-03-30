# SafeMind AI - API Documentation

Complete API reference for SafeMind AI backend services.

## Base URL
```
http://localhost:5000/api
```

## Response Format
All responses are in JSON format.

### Success Response
```json
{
    "success": true,
    "data": {},
    "message": "Operation successful"
}
```

### Error Response
```json
{
    "error": "Error message here"
}
```

---

## Authentication Endpoints

### Register User
**POST** `/register`

Create a new user account.

**Request Body:**
```json
{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "securepass123",
    "role": "user"
}
```

**Response (201):**
```json
{
    "success": true,
    "user_id": 1,
    "message": "Registration successful"
}
```

**Error Responses:**
- 400: `{"error": "Email already exists"}`

---

### Login User
**POST** `/login`

Authenticate user and get session info.

**Request Body:**
```json
{
    "email": "john@example.com",
    "password": "securepass123",
    "role": "user"
}
```

**Response (200):**
```json
{
    "success": true,
    "user_id": 1,
    "name": "John Doe",
    "role": "user",
    "email": "john@example.com"
}
```

**Error Responses:**
- 401: `{"error": "Invalid credentials"}`

---

## User Endpoints

### Get User Info
**GET** `/user/<user_id>`

Retrieve user profile information.

**Parameters:**
- `user_id` (path parameter): User ID

**Response (200):**
```json
{
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user"
}
```

**Error Responses:**
- 404: `{"error": "User not found"}`

---

## Mood Endpoints

### Add Mood Entry
**POST** `/mood`

Record a new mood entry.

**Request Body:**
```json
{
    "user_id": 1,
    "mood": "happy"
}
```

**Valid Moods:** `happy`, `sad`, `stressed`, `anxious`, `calm`

**Response (201):**
```json
{
    "success": true,
    "mood_entry": {
        "mood": "happy",
        "timestamp": "2024-03-30T10:30:00",
        "emoji": "😊",
        "color": "#FFD700"
    }
}
```

---

### Get Mood History
**GET** `/mood/<user_id>`

Retrieve mood history and statistics.

**Parameters:**
- `user_id` (path parameter): User ID

**Response (200):**
```json
{
    "current_mood": {
        "mood": "happy",
        "emoji": "😊",
        "color": "#FFD700"
    },
    "mood_history": [
        {
            "mood": "happy",
            "timestamp": "2024-03-30T10:30:00",
            "emoji": "😊",
            "color": "#FFD700"
        }
    ],
    "mood_counts": {
        "happy": 5,
        "sad": 2,
        "stressed": 1,
        "anxious": 0,
        "calm": 8
    },
    "total_moods": 16
}
```

**Error Responses:**
- 404: `{"error": "User not found"}`

---

## Quiz Endpoints

### Get Quiz Questions
**GET** `/quiz`

Retrieve all quiz questions.

**Response (200):**
```json
{
    "questions": [
        {
            "id": 1,
            "question": "How often do you feel stressed?",
            "options": ["Never", "Rarely", "Sometimes", "Often", "Always"],
            "weight": [0, 1, 2, 3, 4]
        }
    ],
    "total_questions": 5
}
```

---

### Submit Quiz Answers
**POST** `/quiz/submit`

Submit quiz answers and get stress assessment.

**Request Body:**
```json
{
    "user_id": 1,
    "answers": [2, 1, 0, 3, 2]
}
```

**Response (201):**
```json
{
    "success": true,
    "result": {
        "timestamp": "2024-03-30T10:30:00",
        "score": 8,
        "average_score": 1.6,
        "stress_level": "Low",
        "recommendation": "Great! Keep maintaining your healthy habits."
    }
}
```

**Stress Levels:**
- **Low** (score < 1.5): Keep up healthy habits
- **Medium** (score 1.5-2.5): Consider more breaks
- **High** (score > 2.5): Seek professional help

---

### Get Quiz History
**GET** `/quiz/history/<user_id>`

Retrieve user's previous quiz attempts.

**Parameters:**
- `user_id` (path parameter): User ID

**Response (200):**
```json
{
    "history": [
        {
            "timestamp": "2024-03-30T10:30:00",
            "score": 8,
            "average_score": 1.6,
            "stress_level": "Low",
            "recommendation": "Great! Keep maintaining your healthy habits."
        }
    ]
}
```

---

## Chat Endpoints

### Send Message
**POST** `/chat`

Send a message and get AI response.

**Request Body:**
```json
{
    "user_id": 1,
    "message": "I'm feeling overwhelmed lately"
}
```

**Response (201):**
```json
{
    "success": true,
    "user_message": {
        "sender": "user",
        "text": "I'm feeling overwhelmed lately",
        "timestamp": "2024-03-30T10:30:00"
    },
    "ai_response": {
        "sender": "ai",
        "text": "I understand. Remember, it's okay to take breaks when you need them.",
        "timestamp": "2024-03-30T10:30:01"
    }
}
```

---

### Get Chat History
**GET** `/chat/<user_id>`

Retrieve user's chat history.

**Parameters:**
- `user_id` (path parameter): User ID

**Response (200):**
```json
{
    "messages": [
        {
            "sender": "user",
            "text": "Hello",
            "timestamp": "2024-03-30T10:30:00"
        },
        {
            "sender": "ai",
            "text": "Hi there! How can I help?",
            "timestamp": "2024-03-30T10:30:01"
        }
    ]
}
```

---

## Music Recommendation Endpoint

### Get Music Recommendation
**GET** `/music-recommendation/<mood>`

Get music recommendation based on mood.

**Parameters:**
- `mood` (path parameter): One of `happy`, `sad`, `stressed`, `anxious`, `calm`

**Response (200):**
```json
{
    "genre": "Upbeat Pop",
    "youtube_query": "upbeat happy music",
    "description": "Feel-good tracks to boost your mood!"
}
```

---

## Admin Endpoints

### Get Platform Analytics
**GET** `/admin/analytics`

Retrieve platform-wide statistics (admin only).

**Response (200):**
```json
{
    "total_users": 42,
    "role_distribution": {
        "user": 35,
        "volunteer": 5,
        "admin": 2
    },
    "mood_distribution": {
        "happy": 120,
        "sad": 45,
        "stressed": 89,
        "anxious": 56,
        "calm": 78
    },
    "average_stress_level": 1.85,
    "total_mood_entries": 388,
    "total_quiz_attempts": 102
}
```

---

## Volunteer Endpoints

### Get Users Needing Help
**GET** `/volunteer/users-needing-help`

Get list of users with high stress levels (volunteer view).

**Response (200):**
```json
{
    "users": [
        {
            "user_id": 5,
            "name": "Jane Smith",
            "stress_level": "High",
            "last_quiz_date": "2024-03-30T08:15:00"
        }
    ]
}
```

---

## Health Check Endpoint

### Health Status
**GET** `/health`

Check if backend is running.

**Response (200):**
```json
{
    "status": "OK",
    "message": "SafeMind AI Backend is running"
}
```

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK - Request successful |
| 201 | Created - Resource created successfully |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Invalid credentials |
| 404 | Not Found - Resource not found |
| 500 | Server Error - Internal server error |

---

## Rate Limiting

Currently no rate limiting is implemented. For production:
- Implement rate limiting per user/IP
- Use Redis for session management
- Add request throttling

---

## Authentication

Currently uses simple session management. For production:
- Implement JWT tokens
- Add refresh token mechanism
- Use secure HTTP-only cookies
- Add role-based access control (RBAC)

---

## Error Handling

All errors return appropriate HTTP status codes with descriptive messages.

**Example Error Response:**
```json
{
    "error": "User not found"
}
```

---

## Example Requests

### Using cURL

**Register:**
```bash
curl -X POST http://localhost:5000/api/register \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com","password":"pass123","role":"user"}'
```

**Login:**
```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"pass123","role":"user"}'
```

**Add Mood:**
```bash
curl -X POST http://localhost:5000/api/mood \
  -H "Content-Type: application/json" \
  -d '{"user_id":1,"mood":"happy"}'
```

### Using JavaScript/Fetch

```javascript
// Register
fetch('http://localhost:5000/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        name: 'John',
        email: 'john@example.com',
        password: 'pass123',
        role: 'user'
    })
})
.then(r => r.json())
.then(data => console.log(data));
```

---

## Versioning

Current API Version: **1.0.0**

Future versions may introduce:
- API versioning with `/v2/`
- Deprecation notices
- Migration guides

---

## Rate Limit Headers (Future)

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1672531200
```

---

**Last Updated**: March 2026
**API Version**: 1.0.0
