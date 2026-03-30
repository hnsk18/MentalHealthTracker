/* MindMitra Frontend - Main Script */

const API_BASE = '/api';
let currentUser = null;
let selectedRole = 'user';
let moodChart = null;
let moodDistributionChart = null;
let roleDistributionChart = null;

// ==================== Initialization ====================

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded');
    
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            showNavbar();
            
            // Restore user based on role
            if (currentUser.role === 'volunteer') {
                navigateTo('volunteer-dashboard');
                initializeVolunteerDashboard(currentUser);
                navigateVolunteerTab('home');
                updateNavigationByRole('volunteer');
            } else if (currentUser.role === 'admin') {
                navigateTo('admin-dashboard');
                loadAdminDashboard();
                updateNavigationByRole('admin');
            } else {
                navigateTo('dashboard');
                loadUserDashboard();
                updateNavigationByRole('user');
            }
        } catch (error) {
            console.error('Error loading saved user:', error);
            navigateTo('home');
        }
    } else {
        navigateTo('home');
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    
    const registerForm = document.getElementById('registerForm');
    if (registerForm) registerForm.addEventListener('submit', handleRegister);
    
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') sendMessage();
        });
    }
});

// ==================== Navigation ====================

function toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu) mobileMenu.classList.toggle('hidden');
}

function navigateTo(page) {
    console.log('Navigating to:', page);
    try {
        document.querySelectorAll('.page-section').forEach(el => {
            el.classList.add('hidden');
            el.style.display = 'none';
        });
        const pageEl = document.getElementById(page);
        if (pageEl) {
            pageEl.classList.remove('hidden');
            pageEl.style.display = 'block';
            if (page === 'dashboard') loadUserDashboard();
            else if (page === 'mood-tracker') loadMoodHistory();
            else if (page === 'profile') loadProfile();
            else if (page === 'volunteer-dashboard') loadVolunteerDashboard();
            else if (page === 'admin-dashboard') loadAdminDashboard();
            else if (page === 'messaging') initChatSection();
        } else {
            console.error('Page element not found:', page);
        }
    } catch (error) {
        console.error('Error navigating to page:', error);
    }
}

function selectRole(role) { selectedRole = role; }

// ==================== Authentication ====================

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const role = document.getElementById('loginRole').value;
    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, role })
        });
        const data = await response.json();
        if (response.ok) {
            currentUser = data;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            showNavbar();
            
            // Redirect based on role
            if (role === 'admin') {
                navigateTo('admin-dashboard');
                loadAdminDashboard();
            } else if (role === 'volunteer') {
                navigateTo('volunteer-dashboard');
                loadVolunteerDashboard();
            } else {
                navigateTo('dashboard');
                loadUserDashboard();
            }
            
            showToast('Login successful!', 'success');
        } else {
            showToast(data.error || 'Login failed', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showToast('Error connecting to server', 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const role = document.getElementById('registerRole').value;
    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, role })
        });
        const data = await response.json();
        if (response.ok) {
            showToast('Registration successful! Please login.', 'success');
            navigateTo('login');
            document.getElementById('loginEmail').value = email;
        } else {
            showToast(data.error || 'Registration failed', 'error');
        }
    } catch (error) {
        console.error('Register error:', error);
        showToast('Error connecting to server', 'error');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    hideNavbar();
    navigateTo('home');
    showToast('Logged out successfully', 'success');
}

function showNavbar() {
    const navbar = document.getElementById('navbar');
    if (navbar) { navbar.classList.remove('hidden'); navbar.style.display = ''; }
}
function hideNavbar() {
    const navbar = document.getElementById('navbar');
    if (navbar) { navbar.classList.add('hidden'); navbar.style.display = 'none'; }
}

// ==================== Dashboard ====================

