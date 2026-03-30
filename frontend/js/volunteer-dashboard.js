// ============================================
// VOLUNTEER DASHBOARD FUNCTIONALITY
// ============================================

const API_BASE = '/api';
let currentVolunteerUser = null;
let selectedUserDetail = null;
let volMoodTrendChart = null;
let volSessionsChart = null;
let volMoodTrendsChart = null;

// ==================== Navigation ====================

/**
 * Navigate between volunteer dashboard tabs
 */
function navigateVolunteerTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.volunteer-tab').forEach(tab => {
        tab.classList.add('hidden');
    });

    // Show selected tab
    const selectedTab = document.getElementById(`volunteer-${tabName}`);
    if (selectedTab) {
        selectedTab.classList.remove('hidden');

        // Load tab-specific data
        if (tabName === 'home') {
            loadVolunteerDashboardHome();
        } else if (tabName === 'users') {
            loadAssignedUsers();
        } else if (tabName === 'analytics') {
            loadVolunteerAnalytics();
        }
    }
}

/**
 * Update navigation based on user role
 */
function updateNavigationByRole(role) {
    const userNav = document.getElementById('userNavigation');
    const volunteerNav = document.getElementById('volunteerNavigation');
    const adminNav = document.getElementById('adminNavigation');
    
    const userMobileNav = document.getElementById('userMobileNav');
    const volunteerMobileNav = document.getElementById('volunteerMobileNav');
    const adminMobileNav = document.getElementById('adminMobileNav');

    if (role === 'volunteer') {
        userNav?.classList.add('hidden');
        volunteerNav?.classList.remove('hidden');
        adminNav?.classList.add('hidden');
        
        userMobileNav?.classList.add('hidden');
        volunteerMobileNav?.classList.remove('hidden');
        adminMobileNav?.classList.add('hidden');
    } else if (role === 'admin') {
        userNav?.classList.add('hidden');
        volunteerNav?.classList.add('hidden');
        adminNav?.classList.remove('hidden');
        
        userMobileNav?.classList.add('hidden');
        volunteerMobileNav?.classList.add('hidden');
        adminMobileNav?.classList.remove('hidden');
    } else {
        userNav?.classList.remove('hidden');
        volunteerNav?.classList.add('hidden');
        adminNav?.classList.add('hidden');
        
        userMobileNav?.classList.remove('hidden');
        volunteerMobileNav?.classList.add('hidden');
        adminMobileNav?.classList.add('hidden');
    }
}

// ==================== Dashboard Home ====================

/**
 * Load volunteer dashboard home with summary cards
 */
async function loadVolunteerDashboardHome() {
    try {
        if (!currentVolunteerUser) return;

        const response = await fetch(`${API_BASE}/volunteer/analytics/${currentVolunteerUser.user_id}`);
        const analytics = await response.json();

        // Update summary cards
        document.getElementById('volAssignedCount').textContent = analytics.assigned_users_count;
        document.getElementById('volActiveChats').textContent = Object.keys(analytics.sessions_by_week).length;
        document.getElementById('volSessionsCompleted').textContent = analytics.total_sessions;
        document.getElementById('volAvgResponse').textContent = analytics.average_response_time_minutes;

        // Load quick stats
        loadVolunteerQuickStats();
    } catch (error) {
        console.error('Error loading volunteer dashboard:', error);
        showToast('Error loading dashboard', 'error');
    }
}

/**
 * Load quick statistics overview
 */
