# Volunteer Dashboard Implementation Guide

## 🎯 Overview

A comprehensive **Volunteer Dashboard** has been successfully integrated into the MindMitra Mental Health Tracker project. This implementation follows all existing patterns, reuses components, and seamlessly integrates with the current architecture.

---

## 📁 File Structure & Changes

### Backend (server.js)

**New Database Structures Added:**
```javascript
// Volunteer-specific in-memory databases
const volunteer_assignments = {};    // volunteer_id -> [assigned_user_ids]
const session_notes = {};           // user_id -> { volunteer_id, notes, timestamp }
const reminders = {};               // reminder_id -> { volunteer_id, user_id, timestamp, status }
const user_transfers = {};          // user_id -> { from_volunteer_id, to_volunteer_id, reason, transfer_cooldown_until }
```

**NEW API ENDPOINTS:**

1. **GET `/api/volunteer/assigned-users/:volunteer_id`**
   - Fetches all users assigned to a volunteer
   - Returns: User list with mood, risk level, last active timestamp
   - Relationship Patterns: Reuses existing mood_db and quiz_responses_db

2. **GET `/api/volunteer/user/:user_id/details/:volunteer_id`**
   - Gets detailed view of a specific user
   - Returns: 7-day mood trend, chat preview, tags, risk level, session notes
   - Access Control: Verifies volunteer has permission to view user

3. **POST `/api/volunteer/session-notes`**
   - Saves volunteer's session notes for a user
   - Stores: volunteer_id, notes, timestamp
   - Enables: Session tracking and record-keeping

4. **POST `/api/volunteer/reminder`**
   - Schedule check-in reminders
   - Stores: reminder_id, volunteer_id, user_id, scheduled_time, status
   - Feature: Auto-generated reminder tracking

5. **POST `/api/volunteer/transfer-user`**
   - Transfer user to another volunteer
   - Includes: 7-day cooldown logic, transfer reason, from/to volunteer IDs
   - Prevents: Rapid consecutive transfers

6. **GET `/api/volunteer/analytics/:volunteer_id`**
   - Fetch volunteer's performance analytics
   - Returns: Sessions per week, mood trends, average response time
   - Metrics: Total sessions, assigned users count

---

### Frontend HTML (index.html)

#### **New Navigation Components**

```html
<!-- Role-based navigation divs for conditional display -->
<div id="userNavigation">              <!-- User nav links -->
<div id="volunteerNavigation">         <!-- Volunteer nav links -->
<div id="adminNavigation">             <!-- Admin nav links -->

<!-- Mobile menu variants -->
<div id="userMobileNav">
<div id="volunteerMobileNav">
<div id="adminMobileNav">
```

#### **New Volunteer Dashboard Section** (`id="volunteer-dashboard"`)

**Tab Structure:**
- `volunteer-home`: Dashboard summary & quick stats
- `volunteer-users`: Assigned users list with filters
- `volunteer-user-detail`: Individual user detail page
- `volunteer-analytics`: Performance analytics
- `volunteer-chat`: Full chat conversation view

**Key Components:**
1. **Dashboard Home Tab**
   - 4 summary cards (Assigned Users, Active Chats, Sessions Completed, Avg Response Time)
   - Quick action buttons
   - Overview statistics

2. **Assigned Users Tab**
   - Filterable user list with:
     - Mood filter (Happy, Sad, Stressed, Anxious, Calm)
     - Risk level filter (Low, Medium, High)
     - Activity filter (Recent, This Week, Inactive)
   - User cards showing:
     - Anonymous user ID
     - Current mood with emoji
     - Last active timestamp
     - Risk level badge

3. **User Detail Tab**
   - **Left Column (2/3 width):**
     - 7-day mood trend chart
     - Chat preview (last 5 messages)
   
   - **Right Column (1/3 width):**
     - Session notes input & save button
     - Tags (auto-generated from mood patterns)
     - Check-in reminder scheduler
     - Transfer user button (with modal)