async function loadUserDashboard() {
    if (!currentUser) return;
    document.getElementById('userNameDisplay').textContent = currentUser.name;
    try {
        const moodResponse = await fetch(`${API_BASE}/mood/${currentUser.user_id}`);
        const moodData = await moodResponse.json();
        if (moodResponse.ok) {
            if (moodData.current_mood && moodData.current_mood.mood !== 'neutral') {
                document.getElementById('moodCard').style.backgroundColor = moodData.current_mood.color;
                document.getElementById('moodEmoji').textContent = moodData.current_mood.emoji;
                document.getElementById('moodStatus').textContent = moodData.current_mood.mood.charAt(0).toUpperCase() + moodData.current_mood.mood.slice(1);
                loadMusicRecommendation(moodData.current_mood.mood);
            }
            document.getElementById('moodCount').textContent = moodData.total_moods;
            setTimeout(() => loadMoodTrendChart(moodData.mood_history), 100);
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

async function loadMusicRecommendation(mood) {
    try {
        const response = await fetch(`${API_BASE}/music-recommendation/${mood}`);
        const data = await response.json();
        if (response.ok) {
            document.getElementById('musicSection').classList.remove('hidden');
            document.getElementById('musicText').textContent = `Genre: ${data.genre} - ${data.description}`;
            document.getElementById('musicLink').href = `https://www.youtube.com/results?search_query=${encodeURIComponent(data.youtube_query)}`;
        }
    } catch (error) {
        console.error('Error loading music recommendation:', error);
    }
}

function loadMoodTrendChart(moodHistory) {
    const canvasElement = document.getElementById('moodChart');
    if (!canvasElement) return;
    if (!moodHistory || moodHistory.length === 0) {
        canvasElement.parentElement.innerHTML = '<p class="text-gray-500 text-center py-8">No mood data yet. Start tracking to see trends!</p>';
        return;
    }
    if (moodChart) { moodChart.destroy(); moodChart = null; }
    const dates = moodHistory.slice(-7).map(m => new Date(m.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const moodScores = { happy: 5, calm: 4, anxious: 2, sad: 1, stressed: 0, neutral: 3 };
    const moodValues = moodHistory.slice(-7).map(m => moodScores[m.mood] || 3);
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;
    try {
        moodChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{ label: 'Mood Level', data: moodValues, borderColor: '#667eea', backgroundColor: 'rgba(102, 126, 234, 0.1)', borderWidth: 3, tension: 0.4, fill: true, pointRadius: 5, pointHoverRadius: 7, pointBackgroundColor: '#667eea', pointBorderColor: '#fff', pointBorderWidth: 2 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: { backgroundColor: 'rgba(0,0,0,0.8)', padding: 12, cornerRadius: 8 }
                },
                scales: {
                    y: { beginAtZero: true, max: 5, ticks: { stepSize: 1, callback: (v) => ['Stressed','Sad','Anxious','Neutral','Calm','Happy'][v] || '', font: { size: 12 }, padding: 8 }, grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false } },
                    x: { grid: { display: false }, ticks: { font: { size: 12 }, padding: 8 } }
                }
            }
        });
    } catch (error) {
        console.error('Error creating chart:', error);
    }
}

// ==================== Quiz ====================

async function loadQuiz() {
    try {
        const response = await fetch(`${API_BASE}/quiz`);
        const data = await response.json();
        if (response.ok) displayQuiz(data.questions);
    } catch (error) {
        showToast('Error loading quiz', 'error');
    }
}

function displayQuiz(questions) {
    let html = '<form id="quizForm" class="space-y-8">';
    questions.forEach((q, index) => {
        html += `<div class="bg-white rounded-2xl shadow-lg p-6"><p class="text-lg font-semibold text-gray-800 mb-4">${index + 1}. ${q.question}</p><div class="space-y-3">`;
        q.options.forEach((option, optionIndex) => {
            html += `<label class="quiz-option cursor-pointer flex items-center p-3 border-2 border-gray-300 rounded-lg hover:border-indigo-600 hover:bg-indigo-50 transition"><input type="radio" name="q${index}" value="${optionIndex}" class="cursor-pointer"><span class="ml-3">${option}</span></label>`;
        });
        html += `</div></div>`;
    });
    html += `<button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition">Submit Quiz</button></form>`;
    document.getElementById('quizContainer').innerHTML = html;
    document.getElementById('quizResult').classList.add('hidden');
    document.getElementById('quizForm').addEventListener('submit', submitQuiz);
}

async function submitQuiz(e) {
    e.preventDefault();
    const answers = [];
    for (let i = 0; ; i++) {
        const checked = document.querySelector(`input[name="q${i}"]:checked`);
        if (!checked) break;
        answers.push(parseInt(checked.value));
    }
    if (answers.length === 0) { showToast('Please answer all questions', 'error'); return; }
    try {
        const response = await fetch(`${API_BASE}/quiz/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.user_id, answers })
        });
        const data = await response.json();
        if (response.ok) {
            const result = data.result;
            document.getElementById('resultStressLevel').textContent = result.stress_level;
            document.getElementById('resultScore').textContent = `${result.score}/20`;
            document.getElementById('resultRecommendation').textContent = result.recommendation;
            document.getElementById('quizContainer').classList.add('hidden');
            document.getElementById('quizResult').classList.remove('hidden');
            showToast('Quiz submitted successfully!', 'success');
        }
    } catch (error) {
        showToast('Error submitting quiz', 'error');
    }
}

// ==================== Mood Tracker ====================

async function selectMoodAndSave(mood) {
    try {
        const response = await fetch(`${API_BASE}/mood`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.user_id, mood })
        });
        const data = await response.json();
        if (response.ok) {
            document.getElementById('moodMessage').classList.remove('hidden');
            setTimeout(() => document.getElementById('moodMessage').classList.add('hidden'), 3000);
            loadMoodHistory();
        }
    } catch (error) {
        showToast('Error saving mood', 'error');
    }
}

async function loadMoodHistory() {
    try {
        const response = await fetch(`${API_BASE}/mood/${currentUser.user_id}`);
        const data = await response.json();
        if (response.ok && data.mood_history && data.mood_history.length > 0) {
            let html = '';
            [...data.mood_history].reverse().forEach(mood => {
                const time = new Date(mood.timestamp).toLocaleString();
                const moodName = mood.mood.charAt(0).toUpperCase() + mood.mood.slice(1);
                html += `<div class="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border-l-4 hover:bg-gray-100 transition" style="border-color: ${mood.color}"><span style="font-size: 2rem">${mood.emoji}</span><div class="flex-1"><p class="font-semibold text-gray-800">${moodName}</p><p class="text-xs text-gray-500">${time}</p></div></div>`;
            });
            document.getElementById('moodHistory').innerHTML = html;
        } else {
            document.getElementById('moodHistory').innerHTML = '<p class="text-gray-500 py-4">No mood history yet. Start tracking!</p>';
        }
    } catch (error) {
        document.getElementById('moodHistory').innerHTML = '<p class="text-red-500">Error loading mood history</p>';
    }
}

// ==================== Nyxie AI Chat ====================

let isJournalingMode = false;

function initChatSection() {
    // Restore chat history from server on section open
    if (!currentUser) return;
    loadChatHistory();
}

async function loadChatHistory() {
    try {
        const response = await fetch(`${API_BASE}/chat/${currentUser.user_id}`);
        const data = await response.json();
        if (response.ok && data.messages && data.messages.length > 0) {
            const container = document.getElementById('messageContainer');
            container.innerHTML = ''; // clear greeting
            data.messages.forEach(m => appendMessage(m.sender === 'user' ? 'user' : 'ai', m.text));
        }
    } catch (e) {
        // silently ignore — greeting bubble already shown
    }
}

async function startNewChatSession() {
    try {
        await fetch(`${API_BASE}/chat/${currentUser.user_id}`, { method: 'DELETE' });
    } catch (e) { /* ignore */ }
    const container = document.getElementById('messageContainer');
    container.innerHTML = `<div class="flex items-start gap-3">
        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">N</div>
        <div class="bg-indigo-50 border border-indigo-100 rounded-2xl rounded-tl-none px-4 py-3 max-w-xs">
            <p class="text-gray-800 text-sm">Hi! I'm Nyxie 💜 A fresh conversation, a fresh start. What's on your mind today?</p>
        </div>
    </div>`;
    showToast('New session started', 'success');
}

function toggleJournalingMode() {
    isJournalingMode = !isJournalingMode;
    const btn = document.getElementById('journalingToggle');
    const badge = document.getElementById('modeBadge');
    if (isJournalingMode) {
        btn.textContent = '📓 Journaling ON';
        btn.classList.remove('bg-gray-100', 'text-gray-600');
        btn.classList.add('bg-purple-100', 'text-purple-700', 'font-semibold');
        if (badge) { badge.textContent = 'Journaling Mode'; badge.classList.remove('hidden'); }
        showToast('Journaling mode on — Nyxie will only reflect, not guide.', 'info');
    } else {
        btn.textContent = '📓 Journaling';
        btn.classList.remove('bg-purple-100', 'text-purple-700', 'font-semibold');
        btn.classList.add('bg-gray-100', 'text-gray-600');
        if (badge) badge.classList.add('hidden');
        showToast('Listening mode restored', 'info');
    }
}

function appendMessage(sender, text, isCrisis = false) {
    const container = document.getElementById('messageContainer');
    const div = document.createElement('div');

    if (sender === 'user') {
        div.className = 'flex justify-end';
        div.innerHTML = `<div class="bg-indigo-600 text-white rounded-2xl rounded-tr-none px-4 py-3 max-w-xs shadow-sm"><p class="text-sm">${escapeHtml(text)}</p></div>`;
    } else if (isCrisis) {
        div.className = 'flex flex-col gap-2';
        div.innerHTML = `
            <div class="flex items-start gap-3">
                <div class="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">N</div>
                <div class="bg-red-50 border border-red-200 rounded-2xl rounded-tl-none px-4 py-3 max-w-sm shadow-sm">
                    <p class="text-red-800 text-sm font-semibold mb-2">💙 ${escapeHtml(text)}</p>
                    <div class="bg-red-100 rounded-xl p-3 text-xs text-red-700">
                        <p class="font-bold mb-1">📞 iCall (TISS) — Free & Confidential</p>
                        <p class="text-lg font-bold">9152987821</p>
                        <p class="mt-1 opacity-80">Trained counselors available Mon–Sat, 8am–10pm</p>
                    </div>
                </div>
            </div>`;
    } else {
        div.className = 'flex items-start gap-3';
        div.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">N</div>
            <div class="bg-indigo-50 border border-indigo-100 rounded-2xl rounded-tl-none px-4 py-3 max-w-xs shadow-sm">
                <p class="text-gray-800 text-sm">${escapeHtml(text)}</p>
            </div>`;
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function setTypingIndicator(show) {
    let indicator = document.getElementById('typingIndicator');
    if (show) {
        if (!indicator) {
            const container = document.getElementById('messageContainer');
            const div = document.createElement('div');
            div.id = 'typingIndicator';
            div.className = 'flex items-start gap-3';
            div.innerHTML = `
                <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">N</div>
                <div class="bg-indigo-50 border border-indigo-100 rounded-2xl rounded-tl-none px-4 py-3">
                    <div class="flex gap-1 items-center h-4">
                        <div class="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style="animation-delay:0ms"></div>
                        <div class="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style="animation-delay:150ms"></div>
                        <div class="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style="animation-delay:300ms"></div>
                    </div>
                </div>`;
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
        }
    } else {
        if (indicator) indicator.remove();
    }
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    if (!message) return;

    input.value = '';
    appendMessage('user', message);
    setTypingIndicator(true);

    try {
        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.user_id, message, isJournalingMode })
        });
        const data = await response.json();
        setTypingIndicator(false);

        if (response.ok && data.ai_response) {
            const isCrisis = data.ai_response.type === 'CRISIS_ESCALATION';
            appendMessage('ai', data.ai_response.text, isCrisis);
        } else {
            appendMessage('ai', "Something went wrong. Please try again.");
        }
    } catch (error) {
        setTypingIndicator(false);
        console.error('Error sending message:', error);
        appendMessage('ai', "I couldn't reach the server. Please check your connection and try again.");
    }
}