async function loadVolunteerQuickStats() {
    try {
        if (!currentVolunteerUser) return;

        const response = await fetch(`${API_BASE}/volunteer/assigned-users/${currentVolunteerUser.user_id}`);
        const data = await response.json();

        const statsDiv = document.getElementById('volunteerQuickStats');
        statsDiv.innerHTML = '';

        if (data.assigned_users.length === 0) {
            statsDiv.innerHTML = '<p class="text-gray-500">No assigned users yet</p>';
            return;
        }

        // Count high-risk users
        const highRiskCount = data.assigned_users.filter(u => u.risk_level === 'High').length;
        const mediumRiskCount = data.assigned_users.filter(u => u.risk_level === 'Medium').length;
        const totalInteractions = data.assigned_users.reduce((sum, u) => sum + (u.total_moods || 0), 0);

        statsDiv.innerHTML = `
            <div class="quick-stat-item high">
                <span class="quick-stat-label">⚠️ High Risk Users</span>
                <span class="quick-stat-value">${highRiskCount}</span>
            </div>
            <div class="quick-stat-item medium">
                <span class="quick-stat-label">⚡ Medium Risk Users</span>
                <span class="quick-stat-value">${mediumRiskCount}</span>
            </div>
            <div class="quick-stat-item">
                <span class="quick-stat-label">📊 Total Mood Entries</span>
                <span class="quick-stat-value">${totalInteractions}</span>
            </div>
            <div class="quick-stat-item">
                <span class="quick-stat-label">🤝 Active Cases</span>
                <span class="quick-stat-value">${data.assigned_users.length}</span>
            </div>
        `;
    } catch (error) {
        console.error('Error loading quick stats:', error);
    }
}

// ==================== Assigned Users ====================

/**
 * Load assigned users list
 */
async function loadAssignedUsers() {
    try {
        if (!currentVolunteerUser) return;

        const response = await fetch(`${API_BASE}/volunteer/assigned-users/${currentVolunteerUser.user_id}`);
        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || 'Error loading users', 'error');
            return;
        }

        displayAssignedUsers(data.assigned_users);
    } catch (error) {
        console.error('Error loading assigned users:', error);
        showToast('Error loading assigned users', 'error');
    }
}

/**
 * Display assigned users with filtering
 */
function displayAssignedUsers(users) {
    const listDiv = document.getElementById('volunteerUsersList');
    listDiv.innerHTML = '';

    if (users.length === 0) {
        listDiv.innerHTML = '<p class="text-gray-500 text-center py-8">No assigned users</p>';
        return;
    }

    // Store original users for filtering
    window.allAssignedUsers = users;

    users.forEach(user => {
        const card = createUserCard(user);
        listDiv.appendChild(card);
    });
}

/**
 * Create user card element
 */
function createUserCard(user) {
    const card = document.createElement('div');
    card.className = `volunteer-user-card ${user.risk_level.toLowerCase()}-risk`;

    const moodColor = getMoodColor(user.current_mood);
    const lastActiveDate = new Date(user.last_active);
    const timeSince = getTimeSinceString(lastActiveDate);

    card.innerHTML = `
        <div class="volunteer-user-card-header">
            <span class="volunteer-user-id">${user.anonymous_id}</span>
            <span class="risk-badge ${user.risk_level.toLowerCase()}">${user.risk_level}</span>
        </div>
        <div class="mood-display">
            <span class="mood-emoji">${user.mood_emoji}</span>
            <span class="mood-label">${capitalizeFirstLetter(user.current_mood)}</span>
        </div>
        <div class="last-active-text">Last active: ${timeSince}</div>
        <button class="view-user-btn" onclick="viewUserDetail(${user.user_id})">
            View Details →
        </button>
    `;

    return card;
}

/**
 * Apply filters to assigned users
 */
function applyVolunteerFilters() {
    const moodFilter = document.getElementById('volMoodFilter').value;
    const riskFilter = document.getElementById('volRiskFilter').value;
    const activityFilter = document.getElementById('volActivityFilter').value;

    if (!window.allAssignedUsers) return;

    let filtered = window.allAssignedUsers;

    // Filter by mood
    if (moodFilter) {
        filtered = filtered.filter(u => u.current_mood === moodFilter);
    }

    // Filter by risk level
    if (riskFilter) {
        filtered = filtered.filter(u => u.risk_level === riskFilter);
    }

    // Filter by activity
    if (activityFilter) {
        const now = new Date();
        filtered = filtered.filter(u => {
            const lastActive = new Date(u.last_active);
            const hoursAgo = (now - lastActive) / (1000 * 60 * 60);

            if (activityFilter === 'recent') return hoursAgo < 24;
            if (activityFilter === 'week') return hoursAgo < 168;
            if (activityFilter === 'old') return hoursAgo >= 168;
            return true;
        });
    }

    displayAssignedUsers(filtered);
}

