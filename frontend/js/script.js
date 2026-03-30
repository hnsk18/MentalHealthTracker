/* MindMitra Frontend - Main Script */

const API_BASE = 'http://localhost:5000/api';
let currentUser = null;
let selectedRole = 'user';
let moodChart = null;
let moodDistributionChart = null;
let roleDistributionChart = null;

// ==================== Initialization ====================

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded');
    
    // Load user from localStorage if exists
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            showNavbar();
            navigateTo('dashboard');
            loadUserDashboard();
        } catch (error) {
            console.error('Error loading saved user:', error);
            navigateTo('home');
        }
    } else {
        navigateTo('home');
    }

    // Attach event listeners with null checks
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
    
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
    if (mobileMenu) {
        mobileMenu.classList.toggle('hidden');
    }
}

function navigateTo(page) {
    console.log('Navigating to:', page);
    
    try {
        // Hide all pages - use both hidden class and display style for compatibility
        document.querySelectorAll('.page-section').forEach(el => {
            el.classList.add('hidden');
            el.style.display = 'none';
        });

        // Show selected page
        const pageEl = document.getElementById(page);
        if (pageEl) {
            pageEl.classList.remove('hidden');
            pageEl.style.display = 'block';
            console.log('Showing page:', page);

            // Load page specific content
            if (page === 'dashboard') {
                loadUserDashboard();
            } else if (page === 'quiz') {
                loadQuiz();
            } else if (page === 'mood-tracker') {
                loadMoodHistory();
            } else if (page === 'profile') {
                loadProfile();
            } else if (page === 'volunteer-dashboard') {
                loadVolunteerDashboard();
            } else if (page === 'admin-dashboard') {
                loadAdminDashboard();
            }
        } else {
            console.error('Page element not found:', page);
        }
    } catch (error) {
        console.error('Error navigating to page:', error);
    }
}

function selectRole(role) {
    selectedRole = role;
}

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
    if (navbar) {
        navbar.classList.remove('hidden');
        navbar.style.display = '';
    }
}

function hideNavbar() {
    const navbar = document.getElementById('navbar');
    if (navbar) {
        navbar.classList.add('hidden');
        navbar.style.display = 'none';
    }
}

// ==================== Dashboard ====================

