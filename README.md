# SafeMind AI - Mental Health Support Application

A full-stack mental health web application designed to help users track their mood, assess stress levels, and receive personalized recommendations.

## Features

### 🎯 User Features
- **Authentication**: Secure login and registration system
- **Mood Tracking**: Track daily moods with visual emojis and trend analysis
- **Mental Health Quiz**: Comprehensive 5-question quiz to assess stress levels
- **AI Chat**: Chat with an AI assistant for mental health support
- **Mood Analytics**: View mood trends over time with interactive charts
- **Music Recommendations**: Get personalized music suggestions based on mood
- **Burnout Risk Indicator**: Real-time burnout risk assessment
- **Profile**: View personal information and mood summary

### 👥 Volunteer Features
- **User Support Dashboard**: View users with high stress levels
- **Direct Messaging**: Contact users needing support
- **Analytics**: Track user engagement and support needs

### ⚙️ Admin Features
- **Analytics Dashboard**: View comprehensive platform statistics
- **User Distribution**: Monitor users by role
- **Mood Analytics**: Visualize mood trends across all users
- **System Health**: Track total moods logged and quiz attempts

## Tech Stack

### Frontend
- **HTML5** - Markup structure
- **CSS3** - Styling with Tailwind CSS
- **JavaScript (Vanilla)** - Interactive features
- **Chart.js** - Data visualization

### Backend
- **Python 3** - Server language
- **Flask** - Web framework
- **Flask-CORS** - Cross-origin support
- **Werkzeug** - Security utilities

## Project Structure

```
MentalHealthTracker/
├── frontend/
│   ├── index.html          # Main HTML file with all pages
│   ├── css/
│   │   └── style.css       # Custom CSS styles
│   └── js/
│       └── script.js       # All frontend logic
├── backend/
│   ├── app.py              # Flask application with all routes
│   └── requirements.txt     # Python dependencies
└── README.md               # This file
```

## Installation & Setup

### Prerequisites
- Python 3.8 or higher
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Backend Setup

1. **Install Python Dependencies**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **Run Flask Server**
   ```bash
   python app.py
   ```
   The backend will start on `http://localhost:5000`

### Frontend Setup

1. Open `frontend/index.html` in your web browser, or serve it via a local server:

   **Option A: Using Python's built-in server**
   ```bash
   cd frontend
   python -m http.server 8000
   ```
   Then visit `http://localhost:8000`

   **Option B: Direct browser access**
   Simply open `frontend/index.html` directly in your browser

## API Endpoints

### Authentication
- `POST /api/register` - Register a new user
- `POST /api/login` - User login

### Mood Management
- `POST /api/mood` - Add a mood entry
- `GET /api/mood/<user_id>` - Get mood history and statistics

### Quiz
- `GET /api/quiz` - Get quiz questions
- `POST /api/quiz/submit` - Submit quiz answers

### Chat
- `POST /api/chat` - Send a message
- `GET /api/chat/<user_id>` - Get chat history

### Admin
- `GET /api/admin/analytics` - Get platform analytics

## Usage

1. Register with your name, email, password, and role
2. Login with your credentials
3. Choose your role: User, Volunteer, or Admin
4. Access your personalized dashboard

## Browser Compatibility

- Chrome/Chromium 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Features in Detail

### Mood Tracking
- 5 emotion types: Happy, Sad, Stressed, Anxious, Calm
- Color-coded visual representation
- Historical trend analysis

### Mental Health Quiz
- 5 comprehensive questions
- Stress level assessment (Low/Medium/High)
- Personalized recommendations

### AI Chat Assistant
- Real-time message responses
- Supportive conversation
- Message history

## License

MIT License - Feel free to use and modify this project

Version 1.0.0 | Last Updated: March 2026