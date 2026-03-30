# SafeMind AI - Testing Guide

Comprehensive testing guide for SafeMind AI application.

## Pre-Testing Checklist

- [ ] Python 3.8+ installed
- [ ] All dependencies installed
- [ ] Backend running on localhost:5000
- [ ] Frontend running on localhost:8000
- [ ] Browser cache cleared
- [ ] Developer console open (F12)

---

## Manual Testing

### 1. User Registration

**Test Case 1.1: Valid Registration**
- [ ] Click "Register"
- [ ] Fill in all fields with valid data
- [ ] Select role "User"
- [ ] Click "Register"
- [ ] Verify: Success message shown
- [ ] Expected: Redirected to login page

**Test Case 1.2: Duplicate Email**
- [ ] Register with email
- [ ] Try registering again with same email
- [ ] Verify: Error message "Email already exists"

**Test Case 1.3: Empty Fields**
- [ ] Leave required fields empty
- [ ] Click "Register"
- [ ] Verify: Browser validation prevents submission

**Test Case 1.4: Invalid Email**
- [ ] Enter invalid email format
- [ ] Click "Register"
- [ ] Verify: Browser rejects invalid email

---

### 2. User Login

**Test Case 2.1: Valid Login**
- [ ] Click "Login"
- [ ] Enter correct email and password
- [ ] Select matching role
- [ ] Click "Login"
- [ ] Verify: Dashboard loads
- [ ] Verify: User name shown in navbar

**Test Case 2.2: Invalid Credentials**
- [ ] Enter wrong password
- [ ] Click "Login"
- [ ] Verify: Error message shown

**Test Case 2.3: Role Mismatch**
- [ ] Register as "User"
- [ ] Try login with "Admin" role
- [ ] Verify: Login fails

**Test Case 2.4: Session Persistence**
- [ ] Login successfully
- [ ] Refresh page
- [ ] Verify: User still logged in
- [ ] Clear localStorage
- [ ] Refresh page
- [ ] Verify: Redirected to home

---

### 3. Mood Tracking

**Test Case 3.1: Add Mood Entry**
- [ ] Navigate to "Mood Tracker"
- [ ] Click on "Happy" emoji
- [ ] Verify: Success message appears
- [ ] Verify: Mood added to history

**Test Case 3.2: Multiple Mood Entries**
- [ ] Add different moods (sad, stressed, etc.)
- [ ] Verify: All moods appear in history
- [ ] Verify: Most recent mood shown first