// ==================== User Detail View ====================

/**
 * View user details
 */
async function viewUserDetail(userId) {
    try {
        if (!currentVolunteerUser) return;

        const response = await fetch(`${API_BASE}/volunteer/user/${userId}/details/${currentVolunteerUser.user_id}`);
        const userDetail = await response.json();

        if (!response.ok) {
            showToast(userDetail.error || 'Error loading user details', 'error');
            return;
        }

        selectedUserDetail = userDetail;
        displayUserDetail(userDetail);
        navigateVolunteerTab('detail');
    } catch (error) {
        console.error('Error loading user details:', error);
        showToast('Error loading user details', 'error');
    }
}

/**
 * Display user detail information
 */
function displayUserDetail(userDetail) {
    // Update title
    document.getElementById('volDetailTitle').textContent = `${userDetail.anonymous_id} - User Details`;

    // Load 7-day mood trend chart
    loadMoodTrendChartVolunteer(userDetail.mood_trend_7days);

    // Display chat preview
    displayVolunteerChatPreview(userDetail.chat_preview);

    // Display tags
    displayVolunteerUserTags(userDetail.tags);

    // Load session notes
    document.getElementById('volSessionNotesInput').value = userDetail.session_notes || '';

    // Update user detail reference
    selectedUserDetail = userDetail;
}

/**
 * Load 7-day mood trend chart for user
 */
function loadMoodTrendChartVolunteer(moodHistory) {
    const canvasElement = document.getElementById('volMoodTrendChart');

    if (volMoodTrendChart) {
        volMoodTrendChart.destroy();
        volMoodTrendChart = null;
    }

    if (moodHistory.length === 0) {
        canvasElement.parentElement.innerHTML = '<p class="text-gray-500 text-center py-8">No mood data available</p>';
        return;
    }

    // Prepare data
    const dates = moodHistory.map(m => new Date(m.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const moodValues = moodHistory.map(m => getMoodValue(m.mood));
    const moodLabels = moodHistory.map(m => capitalizeFirstLetter(m.mood));

    const ctx = canvasElement.getContext('2d');
    volMoodTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Mood Trend',
                data: moodValues,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointBackgroundColor: '#667eea',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 5,
                    ticks: {
                        callback: function(value) {
                            const names = ['Stressed', 'Sad', 'Anxious', 'Neutral', 'Calm', 'Happy'];
                            return names[value] || '';
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Mood: ${moodLabels[context.dataIndex]}`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Display chat preview
 */
function displayVolunteerChatPreview(messages) {
    const previewDiv = document.getElementById('volChatPreview');
    previewDiv.innerHTML = '';

    if (messages.length === 0) {
        previewDiv.innerHTML = '<p class="text-gray-500 text-center py-4">No messages yet</p>';
        return;
    }

    messages.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `volunteer-message ${msg.sender}`;
        msgDiv.innerHTML = `
            <div class="message-bubble">${escapeHtml(msg.text)}</div>
        `;
        previewDiv.appendChild(msgDiv);
    });
}

/**
 * Display user tags
 */
function displayVolunteerUserTags(tags) {
    const tagsDiv = document.getElementById('volUserTags');
    tagsDiv.innerHTML = '';

    if (tags.length === 0) {
        tagsDiv.innerHTML = '<span class="text-gray-500">No mood patterns yet</span>';
        return;
    }

    tags.forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.className = `tag ${tag.toLowerCase()}`;
        tagEl.textContent = capitalizeFirstLetter(tag);
        tagsDiv.appendChild(tagEl);
    });
}

/**
 * Save session notes
 */
async function saveVolunteerSessionNotes() {
    try {
        if (!selectedUserDetail || !currentVolunteerUser) return;

        const notes = document.getElementById('volSessionNotesInput').value;

        const response = await fetch(`${API_BASE}/volunteer/session-notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: selectedUserDetail.user_id,
                volunteer_id: currentVolunteerUser.user_id,
                notes
            })
        });

        if (response.ok) {
            showToast('Session notes saved successfully', 'success');
        } else {
            showToast('Error saving notes', 'error');
        }
    } catch (error) {
        console.error('Error saving notes:', error);
        showToast('Error saving notes', 'error');
    }
}