async function loadUserDashboard() {
    if (!currentUser) return;

    // Update user greeting
    document.getElementById('userNameDisplay').textContent = currentUser.name;

    try {
        // Load moods
        const moodResponse = await fetch(`${API_BASE}/mood/${currentUser.user_id}`);
        const moodData = await moodResponse.json();

        if (moodResponse.ok) {
            // Update mood card
            if (moodData.current_mood && moodData.current_mood.mood !== 'neutral') {
                document.getElementById('moodCard').style.backgroundColor = moodData.current_mood.color;
                document.getElementById('moodEmoji').textContent = moodData.current_mood.emoji;
                document.getElementById('moodStatus').textContent = moodData.current_mood.mood.charAt(0).toUpperCase() + moodData.current_mood.mood.slice(1);
                
                // Load music recommendation
                loadMusicRecommendation(moodData.current_mood.mood);
            }

            // Update mood count
            document.getElementById('moodCount').textContent = moodData.total_moods;

            // Load mood trend chart with delay to ensure DOM is ready
            setTimeout(() => {
                loadMoodTrendChart(moodData.mood_history);
            }, 100);
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
            const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(data.youtube_query)}`;
            document.getElementById('musicLink').href = youtubeUrl;
        }
    } catch (error) {
        console.error('Error loading music recommendation:', error);
    }
}

function loadMoodTrendChart(moodHistory) {
    const canvasElement = document.getElementById('moodChart');
    
    if (!canvasElement) {
        console.error('Chart canvas element not found');
        return;
    }

    if (!moodHistory || moodHistory.length === 0) {
        canvasElement.parentElement.innerHTML = '<p class="text-gray-500 text-center py-8">No mood data yet. Start tracking to see trends!</p>';
        return;
    }

    // Destroy previous chart if exists
    if (moodChart) {
        moodChart.destroy();
        moodChart = null;
    }

    const dates = moodHistory.slice(-7).map(m => {
        const date = new Date(m.timestamp);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const moodValues = moodHistory.slice(-7).map(m => {
        const moodScores = { 'happy': 5, 'calm': 4, 'anxious': 2, 'sad': 1, 'stressed': 0, 'neutral': 3 };
        return moodScores[m.mood] || 3;
    });

    // Get canvas context
    const ctx = canvasElement.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2D context from canvas');
        return;
    }

    try {
        moodChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Mood Level',
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
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: { size: 13, weight: 'bold' },
                        bodyFont: { size: 12 },
                        cornerRadius: 8,
                        usePointStyle: true
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 5,
                        ticks: {
                            stepSize: 1,
                            callback: function(value) {
                                const moodNames = ['Stressed', 'Sad', 'Anxious', 'Neutral', 'Calm', 'Happy'];
                                return moodNames[value] || '';
                            },
                            font: { size: 12 },
                            padding: 8
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)',
                            drawBorder: false
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { 
                            font: { size: 12 },
                            padding: 8
                        }
                    }
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

        if (response.ok) {
            displayQuiz(data.questions);
        }
    } catch (error) {
        console.error('Error loading quiz:', error);
        showToast('Error loading quiz', 'error');
    }
}

function displayQuiz(questions) {
    let html = '<form id="quizForm" class="space-y-8">';

    questions.forEach((q, index) => {
        html += `
            <div class="bg-white rounded-2xl shadow-lg p-6">
                <p class="text-lg font-semibold text-gray-800 mb-4">
                    ${index + 1}. ${q.question}
                </p>
                <div class="space-y-3">
        `;

        q.options.forEach((option, optionIndex) => {
            html += `
                <label class="quiz-option cursor-pointer flex items-center p-3 border-2 border-gray-300 rounded-lg hover:border-indigo-600 hover:bg-indigo-50 transition">
                    <input type="radio" name="q${index}" value="${optionIndex}" class="cursor-pointer">
                    <span class="ml-3">${option}</span>
                </label>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    html += `
        <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition">
            Submit Quiz
        </button>
    </form>
    `;

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

    if (answers.length === 0) {
        showToast('Please answer all questions', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/quiz/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.user_id,
                answers: answers
            })
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
        console.error('Error submitting quiz:', error);
        showToast('Error submitting quiz', 'error');
    }
}

// ==================== Mood Tracker ====================

async function selectMoodAndSave(mood) {
    try {
        const response = await fetch(`${API_BASE}/mood`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.user_id,
                mood: mood
            })
        });

        const data = await response.json();

        if (response.ok) {
            document.getElementById('moodMessage').classList.remove('hidden');
            setTimeout(() => {
                document.getElementById('moodMessage').classList.add('hidden');
            }, 3000);

            loadMoodHistory();
        }
    } catch (error) {
        console.error('Error saving mood:', error);
        showToast('Error saving mood', 'error');
    }
}

async function loadMoodHistory() {
    try {
        const response = await fetch(`${API_BASE}/mood/${currentUser.user_id}`);
        const data = await response.json();

        if (response.ok && data.mood_history && data.mood_history.length > 0) {
            let html = '';
            // Display in reverse order (newest first)
            [...data.mood_history].reverse().forEach(mood => {
                const time = new Date(mood.timestamp).toLocaleString();
                const moodName = mood.mood.charAt(0).toUpperCase() + mood.mood.slice(1);
                html += `
                    <div class="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border-l-4 hover:bg-gray-100 transition" style="border-color: ${mood.color}">
                        <span style="font-size: 2rem">${mood.emoji}</span>
                        <div class="flex-1">
                            <p class="font-semibold text-gray-800">${moodName}</p>
                            <p class="text-xs text-gray-500">${time}</p>
                        </div>
                    </div>
                `;
            });
            document.getElementById('moodHistory').innerHTML = html;
        } else {
            document.getElementById('moodHistory').innerHTML = '<p class="text-gray-500 py-4">No mood history yet. Start tracking!</p>';
        }
    } catch (error) {
        console.error('Error loading mood history:', error);
        document.getElementById('moodHistory').innerHTML = '<p class="text-red-500">Error loading mood history</p>';
    }
}