**Test Case 3.3: Mood Colors**
- [ ] Add each mood type
- [ ] Verify: Colors match expectations:
  - Happy = Yellow (#FFD700)
  - Sad = Blue (#4169E1)
  - Stressed = Red (#FF6347)
  - Anxious = Orange (#FF8C00)
  - Calm = Green (#90EE90)

**Test Case 3.4: Dashboard Mood Update**
- [ ] Add mood from mood tracker
- [ ] Go to dashboard
- [ ] Verify: Current mood card updates
- [ ] Verify: Emoji and color correct

---

### 4. Quiz Functionality

**Test Case 4.1: Load Quiz**
- [ ] Navigate to "Quiz"
- [ ] Verify: All 5 questions load
- [ ] Verify: All options displayed

**Test Case 4.2: Submit Quiz**
- [ ] Answer all questions
- [ ] Click "Submit Quiz"
- [ ] Verify: Results appear
- [ ] Verify: Stress level shown
- [ ] Verify: Recommendation displayed

**Test Case 4.3: Stress Levels**
- [ ] Select answers to get "Low" stress
- [ ] Verify: Message indicates low stress
- [ ] Select answers to get "High" stress
- [ ] Verify: Message recommends help

**Test Case 4.4: Score Calculation**
- [ ] Submit quiz
- [ ] Verify: Score calculated correctly
- [ ] Verify: Score out of 20 displayed

**Test Case 4.5: Incomplete Quiz**
- [ ] Try submitting without answering all
- [ ] Verify: Validation error shown
- [ ] Verify: Cannot submit

---

### 5. Chat Functionality

**Test Case 5.1: Send Message**
- [ ] Navigate to "Chat"
- [ ] Type message and press Send
- [ ] Verify: User message appears
- [ ] Verify: AI response appears

**Test Case 5.2: Message History**
- [ ] Send multiple messages
- [ ] Verify: All messages in chat
- [ ] Verify: Correct sender (user/ai)

**Test Case 5.3: Empty Message**
- [ ] Try sending empty message
- [ ] Verify: Nothing sent

**Test Case 5.4: Long Message**
- [ ] Send very long message
- [ ] Verify: Message wraps correctly
- [ ] Verify: Response received

**Test Case 5.5: Special Characters**
- [ ] Send message with emojis
- [ ] Verify: Displayed correctly

---

### 6. Profile Page

**Test Case 6.1: View Profile**
- [ ] Navigate to "Profile"
- [ ] Verify: User name displayed
- [ ] Verify: Email displayed
- [ ] Verify: Role displayed

**Test Case 6.2: Mood Summary**
- [ ] Add several moods
- [ ] Go to Profile
- [ ] Verify: Count for each mood shown

---

### 7. Admin Dashboard

**Test Case 7.1: Admin Access**
- [ ] Register as Admin
- [ ] Login as Admin
- [ ] Verify: Admin dashboard loads
- [ ] Verify: Regular users can't access

**Test Case 7.2: Statistics**
- [ ] Check "Total Users"
- [ ] Verify: Count accurate
- [ ] Check "Mood Entries"
- [ ] Verify: Count accurate

**Test Case 7.3: Charts**
- [ ] Verify: Mood distribution chart loads
- [ ] Verify: Role distribution chart loads
- [ ] Verify: Charts update when data changed

---

### 8. Volunteer Dashboard

**Test Case 8.1: Volunteer Access**
- [ ] Register as Volunteer
- [ ] Login as Volunteer
- [ ] Verify: Volunteer dashboard loads

**Test Case 8.2: Users Needing Help**
- [ ] Create user with high stress quiz
- [ ] Login as Volunteer
- [ ] Verify: User appears in list
- [ ] Verify: Stress level shown

---

### 9. Navigation

**Test Case 9.1: Navbar Links**
- [ ] Login
- [ ] Click each navbar link
- [ ] Verify: Correct page loads
- [ ] Verify: URL changes properly

**Test Case 9.2: Back Buttons**
- [ ] Use back buttons on auth pages
- [ ] Verify: Return to previous page

**Test Case 9.3: Direct URL Access**
- [ ] Try accessing protected pages directly
- [ ] Verify: Redirects appropriately

---

### 10. Responsive Design

**Test Case 10.1: Mobile View**
- [ ] Open in mobile browser (320px)
- [ ] Verify: Layout adapts
- [ ] Verify: All buttons clickable

**Test Case 10.2: Tablet View**
- [ ] Open in tablet view (768px)
- [ ] Verify: Layout optimized
- [ ] Verify: Charts display well

**Test Case 10.3: Desktop View**
- [ ] Open on desktop (1920px)
- [ ] Verify: Full layout used
- [ ] Verify: No horizontal scrolling

---

### 11. Music Recommendations

**Test Case 11.1: Get Recommendation**
- [ ] Add mood
- [ ] Dashboard shows music section
- [ ] Verify: Genre shown
- [ ] Verify: YouTube link works

**Test Case 11.2: Different Moods**
- [ ] Change mood
- [ ] Verify: Different recommendations

---

### 12. Error Handling

**Test Case 12.1: Backend Crash**
- [ ] Stop backend server
- [ ] Try using frontend
- [ ] Verify: Error message shown
- [ ] Restart backend
- [ ] Verify: Works again

**Test Case 12.2: Network Error**
- [ ] Disable internet
- [ ] Try sending message
- [ ] Verify: Error message shown

**Test Case 12.3: Invalid Data**
- [ ] Try sending malformed requests
- [ ] Verify: Backend handles gracefully

---

### 13. Performance Testing

**Test Case 13.1: Page Load Time**
- [ ] Measure dashboard load time
- [ ] Verify: < 2 seconds
- [ ] Check Network tab for assets

**Test Case 13.2: API Response Time**
- [ ] Monitor API calls
- [ ] Verify: < 500ms typically
- [ ] Check for slow endpoints

**Test Case 13.3: Chart Rendering**
- [ ] Load dashboard with chart
- [ ] Verify: Renders smoothly
- [ ] No lag when scrolling

---

### 14. Data Persistence

**Test Case 14.1: Mood History**
- [ ] Add mood
- [ ] Refresh page
- [ ] Verify: Mood still there

**Test Case 14.2: Chat History**
- [ ] Send messages
- [ ] Refresh page
- [ ] Verify: Messages still there

**Test Case 14.3: Quiz History**
- [ ] Submit quiz
- [ ] Refresh page
- [ ] Verify: Results still there

---

## Automated Testing (cURL)

### Test Registration

```bash
curl -X POST http://localhost:5000/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "testpass",
    "role": "user"
  }'
```

### Test Login

```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpass",
    "role": "user"
  }'
```

### Test Mood

```bash
curl -X POST http://localhost:5000/api/mood \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "mood": "happy"
  }'
```

### Test Quiz

```bash
curl -X POST http://localhost:5000/api/quiz/submit \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "answers": [0, 1, 2, 1, 0]
  }'
```

---

## Browser Console Checks

1. **Check for errors:**
   - Open Developer Tools (F12)
   - Go to Console tab
   - No red errors should appear

2. **Check for warnings:**
   - Minimize warnings
   - Check for CORS issues
   - Verify API calls in Network tab

3. **Check Network requests:**
   - Monitor all API calls
   - Verify status codes 200s
   - Check response times

---

## Accessibility Testing

- [ ] Keyboard navigation (Tab key)
- [ ] Screen reader compatibility (for future)
- [ ] Color contrast ratios
- [ ] Form labels properly associated
- [ ] Buttons have clear labels

---

## Security Testing

**Do NOT perform these without authorization:**

- [ ] SQL Injection in forms
- [ ] XSS attempts
- [ ] CSRF token validation
- [ ] Authentication bypass
- [ ] Privilege escalation

---

## Test Results Template

| Test Case | Status | Notes |
|-----------|--------|-------|
| 1.1 Valid Registration | ✓ Pass | - |
| 1.2 Duplicate Email | ✓ Pass | - |
| - | - | - |

---

## Common Issues & Solutions

### Issue: Login not working
- **Solution**: Check email matches exactly (case-sensitive)
- Verify role matches registration
- Check browser console for errors

### Issue: Moods not saving
- **Solution**: Verify user_id is correct
- Check backend is running
- Clear browser cache

### Issue: Charts not displaying
- **Solution**: Check internet connection
- Verify Chart.js CDN is accessible
- Refresh page

### Issue: Messages not sending
- **Solution**: Check message is not empty
- Verify backend is running
- Check browser console

---

## Load Testing

### Using Apache Bench

```bash
# Test homepage
ab -n 100 -c 10 http://localhost:8000/

# Test API endpoint
ab -n 100 -c 10 -H "Content-Type: application/json" \
  -p data.json http://localhost:5000/api/login
```

### Stress Test

```bash
# Test with load
ab -n 1000 -c 50 http://localhost:8000/
```

---

## Test Summary Report

After completing testing:

- [ ] All manual tests passed
- [ ] No console errors
- [ ] All features working
- [ ] Responsive on all devices
- [ ] Performance acceptable
- [ ] No security issues found
- [ ] Data persists correctly

---

**Date Tested**: ___________
**Tester**: ___________
**Result**: ___________

Last Updated: March 2026