/**
 * Schedule check-in reminder
 */
async function scheduleVolunteerReminder() {
    try {
        if (!selectedUserDetail || !currentVolunteerUser) return;

        const reminderTime = document.getElementById('volReminderTime').value;

        if (!reminderTime) {
            showToast('Please select a time for the reminder', 'error');
            return;
        }

        const response = await fetch(`${API_BASE}/volunteer/reminder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                volunteer_id: currentVolunteerUser.user_id,
                user_id: selectedUserDetail.user_id,
                reminder_time: reminderTime
            })
        });

        if (response.ok) {
            showToast('Reminder scheduled successfully', 'success');
            document.getElementById('volReminderTime').value = '';
        } else {
            showToast('Error scheduling reminder', 'error');
        }
    } catch (error) {
        console.error('Error scheduling reminder:', error);
        showToast('Error scheduling reminder', 'error');
    }
}

/**
 * Open transfer modal
 */
function openTransferModal() {
    document.getElementById('transferUserModal').classList.remove('hidden');
}

/**
 * Close transfer modal
 */
function closeTransferModal() {
    document.getElementById('transferUserModal').classList.add('hidden');
}

/**
 * Confirm user transfer
 */
async function confirmTransferUser() {
    try {
        if (!selectedUserDetail || !currentVolunteerUser) return;

        const reason = document.getElementById('modalTransferReason').value;

        if (!reason) {
            showToast('Please select a reason for transfer', 'error');
            return;
        }

        // For now, simulate transferring to a different volunteer
        const toVolunteerId = currentVolunteerUser.user_id === 100 ? 101 : 100;

        const response = await fetch(`${API_BASE}/volunteer/transfer-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: selectedUserDetail.user_id,
                from_volunteer_id: currentVolunteerUser.user_id,
                to_volunteer_id: toVolunteerId,
                reason
            })
        });

        const data = await response.json();

        if (response.ok) {
            showToast('User transferred successfully. 7-day cooldown activated.', 'success');
            closeTransferModal();
            navigateVolunteerTab('users');
        } else {
            showToast(data.error || 'Error transferring user', 'error');
        }
    } catch (error) {
        console.error('Error transferring user:', error);
        showToast('Error transferring user', 'error');
    }
}

// ==================== Chat View ====================

/**
 * Open full volunteer chat view
 */
function openVolunteerChat() {
    if (!selectedUserDetail) return;

    document.getElementById('volChatTitle').textContent = `Chat with ${selectedUserDetail.anonymous_id}`;
    loadVolunteerChatMessages();
    navigateVolunteerTab('chat');
}

/**
 * Load full chat messages
 */
async function loadVolunteerChatMessages() {
    try {
        if (!selectedUserDetail) return;

        const response = await fetch(`${API_BASE}/chat/${selectedUserDetail.user_id}`);
        const data = await response.json();

        displayVolunteerChatMessages(data.messages || []);
    } catch (error) {
        console.error('Error loading chat messages:', error);
    }
}

/**
 * Display full chat messages
 */
function displayVolunteerChatMessages(messages) {
    const messagesDiv = document.getElementById('volChatMessages');
    messagesDiv.innerHTML = '';

    messages.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `volunteer-message ${msg.sender}`;
        msgDiv.innerHTML = `
            <div class="message-bubble">${escapeHtml(msg.text)}</div>
            <div class="message-timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>
        `;
        messagesDiv.appendChild(msgDiv);
    });

    // Scroll to bottom
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

/**
 * Send volunteer message
 */