4. **Analytics Tab**
   - Sessions per week bar chart
   - User mood trends doughnut chart
   - Metrics and insights

5. **Chat View Tab**
   - Full conversation display
   - Message input & send functionality
   - Scroll-to-bottom auto-scroll

**Transfer User Modal:**
- Reason dropdown (Outside expertise, At capacity, Better match needed)
- Confirm/Cancel buttons
- 7-day cooldown enforcement

---

### Frontend CSS (frontend/css/volunteer-dashboard.css)

**NEW FILE** - Comprehensive styling for volunteer dashboard

**Key Classes:**
- `.volunteer-tab` - Tab container with fade-in animation
- `.volunteer-user-card` - User card component with risk-level borders
- `.risk-badge` - Risk level indicators (High/Medium/Low)
- `.mood-display` - Mood emoji and label styling
- `.volunteer-message` - Chat message bubbles (user/ai variants)
- `.tag` - Mood/condition tags with color gradients
- `.modal-overlay` - Transfer modal styling
- `.quick-stat-item` - Quick stats visualization

**Features:**
- Animations: fadeIn, slideInMessage, slideUp
- Responsive design (mobile-optimized)
- Color-coded risk levels
- Gradient backgrounds matching project theme
- Chart container styling

---

### Frontend JavaScript (frontend/js/volunteer-dashboard.js)

**NEW FILE** - Complete volunteer dashboard functionality (290+ lines)

**Core Functions:**

#### Navigation & State Management
- `navigateVolunteerTab(tabName)` - Switch between tabs
- `updateNavigationByRole(role)` - Show/hide role-specific nav
- `initializeVolunteerDashboard(user)` - Initialize volunteer session

#### Dashboard Home
- `loadVolunteerDashboardHome()` - Load summary cards with analytics
- `loadVolunteerQuickStats()` - Display quick overview
- `displayAssignedUsers(users)` - Render user list
- `createUserCard(user)` - Generate individual user card

#### Filtering & Search
- `applyVolunteerFilters()` - Apply mood/risk/activity filters
- Supports: Multiple concurrent filters

#### User Details
- `viewUserDetail(userId)` - Load user detail page
- `displayUserDetail(userDetail)` - Render detail information
- `loadMoodTrendChartVolunteer(moodHistory)` - 7-day mood chart
- `displayVolunteerChatPreview(messages)` - Recent messages
- `displayVolunteerUserTags(tags)` - Auto-generated mood tags

#### Session Management
- `saveVolunteerSessionNotes()` - Save notes via API
- `scheduleVolunteerReminder()` - Schedule check-in reminder
- `openTransferModal()` / `closeTransferModal()` - Modal controls
- `confirmTransferUser()` - Execute user transfer with cooldown

#### Chat & Messaging
- `openVolunteerChat()` - Open full chat view
- `loadVolunteerChatMessages()` - Fetch message history
- `displayVolunteerChatMessages(messages)` - Render messages
- `sendVolunteerMessage()` - Send message to user

#### Analytics
- `loadVolunteerAnalytics()` - Fetch analytics data
- `loadSessionsChart(sessionsData)` - Bar chart for sessions/week
- `loadMoodTrendsChart(moodData)` - Doughnut chart for mood distribution

#### Utility Functions
- `getMoodColor(mood)` - Get hex color for mood
- `getMoodValue(mood)` - Get numeric value (0-5 scale)
- `getTimeSinceString(date)` - Format relative timestamps
- `capitalizeFirstLetter(str)` - String formatting
- `escapeHtml(text)` - XSS prevention
- `showVolunteerToast(message, type)` - Toast notifications

---

### Frontend JavaScript Integration (frontend/js/script.js)

**Updates Made:**

1. **Updated `handleLogin(e)` function**
   - Added volunteer account handling
   - Calls `initializeVolunteerDashboard(data)` for volunteers
   - Calls `updateNavigationByRole('volunteer')` for role-based nav
   - Maintains backward compatibility with user/admin roles