// ==================== Profile ====================

async function loadProfile() {
    if (!currentUser) return;
    document.getElementById('profileName').textContent = currentUser.name;
    document.getElementById('profileEmail').textContent = currentUser.email;
    document.getElementById('profileRole').textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
    try {
        const response = await fetch(`${API_BASE}/mood/${currentUser.user_id}`);
        const data = await response.json();
        if (response.ok) {
            const moodCounts = data.mood_counts;
            let summaryHtml = '';
            for (const [mood, count] of Object.entries(moodCounts)) {
                summaryHtml += `<div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg"><span class="font-semibold">${mood.charAt(0).toUpperCase() + mood.slice(1)}</span><span class="bg-indigo-600 text-white rounded-full px-3 py-1 text-sm">${count}</span></div>`;
            }
            document.getElementById('moodSummary').innerHTML = summaryHtml || '<p class="text-gray-500">No mood data yet</p>';
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

// ==================== Volunteer Dashboard ====================

async function loadVolunteerDashboard() {
    try {
        const response = await fetch(`${API_BASE}/volunteer/users-needing-help`);
        const data = await response.json();
        if (response.ok) {
            let html = '';
            if (data.users.length === 0) {
                html = '<p class="text-gray-500 text-lg">No users currently need support.</p>';
            } else {
                data.users.forEach(user => {
                    html += `<div class="bg-white rounded-lg shadow p-6 border-l-4 border-purple-600"><div class="flex justify-between items-start mb-4"><div><p class="text-lg font-semibold text-gray-800">${user.name}</p><p class="text-sm text-gray-600">User ID: ${user.user_id}</p></div><span class="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-semibold">${user.stress_level}</span></div><p class="text-sm text-gray-600 mb-4">Last quiz: ${new Date(user.last_quiz_date).toLocaleDateString()}</p><button onclick="alert('Direct messaging coming soon!')" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition">Message User</button></div>`;
                });
            }
            document.getElementById('volunteerUsersList').innerHTML = html;
        }
    } catch (error) {
        showToast('Error loading users', 'error');
    }
}

// ==================== Admin Dashboard ====================

async function loadAdminDashboard() {
    try {
        const response = await fetch(`${API_BASE}/admin/analytics`);
        const data = await response.json();
        if (response.ok) {
            document.getElementById('adminTotalUsers').textContent = data.total_users;
            document.getElementById('adminMoodEntries').textContent = data.total_mood_entries;
            document.getElementById('adminQuizAttempts').textContent = data.total_quiz_attempts;
            document.getElementById('adminAvgStress').textContent = data.average_stress_level.toFixed(2);
            loadMoodDistributionChart(data.mood_distribution);
            loadRoleDistributionChart(data.role_distribution);
        }
    } catch (error) {
        showToast('Error loading analytics', 'error');
    }
}

function loadMoodDistributionChart(moodDistribution) {
    const ctx = document.getElementById('moodDistributionChart');
    const labels = Object.keys(moodDistribution);
    const values = Object.values(moodDistribution);
    const colors = ['#FFD700','#4169E1','#FF6347','#FF8C00','#90EE90'];
    if (moodDistributionChart) moodDistributionChart.destroy();
    moodDistributionChart = new Chart(ctx, { type: 'doughnut', data: { labels, datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderColor: '#fff', borderWidth: 2 }] }, options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 12 } } } } } });
}

function loadRoleDistributionChart(roleDistribution) {
    const ctx = document.getElementById('roleDistributionChart');
    const labels = Object.keys(roleDistribution);
    const values = Object.values(roleDistribution);
    const colors = ['#667eea','#764ba2','#f44336'];
    if (roleDistributionChart) roleDistributionChart.destroy();
    roleDistributionChart = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Number of Users', data: values, backgroundColor: colors.slice(0, labels.length), borderRadius: 8 }] }, options: { responsive: true, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } } });
}

// ==================== Utilities ====================

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    if (type === 'error') toast.style.backgroundColor = '#f44336';
    else if (type === 'success') toast.style.backgroundColor = '#4caf50';
    else if (type === 'info') toast.style.backgroundColor = '#667eea';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