async function sendVolunteerMessage() {
    try {
        if (!selectedUserDetail || !currentVolunteerUser) return;

        const messageInput = document.getElementById('volChatInput');
        const message = messageInput.value.trim();

        if (!message) return;

        // Add message to UI optimistically
        const messagesDiv = document.getElementById('volChatMessages');
        const msgDiv = document.createElement('div');
        msgDiv.className = 'volunteer-message user';
        msgDiv.innerHTML = `
            <div class="message-bubble">${escapeHtml(message)}</div>
        `;
        messagesDiv.appendChild(msgDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        messageInput.value = '';

        // Send to server (in real app, this would be bidirectional chat)
        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: selectedUserDetail.user_id,
                message
            })
        });

        if (response.ok) {
            // Load latest messages
            loadVolunteerChatMessages();
        }
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

// ==================== Analytics ====================

/**
 * Load volunteer analytics
 */
async function loadVolunteerAnalytics() {
    try {
        if (!currentVolunteerUser) return;

        const response = await fetch(`${API_BASE}/volunteer/analytics/${currentVolunteerUser.user_id}`);
        const analytics = await response.json();

        // Load sessions chart
        loadSessionsChart(analytics.sessions_by_week);

        // Load mood trends chart
        loadMoodTrendsChart(analytics.mood_trends);
    } catch (error) {
        console.error('Error loading analytics:', error);
        showToast('Error loading analytics', 'error');
    }
}

/**
 * Load sessions per week chart
 */
function loadSessionsChart(sessionsData) {
    const canvasElement = document.getElementById('volSessionsChart');

    if (volSessionsChart) {
        volSessionsChart.destroy();
        volSessionsChart = null;
    }

    const weeks = Object.keys(sessionsData);
    const counts = Object.values(sessionsData);

    const ctx = canvasElement.getContext('2d');
    volSessionsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: weeks,
            datasets: [{
                label: 'Sessions',
                data: counts,
                backgroundColor: 'rgba(102, 126, 234, 0.6)',
                borderColor: '#667eea',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

/**
 * Load mood trends chart
 */
function loadMoodTrendsChart(moodData) {
    const canvasElement = document.getElementById('volMoodTrendsChart');

    if (volMoodTrendsChart) {
        volMoodTrendsChart.destroy();
        volMoodTrendsChart = null;
    }

    const moodNames = Object.keys(moodData);
    const moodCounts = Object.values(moodData);
    const moodColors = moodNames.map(mood => getMoodColor(mood));

    const ctx = canvasElement.getContext('2d');
    volMoodTrendsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: moodNames.map(m => capitalizeFirstLetter(m)),
            datasets: [{
                data: moodCounts,
                backgroundColor: moodColors,
                borderColor: 'white',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ' + context.parsed + ' entries';
                        }
                    }
                }
            }
        }
    });
}

// ==================== Utility Functions ====================

/**
 * Get mood color
 */
function getMoodColor(mood) {
    const colors = {
        'happy': '#FFD700',
        'sad': '#4169E1',
        'stressed': '#FF6347',
        'anxious': '#FF8C00',
        'calm': '#90EE90'
    };
    return colors[mood] || '#808080';
}

/**
 * Get mood value (1-5 scale)
 */
function getMoodValue(mood) {
    const values = {
        'stressed': 0,
        'sad': 1,
        'anxious': 2,
        'neutral': 3,
        'calm': 4,
        'happy': 5
    };
    return values[mood] || 3;
}

/**
 * Get time since string (e.g., "2 hours ago")
 */
function getTimeSinceString(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
}

/**
 * Capitalize first letter
 */
function capitalizeFirstLetter(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Escape HTML for XSS prevention
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Show toast notification
 */
function showVolunteerToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `volunteer-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ==================== Integration with Main Script ====================

/**
 * Initialize volunteer dashboard when volunteer logs in
 */
function initializeVolunteerDashboard(user) {
    currentVolunteerUser = user;
    // Simulate volunteer ID assignment
    if (!currentVolunteerUser.user_id) {
        currentVolunteerUser.user_id = user.id || (parseInt(user.email.split('@')[0]) % 3) + 100;
    }
    updateNavigationByRole('volunteer');
    loadVolunteerDashboardHome();
}