2. **Updated `DOMContentLoaded` initialization**
   - Restores user session based on role
   - Routes to correct dashboard (volunteer/admin/user)
   - Initializes navigation based on restored role

3. **Navigation Updates**
   - Leverages `updateNavigationByRole()` from volunteer-dashboard.js
   - Shows/hides nav items based on current user role

---

## 🔄 Architecture & Patterns

### Design Patterns Used (Following Existing Project)

1. **State Management**
   - ✅ Global variables: `currentVolunteerUser`, `selectedUserDetail`
   - ✅ localStorage integration for persistence
   - ✅ Matches existing pattern (currentUser, moodChart, etc.)

2. **API Patterns**
   - ✅ Standard fetch() with JSON bodies
   - ✅ Error handling with try-catch
   - ✅ Consistent response checking (response.ok)
   - ✅ Toast notifications for feedback
   - ✅ Reuses API_BASE constant

3. **Component Structure**
   - ✅ Modular tab-based interface
   - ✅ Chart.js for data visualization
   - ✅ Reusable card components
   - ✅ Modal dialogs for actions
   - ✅ Filter UI patterns

4. **Styling**
   - ✅ Tailwind CSS utility classes
   - ✅ Gradient backgrounds (project brand)
   - ✅ Consistent color scheme
   - ✅ Reusable CSS classes for components
   - ✅ Responsive grid layouts

5. **Authentication**
   - ✅ Role-based access control (RBAC)
   - ✅ Volunteer-specific endpoints with permission checks
   - ✅ 7-day cooldown logic for transfers

---

## 🎮 How to Use the Volunteer Dashboard

### 1. Login as Volunteer
- Go to home page
- Click "Volunteer" role button
- Click "Login"
- Use volunteer credentials (role='volunteer')
- Automatically redirected to volunteer-dashboard

### 2. Dashboard Home Tab
- View summary cards with key metrics
- See quick statistics
- Click "View Assigned Users" or "View Analytics" to navigate

### 3. Assigned Users Tab
- Browse all assigned users
- Use filters:
  - **Mood Filter**: Select specific mood to filter
  - **Risk Level Filter**: View high/medium/low risk users
  - **Activity Filter**: Recent (24h), This Week, or Inactive
- Click "View Details →" on any user card to see detail page

### 4. User Detail Tab
- **7-Day Mood Trend**: Visual chart of mood history
- **Chat Preview**: See last 5 messages
- **Tags**: Auto-generated from mood patterns
- **Session Notes**: Add/update notes about the session

### 5. Check-in Reminder
- Select date/time for reminder
- Click "Schedule Reminder"
- Reminder stored in backend (mock notification)

### 6. Transfer User
- Select transfer reason:
  - "Outside expertise"
  - "At capacity"
  - "Better match needed"
- Click "Confirm Transfer"
- User automatically transferred (7-day cooldown active)

### 7. Open Full Chat
- Click "Open Chat" button in user detail
- View complete message history
- Send messages to user (routed through backend)

### 8. Analytics Tab
- **Sessions Per Week**: Bar chart showing activity by week
- **Mood Trends**: Doughnut chart of mood distribution
- Insights into volunteer's caseload

---

## 🔐 Security & Data Integrity

### Access Control Implemented:
- ✅ Volunteer-only endpoints with ID verification
- ✅ User assignment validation (can only view assigned users)
- ✅ Transfer cooldown (7 days) prevents spam
- ✅ Role-based navigation (volunteer nav hidden for other roles)
- ✅ XSS protection via `escapeHtml()` function

### Backend Validations:
- ✅ User existence checks
- ✅ Volunteer assignment verification
- ✅ Cooldown date validation
- ✅ 404 responses for unauthorized access

---

## 📊 Data Flow

### User Assignment Algorithm (Auto-initialized)
```
1. For each user with High stress from last quiz:
   2. Assign to volunteer_id = (user_id % 3) + 100
   3. Store in volunteer_assignments[volunteer_id]
```
**Result**: Simulates 3 volunteers (IDs: 100, 101, 102) with distributed users

