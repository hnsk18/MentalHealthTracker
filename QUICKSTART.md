# SafeMind AI - Quick Start Guide

## 🚀 Getting Started (5 Minutes)

### Step 1: Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### Step 2: Start Backend Server
```bash
cd backend
python app.py
```
✓ Backend running on `http://localhost:5000`

### Step 3: Start Frontend Server (New Terminal)
```bash
cd frontend
python -m http.server 8000
```
✓ Frontend running on `http://localhost:8000`

### Step 4: Open in Browser
Visit: **http://localhost:8000**

---

## 📝 Create Test Accounts

After starting the application:

1. Click **Register**
2. Fill in your details:
   - Name: Test User
   - Email: test@example.com
   - Password: password123
   - Role: User
3. Click **Register**
4. Login with your credentials

---

## 🎯 Features to Try

### Track Your Mood
- Go to "Mood Tracker"
- Click on an emotion (Happy, Sad, Stressed, etc.)
- Watch the mood update in your dashboard

### Take the Quiz
- Go to "Quiz"
- Answer all 5 questions
- See your stress level assessment

### Chat with AI
- Go to "Chat"
- Type a message
- Get supportive responses

### View Analytics (Admin)
- Register as "Admin" role
- Login with admin account
- See mood distribution and user statistics

---

## 🐛 Troubleshooting

### Backend won't start
```
Error: Port 5000 already in use
Solution: Change port in app.py line: app.run(debug=True, port=5001)
```

### Frontend can't reach backend
```
Check browser console (F12)
Ensure backend is running on port 5000
Try refreshing the page
```

### Data not saving
```
The app uses in-memory storage
Data resets when you restart the backend
This is by design for demo purposes
```

---

## 📁 Important Files

| File | Purpose |
|------|---------|
| `/backend/app.py` | All API routes and business logic |
| `/frontend/index.html` | All HTML pages |
| `/frontend/css/style.css` | Custom styling |
| `/frontend/js/script.js` | Frontend logic and API calls |

---

## 🔒 Security Notes

- Passwords are hashed (never stored plain text)
- CORS is enabled for development
- All user input is validated
- XSS protection with HTML escaping

---

## 📱 Mobile Support

The app is fully responsive and works on:
- iPhone & iPad
- Android phones & tablets
- Tablets
- Desktop computers

---

## 🎨 Customization

### Change App Colors
Edit `/frontend/css/style.css`:
```css
:root {
    --primary: #667eea;      /* Main purple */
    --secondary: #764ba2;    /* Dark purple */
    --success: #4caf50;      /* Green */
}
```

### Modify Quiz Questions
Edit `/backend/app.py` in `QUIZ_QUESTIONS` variable

### Add More Moods
Edit `/backend/app.py`:
```python
MOOD_EMOJI = {
    "happy": "😊",
    "energetic": "⚡",
    # Add more here
}
```

---

## 🚀 Deployment Tips

### For Production
1. Set `debug=False` in app.py
2. Use a real database (PostgreSQL/SQLite)
3. Add authentication tokens (JWT)
4. Deploy on Heroku, AWS, or Azure
5. Use Nginx for reverse proxy

### Database Setup
Replace in-memory storage with SQLite:
```python
from flask_sqlalchemy import SQLAlchemy
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///safemind.db'
db = SQLAlchemy(app)
```

---

## 📞 Need Help?

Check these:
1. Browser console for errors (F12)
2. Backend terminal for server logs
3. Network tab to see API calls
4. Verify both services are running

---

## ✅ Checklist

- [ ] Python 3.8+ installed
- [ ] Backend dependencies installed
- [ ] Backend running on port 5000
- [ ] Frontend running on port 8000
- [ ] Browser opens to localhost:8000
- [ ] Can register an account
- [ ] Can login successfully
- [ ] Mood tracker works
- [ ] Quiz loads questions
- [ ] Chat responds to messages

---

**Ready to start? Run STARTUP.bat (Windows) or STARTUP.sh (Mac/Linux)!**

Questions? Check the main README.md for more details.