// ==================== Messaging ====================

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();

    if (!message) return;

    try {
        // Add user message to UI
        const container = document.getElementById('messageContainer');
        const userMsgDiv = document.createElement('div');
        userMsgDiv.className = 'flex justify-end';
        userMsgDiv.innerHTML = `<div class="bg-indigo-600 text-white rounded-lg p-4 max-w-xs">${escapeHtml(message)}</div>`;
        container.appendChild(userMsgDiv);

        // Send to backend
        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.user_id,
                message: message
            })
        });

        const data = await response.json();

        if (response.ok) {
            // Add AI response
            const aiMsgDiv = document.createElement('div');
            aiMsgDiv.className = 'flex justify-start';
            aiMsgDiv.innerHTML = `<div class="bg-blue-100 text-gray-800 rounded-lg p-4 max-w-xs">${escapeHtml(data.ai_response.text)}</div>`;
            container.appendChild(aiMsgDiv);

            // Scroll to bottom
            container.scrollTop = container.scrollHeight;
            input.value = '';
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showToast('Error sending message', 'error');
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
                summaryHtml += `
                    <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span class="font-semibold">${mood.charAt(0).toUpperCase() + mood.slice(1)}</span>
                        <span class="bg-indigo-600 text-white rounded-full px-3 py-1 text-sm">${count}</span>
                    </div>
                `;
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
                    html += `
                        <div class="bg-white rounded-lg shadow p-6 border-l-4 border-purple-600">
                            <div class="flex justify-between items-start mb-4">
                                <div>
                                    <p class="text-lg font-semibold text-gray-800">${user.name}</p>
                                    <p class="text-sm text-gray-600">User ID: ${user.user_id}</p>
                                </div>
                                <span class="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-semibold">
                                    ${user.stress_level}
                                </span>
                            </div>
                            <p class="text-sm text-gray-600 mb-4">Last quiz: ${new Date(user.last_quiz_date).toLocaleDateString()}</p>
                            <button onclick="alert('Chat feature would be available in full version')" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition">
                                Message User
                            </button>
                        </div>
                    `;
                });
            }

            document.getElementById('volunteerUsersList').innerHTML = html;
        }
    } catch (error) {
        console.error('Error loading volunteer dashboard:', error);
        showToast('Error loading users', 'error');
    }
}

// ==================== Admin Dashboard ====================

async function loadAdminDashboard() {
    try {
        const response = await fetch(`${API_BASE}/admin/analytics`);
        const data = await response.json();

        if (response.ok) {
            // Update stats
            document.getElementById('adminTotalUsers').textContent = data.total_users;
            document.getElementById('adminMoodEntries').textContent = data.total_mood_entries;
            document.getElementById('adminQuizAttempts').textContent = data.total_quiz_attempts;
            document.getElementById('adminAvgStress').textContent = data.average_stress_level.toFixed(2);

            // Load charts
            loadMoodDistributionChart(data.mood_distribution);
            loadRoleDistributionChart(data.role_distribution);
        }
    } catch (error) {
        console.error('Error loading admin dashboard:', error);
        showToast('Error loading analytics', 'error');
    }
}

function loadMoodDistributionChart(moodDistribution) {
    const ctx = document.getElementById('moodDistributionChart');
    
    const labels = Object.keys(moodDistribution);
    const values = Object.values(moodDistribution);
    const colors = ['#FFD700', '#4169E1', '#FF6347', '#FF8C00', '#90EE90'];

    if (moodDistributionChart) moodDistributionChart.destroy();

    moodDistributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors.slice(0, labels.length),
                borderColor: '#fff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { size: 12 }
                    }
                }
            }
        }
    });
}

function loadRoleDistributionChart(roleDistribution) {
    const ctx = document.getElementById('roleDistributionChart');
    
    const labels = Object.keys(roleDistribution);
    const values = Object.values(roleDistribution);
    const colors = ['#667eea', '#764ba2', '#f44336'];

    if (roleDistributionChart) roleDistributionChart.destroy();

    roleDistributionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Number of Users',
                data: values,
                backgroundColor: colors.slice(0, labels.length),
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            indexAxis: 'y',
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

// ==================== Utilities ====================

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    
    if (type === 'error') {
        toast.style.backgroundColor = '#f44336';
    } else if (type === 'success') {
        toast.style.backgroundColor = '#4caf50';
    }
    
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