### 7-Day Mood Trend Calculation
```
1. Fetch last 7 mood entries from moods_db
2. Convert to chart-friendly format (dates, values)
3. Display with Chart.js line chart
```

### Analytics Aggregation
```
1. Get all assigned user IDs for volunteer
2. Aggregate messages per week
3. Count mood distributions
4. Calculate average response time (mock: 5-30 mins)
```

---

## ⚙️ Configuration & Customization

### Change Volunteer Assignment
Edit in `server.js` line ~595:
```javascript
const volunteer_id = (parseInt(uid) % 3) + 100;  // Change 3 for more volunteers
```

### Adjust Cooldown Period
Edit in `server.js` line ~698:
```javascript
cooldown_date.setDate(cooldown_date.getDate() + 7);  // Change 7 to desired days
```

### Customize Risk Levels
Edit in `volunteer-dashboard.js`:
```javascript
const highRiskCount = data.assigned_users.filter(u => u.risk_level === 'High').length;
```

---

## 📋 Feature Checklist

✅ **Dashboard Home**
- Summary cards (Assigned users, Active chats, Sessions, Avg response time)
- Quick overview statistics

✅ **Assigned Users Module**
- Fetch from backend API
- List display with anonymous IDs, mood, last active
- 3 filter types (Mood, Risk level, Activity)

✅ **User Detail Page**
- 7-day mood trend chart (Chart.js)
- Chat preview (last 5 messages)
- Auto-generated tags from mood patterns
- Session notes input & storage

✅ **Messaging Integration**
- Full chat view with history
- Send/receive messages
- Message bubbles with timestamps
- Responsive layout

✅ **Check-in Reminder**
- DateTime picker
- Schedule reminder button
- Backend API storage
- Mock notification system

✅ **Transfer User Feature**
- Modal with reason selection
- 3 predefined reasons
- 7-day cooldown logic
- Automatic user reassignment

✅ **Analytics Section**
- Sessions per week (bar chart)
- Mood trends (doughnut chart)
- Key metrics display

✅ **Routing**
- /volunteer/dashboard (home)
- /volunteer/users (assigned users tab)
- /volunteer/users/:id (detail via viewUserDetail())

✅ **State Management**
- Global state variables
- localStorage persistence
- Session restoration on reload

✅ **Code Quality**
- Modular functions with clear purposes
- Reused utilities (getTimeSinceString, escapeHtml, etc.)
- Meaningful comments throughout
- No duplication with existing code
- Follows project conventions

---

## 🚀 Running the Application

1. **Start the Server**
   ```bash
   npm start
   ```
   Server runs on http://localhost:5000

2. **Access the Application**
   - Open http://localhost:5000 in browser
   - Click "Volunteer" → "Login"
   - Login as volunteer (role='volunteer')

3. **View Volunteer Dashboard**
   - Automatically redirected to volunteer dashboard
   - Navigate through tabs using buttons or navbar

---

## 🔍 Testing Recommendations

### 1. User Assignment Test
- Login as volunteer
- Check "Assigned Users" tab
- Verify high-stress users appear

### 2. Filter Test
- Apply mood filter → should filter users
- Apply risk filter → should show matching risk levels
- Apply activity filter → should show recent/inactive users
- Combine filters → should apply all simultaneously

### 3. User Detail Test
- Click "View Details" on user
- Verify mood chart displays (7 days)
- Verify chat preview shows recent messages
- Verify tags auto-generate

### 4. Session Notes Test
- Add notes in detail page
- Click "Save Notes"
- Verify success toast
- Reload page → notes should persist

### 5. Reminder Test
- Select date/time
- Click "Schedule Reminder"
- Verify toast notification
- Check backend stored reminder

### 6. Transfer Test
- Select transfer reason
- Click "Confirm Transfer"
- Verify "7-day cooldown" message
- Try transfer again → should fail with cooldown error

### 7. Analytics Test
- Click "Analytics" tab
- Verify charts render correctly
- Check sessions per week bar chart
- Check mood trends doughnut chart

### 8. Navigation Test
- Test all navbar links for volunteer role
- Verify user/admin nav hidden when logged in as volunteer
- Test mobile menu navigation

---

## 📝 Code Examples

### Example: Adding a New Filter
```javascript
// In volunteer-dashboard.js applyVolunteerFilters()
const statusFilter = document.getElementById('volStatusFilter').value;
if (statusFilter === 'active') {
    filtered = filtered.filter(u => new Date(u.last_active) > thirtyDaysAgo);
}
```

### Example: Adding a New Analytics Chart
```javascript
// Create new canvas in HTML
<canvas id="volNewChart"></canvas>

// Add function in JS
function loadNewChart(data) {
    const ctx = document.getElementById('volNewChart').getContext('2d');
    new Chart(ctx, { /* config */ });
}
```

### Example: Creating Custom Endpoint
```javascript
// In server.js
app.get('/api/volunteer/custom/:volunteer_id', (req, res) => {
    // Your logic here
    res.json({ /* response */ });
});
```

---

## 🎨 Styling Customization

### Change Color Theme
Edit `volunteer-dashboard.css`:
```css
.volunteer-user-card {
    border-left: 4px solid #667eea;  /* Change to new color */
}
```

### Adjust Card Hover Effect
```css
.volunteer-user-card:hover {
    transform: translateY(-5px);  /* Increase/decrease pixels */
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);  /* Adjust shadow */
}
```

### Modify Chart Colors
In `volunteer-dashboard.js`:
```javascript
borderColor: '#667eea',        // Line color
backgroundColor: 'rgba(102, 126, 234, 0.1)',  // Fill color
```

---

## 📚 File Reference

| File | Type | Purpose |
|------|------|---------|
| `server.js` | Backend | Added 6 new API endpoints + volunteer DBs |
| `frontend/index.html` | Frontend | Added volunteer dashboard HTML + nav |
| `frontend/js/volunteer-dashboard.js` | Frontend | Core volunteer functionality (NEW) |
| `frontend/js/script.js` | Frontend | Updated login & init for volunteer role |
| `frontend/css/volunteer-dashboard.css` | Frontend | Volunteer dashboard styling (NEW) |

**Total Files Modified**: 5
**New Files Created**: 2 (js + css)
**Lines Added**: ~600+ lines of code

---

## ✨ Key Features Summary

1. **Role-Based Dashboard** - Tailored volunteer interface
2. **User Assignment** - Automatic assignment to volunteers
3. **Intelligent Filtering** - Multi-criteria user filtering
4. **Mood Visualization** - 7-day trend charts
5. **Session Notes** - Document volunteer interactions
6. **Reminders** - Schedule follow-up check-ins
7. **User Transfer** - Reassign with cooldown protection
8. **Analytics** - Track volunteer performance
9. **Messaging** - Integrated chat interface
10. **Responsive Design** - Mobile-friendly layout

---

## 🔗 API Quick Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/volunteer/assigned-users/:id` | GET | List assigned users |
| `/api/volunteer/user/:uid/details/:vid` | GET | Get user detail |
| `/api/volunteer/session-notes` | POST | Save notes |
| `/api/volunteer/reminder` | POST | Schedule reminder |
| `/api/volunteer/transfer-user` | POST | Transfer user |
| `/api/volunteer/analytics/:id` | GET | Get analytics |

---

## ✅ Reuse & Integration Verified

✅ **Existing Components Reused:**
- Chart.js library
- Tailwind CSS classes
- Toast notification system
- Modal pattern
- API fetch pattern
- State management approach
- Navigation system
- Color scheme

✅ **Patterns Followed:**
- Same folder structure
- Same naming conventions
- Same coding style
- Same error handling
- Same data persistence

✅ **No Conflicts:**
- Volunteer routes don't conflict with user/admin
- New DB tables are isolated
- CSS classes are namespaced (`.volunteer-*`)
- JS functions are namespaced (volunteer-specific)

---

**🎉 Implementation Complete! The Volunteer Dashboard is fully integrated and ready to use.**
