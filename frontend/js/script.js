/* MindMitra Frontend - Main Script */

const API_BASE = '/api';
let currentUser = null;
let selectedRole = 'user';
let moodChart = null;
let moodDistributionChart = null;
let roleDistributionChart = null;
let invalidSessionHandled = false;
let communityPosts = [];
let latestUsersNeedingHelp = [];
let volunteerHandlingUsers = [];
let selectedVolunteerSecureUserId = null;
let userAssignedVolunteerId = null;

// ==================== Initialization ====================

document.addEventListener('DOMContentLoaded', async function() {
    console.log('DOM Content Loaded');
    
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            const sessionIsValid = await validateCurrentUserSession();
            if (sessionIsValid) {
                showNavbar();
                navigateTo(getDefaultLandingPage());
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

    const userVolunteerMessageInput = document.getElementById('userVolunteerMessageInput');
    if (userVolunteerMessageInput) {
        userVolunteerMessageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') sendUserVolunteerMessage();
        });
    }

    const volunteerSecureChatInput = document.getElementById('volunteerSecureChatInput');
    if (volunteerSecureChatInput) {
        volunteerSecureChatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') sendVolunteerSecureMessage();
        });
    }

    const feelingInput = document.getElementById('feelingPostInput');
    if (feelingInput) {
        feelingInput.addEventListener('input', function() {
            const counter = document.getElementById('feelingCharCount');
            if (counter) counter.textContent = `${this.value.length} / 300`;
        });
    }

    const volunteerPostInput = document.getElementById('volunteerPostInput');
    if (volunteerPostInput) {
        volunteerPostInput.addEventListener('input', function() {
            const counter = document.getElementById('volunteerPostCharCount');
            if (counter) counter.textContent = `${this.value.length} / 280`;
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
        if (currentUser && !canAccessPage(page)) {
            const fallbackPage = getDefaultLandingPage();
            if (page !== fallbackPage) {
                showToast('This page is not available for your role.', 'info');
            }
            page = fallbackPage;
        }

        document.querySelectorAll('.page-section').forEach(el => {
            el.classList.add('hidden');
            el.style.display = 'none';
        });
        const pageEl = document.getElementById(page);
        if (pageEl) {
            pageEl.classList.remove('hidden');
            pageEl.style.display = 'block';
            if (page === 'dashboard') loadCommunityHome();
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

function getDefaultLandingPage() {
    if (!currentUser || !currentUser.role) return 'home';
    if (currentUser.role === 'volunteer') return 'volunteer-dashboard';
    if (currentUser.role === 'admin') return 'admin-dashboard';
    return 'dashboard';
}

function canAccessPage(page) {
    if (!currentUser || !currentUser.role) {
        return ['home', 'login', 'register'].includes(page);
    }

    const rolePages = {
        user: ['dashboard', 'quiz', 'mood-tracker', 'messaging', 'profile', 'breathing', 'journal', 'home', 'login', 'register'],
        volunteer: ['volunteer-dashboard', 'messaging', 'home', 'login', 'register'],
        admin: ['admin-dashboard', 'home', 'login', 'register']
    };

    const allowed = rolePages[currentUser.role] || ['home'];
    return allowed.includes(page);
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
            if (role === 'admin') { navigateTo('admin-dashboard'); loadAdminDashboard(); }
            else if (role === 'volunteer') { navigateTo('volunteer-dashboard'); loadVolunteerDashboard(); }
            else { navigateTo('dashboard'); loadCommunityHome(); }
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

function handleInvalidSession(message = 'Your session expired after a server restart. Please login again.') {
    if (invalidSessionHandled) return;
    invalidSessionHandled = true;
    currentUser = null;
    localStorage.removeItem('currentUser');
    hideNavbar();
    navigateTo('login');
    showToast(message, 'info');
}

async function validateCurrentUserSession() {
    if (!currentUser || !currentUser.user_id) return false;
    try {
        const response = await fetch(`${API_BASE}/user/${currentUser.user_id}`);
        const data = await response.json();
        if (response.ok) return true;
        if (response.status === 404 && data && data.error === 'User not found') {
            handleInvalidSession();
            return false;
        }
        return true;
    } catch (error) {
        // Don't force logout on transient network/server issues.
        return true;
    }
}

function showNavbar() {
    const navbar = document.getElementById('navbar');
    if (navbar) {
        navbar.classList.remove('hidden');
        navbar.style.display = '';
    }
    updateNavbarForRole();
}
function hideNavbar() {
    const navbar = document.getElementById('navbar');
    if (navbar) { navbar.classList.add('hidden'); navbar.style.display = 'none'; }
}

function toggleNavLink(id, isVisible) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = isVisible ? '' : 'none';
}

function updateNavbarForRole() {
    const role = currentUser ? currentUser.role : null;

    const showUser = role === 'user';
    const showVolunteer = role === 'volunteer';
    const showAdmin = role === 'admin';

    toggleNavLink('navHome', showUser);
    toggleNavLink('mobileNavHome', showUser);
    toggleNavLink('navQuiz', showUser);
    toggleNavLink('mobileNavQuiz', showUser);
    toggleNavLink('navMood', showUser);
    toggleNavLink('mobileNavMood', showUser);
    toggleNavLink('navProfile', showUser);
    toggleNavLink('mobileNavProfile', showUser);

    // Chat remains visible for user and volunteer, hidden for admin.
    toggleNavLink('navChat', showUser || showVolunteer);
    toggleNavLink('mobileNavChat', showUser || showVolunteer);

    if (showVolunteer) {
        const navHome = document.getElementById('navHome');
        const mobileNavHome = document.getElementById('mobileNavHome');
        if (navHome) {
            navHome.style.display = '';
            navHome.textContent = '🤝 Volunteer Dashboard';
            navHome.setAttribute('onclick', "navigateTo('volunteer-dashboard')");
        }
        if (mobileNavHome) {
            mobileNavHome.style.display = '';
            mobileNavHome.textContent = '🤝 Volunteer Dashboard';
            mobileNavHome.setAttribute('onclick', "navigateTo('volunteer-dashboard')");
        }
    } else if (showAdmin) {
        const navHome = document.getElementById('navHome');
        const mobileNavHome = document.getElementById('mobileNavHome');
        if (navHome) {
            navHome.style.display = '';
            navHome.textContent = '⚙️ Admin Dashboard';
            navHome.setAttribute('onclick', "navigateTo('admin-dashboard')");
        }
        if (mobileNavHome) {
            mobileNavHome.style.display = '';
            mobileNavHome.textContent = '⚙️ Admin Dashboard';
            mobileNavHome.setAttribute('onclick', "navigateTo('admin-dashboard')");
        }
    } else {
        const navHome = document.getElementById('navHome');
        const mobileNavHome = document.getElementById('mobileNavHome');
        if (navHome) {
            navHome.style.display = '';
            navHome.textContent = '🏠 Home';
            navHome.setAttribute('onclick', "navigateTo('dashboard')");
        }
        if (mobileNavHome) {
            mobileNavHome.style.display = '';
            mobileNavHome.textContent = '🏠 Home';
            mobileNavHome.setAttribute('onclick', "navigateTo('dashboard')");
        }
    }
}

// ==================== Community Home ====================

const PET_PREFIXES = ['Sunny', 'Misty', 'Luna', 'Pebble', 'Coco', 'Maple', 'Breezy', 'Velvet', 'Nova', 'Poppy'];
const PET_ANIMALS = ['Fox', 'Otter', 'Panda', 'Sparrow', 'Koala', 'Dolphin', 'Robin', 'Kitten', 'Bunny', 'Cub'];

function getCurrentPetName() {
    if (!currentUser || !currentUser.user_id) return 'Pet Friend';
    const storageKey = `petName:${currentUser.user_id}`;
    let petName = localStorage.getItem(storageKey);
    if (!petName) {
        const prefix = PET_PREFIXES[currentUser.user_id % PET_PREFIXES.length];
        const animal = PET_ANIMALS[(currentUser.user_id * 3) % PET_ANIMALS.length];
        petName = `${prefix} ${animal}`;
        localStorage.setItem(storageKey, petName);
    }
    return petName;
}

function loadCommunityPosts() {
    try {
        communityPosts = JSON.parse(localStorage.getItem('communityPosts') || '[]');
    } catch (error) {
        communityPosts = [];
    }
}

function saveCommunityPosts() {
    localStorage.setItem('communityPosts', JSON.stringify(communityPosts));
}

function formatPostTime(isoString) {
    return new Date(isoString).toLocaleString();
}

function loadCommunityHome() {
    if (!currentUser) return;

    const petNameEl = document.getElementById('petNameDisplay');
    if (petNameEl) petNameEl.textContent = getCurrentPetName();

    loadCommunityPosts();
    renderCommunityFeed();
    syncVolunteerRequestStatus();
}

function submitFeelingPost() {
    const input = document.getElementById('feelingPostInput');
    if (!input || !currentUser) return;

    const text = input.value.trim();
    if (!text) {
        showToast('Please write your feeling before posting.', 'error');
        return;
    }

    const post = {
        id: Date.now(),
        userId: currentUser.user_id,
        petName: getCurrentPetName(),
        text,
        timestamp: new Date().toISOString(),
        comments: []
    };

    communityPosts.unshift(post);
    if (communityPosts.length > 100) communityPosts = communityPosts.slice(0, 100);
    saveCommunityPosts();

    input.value = '';
    const counter = document.getElementById('feelingCharCount');
    if (counter) counter.textContent = '0 / 300';

    renderCommunityFeed();
    showToast('Your feeling was posted anonymously.', 'success');
}

function addCommentToPost(postId) {
    const commentInput = document.getElementById(`commentInput-${postId}`);
    if (!commentInput || !currentUser) return;

    const text = commentInput.value.trim();
    if (!text) {
        showToast('Comment cannot be empty.', 'error');
        return;
    }

    const post = communityPosts.find(p => p.id === postId);
    if (!post) return;

    post.comments.push({
        id: Date.now(),
        userId: currentUser.user_id,
        petName: getCurrentPetName(),
        text,
        timestamp: new Date().toISOString()
    });

    saveCommunityPosts();
    commentInput.value = '';
    renderCommunityFeed();
}

function seedCommunityPosts() {
    if (communityPosts.length > 0) {
        showToast('Sample posts are only added when feed is empty.', 'info');
        return;
    }

    communityPosts = [
        {
            id: Date.now() - 2000,
            userId: 9001,
            petName: 'Luna Sparrow',
            text: 'Today felt heavy, but I still finished my tasks. Trying to be kind to myself.',
            timestamp: new Date(Date.now() - 3600 * 1000).toISOString(),
            comments: [
                {
                    id: Date.now() - 1500,
                    userId: 9002,
                    petName: 'Misty Otter',
                    text: 'That is strong. Small wins count a lot.',
                    timestamp: new Date(Date.now() - 3200 * 1000).toISOString()
                }
            ]
        },
        {
            id: Date.now() - 1000,
            userId: 9003,
            petName: 'Coco Fox',
            text: 'I finally slept 7 hours. Mood already feels more stable.',
            timestamp: new Date(Date.now() - 1800 * 1000).toISOString(),
            comments: []
        }
    ];

    saveCommunityPosts();
    renderCommunityFeed();
}

function renderCommunityFeed() {
    const container = document.getElementById('communityFeed');
    if (!container) return;

    if (!communityPosts.length) {
        container.innerHTML = '<p class="text-gray-500">No feelings posted yet. Be the first to share.</p>';
        return;
    }

    container.innerHTML = communityPosts.map(post => {
        const commentsHtml = post.comments.length
            ? post.comments.map(comment => `
                <div class="bg-indigo-50 rounded-lg px-3 py-2">
                    <p class="text-sm text-gray-700"><span class="font-semibold text-indigo-700">${escapeHtml(comment.petName)}</span>: ${escapeHtml(comment.text)}</p>
                    <p class="text-xs text-gray-500 mt-1">${formatPostTime(comment.timestamp)}</p>
                </div>
            `).join('')
            : '<p class="text-sm text-gray-500">No comments yet. Be supportive.</p>';

        return `
            <div class="border border-gray-200 rounded-2xl p-5 bg-gradient-to-br from-white to-indigo-50/40">
                <div class="flex justify-between items-start gap-4 mb-3">
                    <div>
                        <p class="font-bold text-indigo-700">${escapeHtml(post.petName)}</p>
                        <p class="text-xs text-gray-500">${formatPostTime(post.timestamp)}</p>
                    </div>
                    <span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">Anonymous</span>
                </div>
                <p class="text-gray-800 leading-relaxed mb-4">${escapeHtml(post.text)}</p>
                <div class="space-y-2 mb-3">${commentsHtml}</div>
                <div class="flex gap-2">
                    <input id="commentInput-${post.id}" type="text" maxlength="160" placeholder="Write a kind comment..." class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-600" />
                    <button onclick="addCommentToPost(${post.id})" class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">Comment</button>
                </div>
            </div>
        `;
    }).join('');
}

async function requestVolunteerSupport(prefilledNote = null) {
    if (!currentUser) return;

    let note = '';
    if (typeof prefilledNote === 'string') {
        note = prefilledNote;
    } else {
        const noteInput = document.getElementById('volunteerRequestInput');
        note = noteInput ? noteInput.value.trim() : '';
    }

    try {
        const response = await fetch(`${API_BASE}/volunteer/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.user_id, note })
        });
        const data = await response.json();

        if (response.status === 404 && data && data.error === 'User not found') {
            handleInvalidSession();
            return;
        }

        if (response.status === 404) {
            showToast('Volunteer request API not found. Restart backend server and try again.', 'error');
            return;
        }

        if (response.ok) {
            const noteInput = document.getElementById('volunteerRequestInput');
            if (noteInput) noteInput.value = '';
            if (data.already_requested) {
                showToast('Your volunteer request is already open.', 'info');
            } else {
                showToast('Volunteer request sent successfully.', 'success');
            }
            setVolunteerRequestUIState(true, data.request || { requested_at: new Date().toISOString() });
        } else {
            showToast(data.error || 'Could not submit volunteer request.', 'error');
        }
    } catch (error) {
        showToast('Error sending volunteer request.', 'error');
    }
}

function setVolunteerRequestUIState(isRequested, requestData = null) {
    const statusEl = document.getElementById('volunteerRequestStatus');
    const btn = document.getElementById('volunteerRequestBtn');
    const noteInput = document.getElementById('volunteerRequestInput');

    if (!statusEl || !btn) return;

    if (isRequested) {
        const requestedAt = requestData && requestData.requested_at
            ? formatPostTime(requestData.requested_at)
            : 'recently';
        statusEl.classList.remove('hidden');
        statusEl.textContent = `Volunteer request already active (requested ${requestedAt}).`;
        btn.disabled = true;
        btn.classList.add('opacity-60', 'cursor-not-allowed');
        btn.classList.remove('hover:from-purple-700', 'hover:to-indigo-700');
        if (noteInput) noteInput.disabled = true;
    } else {
        statusEl.classList.add('hidden');
        statusEl.textContent = '';
        btn.disabled = false;
        btn.classList.remove('opacity-60', 'cursor-not-allowed');
        if (noteInput) noteInput.disabled = false;
    }
}

async function syncVolunteerRequestStatus() {
    if (!currentUser || currentUser.role !== 'user') return;

    try {
        const response = await fetch(`${API_BASE}/volunteer/request/${currentUser.user_id}`);
        const data = await response.json();

        if (response.status === 404 && data && data.error === 'User not found') {
            handleInvalidSession();
            return;
        }

        if (!response.ok) {
            setVolunteerRequestUIState(false);
            return;
        }

        if (data.requested) {
            setVolunteerRequestUIState(true, data.request);
        } else {
            setVolunteerRequestUIState(false);
        }
    } catch (error) {
        // Silent: keep UI usable even if status API temporarily fails.
        setVolunteerRequestUIState(false);
    }
}

// ==================== Dashboard ====================

async function loadUserDashboard() {
    if (!currentUser) return;
    const userNameDisplay = document.getElementById('userNameDisplay');
    if (userNameDisplay) userNameDisplay.textContent = currentUser.name;
    try {
        const moodResponse = await fetch(`${API_BASE}/mood/${currentUser.user_id}`);
        const moodData = await moodResponse.json();
        if (moodResponse.status === 404 && moodData && moodData.error === 'User not found') {
            handleInvalidSession();
            return;
        }
        if (moodResponse.ok) {
            const moodCard = document.getElementById('moodCard');
            const moodEmoji = document.getElementById('moodEmoji');
            const moodStatus = document.getElementById('moodStatus');
            const moodCount = document.getElementById('moodCount');

            if (moodData.current_mood && moodData.current_mood.mood !== 'neutral' && moodCard && moodEmoji && moodStatus) {
                moodCard.style.backgroundColor = moodData.current_mood.color;
                moodEmoji.textContent = moodData.current_mood.emoji;
                moodStatus.textContent = moodData.current_mood.mood.charAt(0).toUpperCase() + moodData.current_mood.mood.slice(1);
                loadMusicRecommendation(moodData.current_mood.mood);
            }
            if (moodCount) moodCount.textContent = moodData.total_moods;
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
        if (response.status === 404 && data && data.error === 'User not found') {
            handleInvalidSession();
            return;
        }
        if (response.ok) {
            document.getElementById('moodMessage').classList.remove('hidden');

            setTimeout(() => {
                document.getElementById('moodMessage').classList.add('hidden');
            }, 3000);

            // Render dynamic response box
            if (data.response) {
                renderMoodResponse(data.response, data.mood_entry);
            }

            // Track mood locally for risk detection
            trackMoodLocally(mood);

            loadMoodHistory();
        }
    } catch (error) {
        showToast('Error saving mood', 'error');
    }
}

function renderMoodResponse(moodResponse, moodEntry) {
    const responseBox = document.getElementById('responseBox');

    // Build gradient based on mood color
    const gradients = {
        happy:    'from-yellow-50 to-amber-50 border-yellow-300',
        sad:      'from-blue-50 to-indigo-50 border-blue-300',
        stressed: 'from-red-50 to-rose-50 border-red-300',
        anxious:  'from-orange-50 to-amber-50 border-orange-300',
        calm:     'from-green-50 to-emerald-50 border-green-300'
    };
    const gradientClass = gradients[moodEntry.mood] || 'from-gray-50 to-slate-50 border-gray-300';

    let buttonsHtml = moodResponse.actions.map(action => `
        <button onclick="navigateTo('${action.route}')"
            class="bg-white hover:bg-indigo-50 text-gray-800 font-semibold px-5 py-3 rounded-xl transition-all duration-200 transform hover:scale-105 hover:shadow-md border-2 border-gray-200 hover:border-indigo-400 text-sm flex items-center gap-2">
            ${action.label}
        </button>
    `).join('');

    responseBox.innerHTML = `
        <div class="bg-gradient-to-br ${gradientClass} border-2 rounded-2xl shadow-lg p-8 animate-fade-in">
            <div class="flex items-center gap-4 mb-5">
                <span class="text-5xl">${moodEntry.emoji}</span>
                <div>
                    <p class="text-xl font-bold text-gray-800">${moodResponse.message}</p>
                    <p class="text-sm text-gray-500 mt-1">Here are some things you can do right now:</p>
                </div>
            </div>
            <div class="flex flex-wrap gap-3">
                ${buttonsHtml}
            </div>
        </div>
    `;

    // Animate in
    responseBox.classList.remove('hidden');
    responseBox.style.opacity = '0';
    responseBox.style.transform = 'translateY(16px)';
    requestAnimationFrame(() => {
        responseBox.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        responseBox.style.opacity = '1';
        responseBox.style.transform = 'translateY(0)';
    });
}

function trackMoodLocally(mood) {
    try {
        let recentMoods = JSON.parse(localStorage.getItem('recentMoods') || '[]');
        recentMoods.push(mood);
        // Keep only last 3
        if (recentMoods.length > 3) {
            recentMoods = recentMoods.slice(-3);
        }
        localStorage.setItem('recentMoods', JSON.stringify(recentMoods));

        // Check if last 3 are all sad or anxious
        if (recentMoods.length >= 3) {
            const lowMoods = ['sad', 'anxious', 'stressed'];
            const allLow = recentMoods.every(m => lowMoods.includes(m));
            if (allLow) {
                const alertEl = document.getElementById('lowMoodAlert');
                if (alertEl) {
                    alertEl.classList.remove('hidden');
                    alertEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                // Reset tracking after showing alert
                localStorage.setItem('recentMoods', '[]');
            }
        }
    } catch (e) {
        console.error('Error tracking mood locally:', e);
    }
}

async function loadMoodHistory() {
    try {
        const response = await fetch(`${API_BASE}/mood/${currentUser.user_id}`);
        const data = await response.json();
        if (response.status === 404 && data && data.error === 'User not found') {
            handleInvalidSession();
            return;
        }
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
    if (currentUser.role === 'user') {
        loadUserVolunteerSecureChat();
    }
}

async function loadChatHistory() {
    try {
        const response = await fetch(`${API_BASE}/chat/${currentUser.user_id}`);
        const data = await response.json();
        if (response.status === 404 && data && data.error === 'User not found') {
            handleInvalidSession();
            return;
        }
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

        if (response.status === 404 && data && data.error === 'User not found') {
            handleInvalidSession();
            return;
        }

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

async function loadUserVolunteerSecureChat() {
    const section = document.getElementById('userVolunteerChatSection');
    if (!section || !currentUser || currentUser.role !== 'user') return;

    try {
        const response = await fetch(`${API_BASE}/secure-chat/user/${currentUser.user_id}`);
        const data = await response.json();

        if (response.status === 404 && data && data.error === 'User not found') {
            handleInvalidSession();
            return;
        }

        if (!response.ok) {
            section.classList.add('hidden');
            return;
        }

        if (!data.connected) {
            section.classList.add('hidden');
            userAssignedVolunteerId = null;
            return;
        }

        userAssignedVolunteerId = data.volunteer_id;
        section.classList.remove('hidden');

        const status = document.getElementById('userVolunteerChatStatus');
        if (status) status.textContent = `Connected with ${data.volunteer_name || 'Volunteer'}`;

        renderUserVolunteerSecureMessages(data.messages || []);
    } catch (error) {
        // Silent fail to avoid breaking main AI chat.
    }
}

function renderUserVolunteerSecureMessages(messages) {
    const container = document.getElementById('userVolunteerChatMessages');
    if (!container) return;

    if (!messages || !messages.length) {
        container.innerHTML = '<p class="text-gray-500">No messages yet.</p>';
        return;
    }

    container.innerHTML = messages.map(msg => {
        const isUser = msg.sender_role === 'user';
        return `
            <div class="${isUser ? 'flex justify-end' : 'flex justify-start'}">
                <div class="${isUser ? 'bg-purple-600 text-white' : 'bg-white border border-purple-200 text-gray-800'} rounded-xl px-3 py-2 max-w-xs">
                    <p class="text-sm">${escapeHtml(msg.text)}</p>
                    <p class="text-[11px] mt-1 ${isUser ? 'text-purple-100' : 'text-gray-500'}">${formatPostTime(msg.timestamp)}</p>
                </div>
            </div>
        `;
    }).join('');

    container.scrollTop = container.scrollHeight;
}

async function sendUserVolunteerMessage() {
    if (!currentUser || currentUser.role !== 'user') return;
    const input = document.getElementById('userVolunteerMessageInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    try {
        const response = await fetch(`${API_BASE}/secure-chat/user/${currentUser.user_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender_id: currentUser.user_id, text })
        });
        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || 'Unable to send secure message.', 'error');
            return;
        }

        input.value = '';
        loadUserVolunteerSecureChat();
    } catch (error) {
        showToast('Secure chat is unavailable right now.', 'error');
    }
}

// ==================== Profile ====================

async function loadProfile() {
    if (!currentUser) return;
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const profileRole = document.getElementById('profileRole');
    if (profileName) profileName.textContent = currentUser.name;
    if (profileEmail) profileEmail.textContent = currentUser.email;
    if (profileRole) profileRole.textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);

    // Dashboard analytics were moved to profile page.
    loadUserDashboard();
    try {
        const response = await fetch(`${API_BASE}/mood/${currentUser.user_id}`);
        const data = await response.json();
        if (response.status === 404 && data && data.error === 'User not found') {
            handleInvalidSession();
            return;
        }
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
    if (!currentUser || currentUser.role !== 'volunteer') return;

    loadCommunityPosts();
    renderVolunteerCommunityFeed();

    await loadVolunteerHandlingUsers();

    try {
        const response = await fetch(`${API_BASE}/volunteer/users-needing-help`);
        const data = await response.json();
        if (response.ok) {
            latestUsersNeedingHelp = data.users || [];
            renderVolunteerUsersNeedingHelp();
        }
    } catch (error) {
        showToast('Error loading users', 'error');
    }
}

async function loadVolunteerHandlingUsers() {
    if (!currentUser || currentUser.role !== 'volunteer') return;
    try {
        const response = await fetch(`${API_BASE}/volunteer/handling/${currentUser.user_id}`);
        const data = await response.json();
        if (response.ok) {
            volunteerHandlingUsers = data.users || [];
            renderVolunteerHandlingList();
            if (selectedVolunteerSecureUserId && !volunteerHandlingUsers.some(u => u.user_id === selectedVolunteerSecureUserId)) {
                selectedVolunteerSecureUserId = null;
                resetVolunteerSecureChatPanel();
            }
        }
    } catch (error) {
        showToast('Unable to load assigned users.', 'error');
    }
}

function renderVolunteerUsersNeedingHelp() {
    const container = document.getElementById('volunteerUsersList');
    if (!container) return;

    if (!latestUsersNeedingHelp.length) {
        container.innerHTML = '<p class="text-gray-500 text-lg">No users currently need support.</p>';
        return;
    }

    const handlingIds = new Set(volunteerHandlingUsers.map(u => u.user_id));

    container.innerHTML = latestUsersNeedingHelp.map(user => {
        const alreadyHandling = handlingIds.has(user.user_id);
        const sourceLabel = user.source === 'user-request' ? 'User Requested Help' : 'High Stress Quiz';
        const requestNote = user.request_note ? `<p class="text-xs text-purple-700 mt-2">Note: ${escapeHtml(user.request_note)}</p>` : '';
        return `
            <div class="bg-purple-50 rounded-xl p-4 border border-purple-100">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <p class="text-lg font-semibold text-gray-800">${escapeHtml(user.name)}</p>
                        <p class="text-sm text-gray-600">User ID: ${user.user_id}</p>
                    </div>
                    <span class="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-semibold">${escapeHtml(user.stress_level)}</span>
                </div>
                <p class="text-sm text-gray-600 mb-3">Last quiz: ${new Date(user.last_quiz_date).toLocaleDateString()}</p>
                <p class="text-xs inline-block bg-purple-100 text-purple-700 px-2 py-1 rounded-full mb-2">${sourceLabel}</p>
                ${requestNote}
                <button ${alreadyHandling ? 'disabled' : ''} onclick="startHandlingUser(${user.user_id})" class="${alreadyHandling ? 'bg-gray-300 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'} text-white px-4 py-2 rounded-lg transition text-sm font-semibold">
                    ${alreadyHandling ? 'Already Handling' : 'Start Handling'}
                </button>
            </div>
        `;
    }).join('');
}

async function startHandlingUser(userId) {
    const target = latestUsersNeedingHelp.find(u => u.user_id === userId);
    if (!target) return;

    try {
        const response = await fetch(`${API_BASE}/volunteer/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ volunteer_id: currentUser.user_id, user_id: target.user_id })
        });
        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || 'Unable to assign user.', 'error');
            return;
        }

        showToast('User assigned to your handling list.', 'success');
        await loadVolunteerDashboard();
    } catch (error) {
        showToast('Unable to assign user right now.', 'error');
    }
}

async function stopHandlingUser(userId) {
    try {
        const response = await fetch(`${API_BASE}/volunteer/release`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ volunteer_id: currentUser.user_id, user_id: userId })
        });
        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || 'Unable to release user.', 'error');
            return;
        }

        if (selectedVolunteerSecureUserId === userId) {
            selectedVolunteerSecureUserId = null;
            resetVolunteerSecureChatPanel();
        }

        await loadVolunteerDashboard();
    } catch (error) {
        showToast('Unable to release user right now.', 'error');
    }
}

function renderVolunteerHandlingList() {
    const container = document.getElementById('volunteerHandlingList');
    if (!container) return;

    if (!volunteerHandlingUsers.length) {
        container.innerHTML = '<p class="text-gray-500">No users assigned yet.</p>';
        return;
    }

    container.innerHTML = volunteerHandlingUsers.map(user => `
        <div class="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
            <div class="flex items-center justify-between gap-4">
                <div>
                    <p class="font-semibold text-gray-800">${escapeHtml(user.name)}</p>
                    <p class="text-xs text-gray-600">User ID: ${user.user_id} | ${escapeHtml(user.stress_level)}</p>
                    <p class="text-xs text-gray-500 mt-1">Assigned: ${formatPostTime(user.assigned_at)}</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="openVolunteerSecureChat(${user.user_id})" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-semibold">Secure Chat</button>
                    <button onclick="stopHandlingUser(${user.user_id})" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded-lg text-xs font-semibold">Release</button>
                </div>
            </div>
        </div>
    `).join('');
}

function resetVolunteerSecureChatPanel() {
    const header = document.getElementById('volunteerSecureChatHeader');
    const list = document.getElementById('volunteerSecureChatMessages');
    const input = document.getElementById('volunteerSecureChatInput');
    const sendBtn = document.getElementById('volunteerSecureChatSendBtn');

    if (header) header.textContent = 'Select a user from Currently Handling';
    if (list) list.innerHTML = '<p class="text-gray-500">No active secure chat selected.</p>';
    if (input) {
        input.value = '';
        input.disabled = true;
    }
    if (sendBtn) sendBtn.disabled = true;
}

function renderVolunteerSecureMessages(messages) {
    const list = document.getElementById('volunteerSecureChatMessages');
    if (!list) return;

    if (!messages || !messages.length) {
        list.innerHTML = '<p class="text-gray-500">No secure messages yet.</p>';
        return;
    }

    list.innerHTML = messages.map(msg => {
        const isVolunteer = msg.sender_role === 'volunteer';
        return `
            <div class="${isVolunteer ? 'flex justify-end' : 'flex justify-start'}">
                <div class="${isVolunteer ? 'bg-emerald-600 text-white' : 'bg-white border border-emerald-200 text-gray-800'} rounded-xl px-3 py-2 max-w-xs">
                    <p class="text-sm">${escapeHtml(msg.text)}</p>
                    <p class="text-[11px] mt-1 ${isVolunteer ? 'text-emerald-100' : 'text-gray-500'}">${formatPostTime(msg.timestamp)}</p>
                </div>
            </div>
        `;
    }).join('');

    list.scrollTop = list.scrollHeight;
}

async function openVolunteerSecureChat(userId) {
    if (!currentUser || currentUser.role !== 'volunteer') return;
    selectedVolunteerSecureUserId = userId;

    const header = document.getElementById('volunteerSecureChatHeader');
    const input = document.getElementById('volunteerSecureChatInput');
    const sendBtn = document.getElementById('volunteerSecureChatSendBtn');
    const user = volunteerHandlingUsers.find(u => u.user_id === userId);
    if (header) header.textContent = user ? `Secure chat with ${user.name} (User ID: ${user.user_id})` : `Secure chat with user ${userId}`;
    if (input) input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;

    try {
        const response = await fetch(`${API_BASE}/secure-chat/volunteer/${currentUser.user_id}/${userId}`);
        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || 'Unable to load secure chat.', 'error');
            return;
        }
        renderVolunteerSecureMessages(data.messages || []);
    } catch (error) {
        showToast('Unable to load secure chat.', 'error');
    }
}

async function sendVolunteerSecureMessage() {
    if (!currentUser || currentUser.role !== 'volunteer' || !selectedVolunteerSecureUserId) return;

    const input = document.getElementById('volunteerSecureChatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    try {
        const response = await fetch(`${API_BASE}/secure-chat/volunteer/${currentUser.user_id}/${selectedVolunteerSecureUserId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender_id: currentUser.user_id, text })
        });
        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || 'Unable to send secure message.', 'error');
            return;
        }

        input.value = '';
        openVolunteerSecureChat(selectedVolunteerSecureUserId);
    } catch (error) {
        showToast('Unable to send secure message.', 'error');
    }
}

function submitVolunteerPost() {
    const input = document.getElementById('volunteerPostInput');
    if (!input || !currentUser) return;

    const text = input.value.trim();
    if (!text) {
        showToast('Please write a message before posting.', 'error');
        return;
    }

    const post = {
        id: Date.now(),
        userId: currentUser.user_id,
        petName: `Guide ${getCurrentPetName()}`,
        text,
        timestamp: new Date().toISOString(),
        comments: []
    };

    communityPosts.unshift(post);
    saveCommunityPosts();
    input.value = '';

    const counter = document.getElementById('volunteerPostCharCount');
    if (counter) counter.textContent = '0 / 280';

    renderVolunteerCommunityFeed();
    showToast('Volunteer post published.', 'success');
}

function volunteerReplyToPost(postId) {
    const input = document.getElementById(`volunteerReplyInput-${postId}`);
    if (!input || !currentUser) return;

    const text = input.value.trim();
    if (!text) {
        showToast('Reply cannot be empty.', 'error');
        return;
    }

    const post = communityPosts.find(p => p.id === postId);
    if (!post) return;

    post.comments.push({
        id: Date.now(),
        userId: currentUser.user_id,
        petName: `Guide ${getCurrentPetName()}`,
        text,
        timestamp: new Date().toISOString()
    });

    saveCommunityPosts();
    input.value = '';
    renderVolunteerCommunityFeed();
}

function renderVolunteerCommunityFeed() {
    const container = document.getElementById('volunteerCommunityFeed');
    if (!container) return;

    if (!communityPosts.length) {
        container.innerHTML = '<p class="text-gray-500">No community posts yet.</p>';
        return;
    }

    container.innerHTML = communityPosts.map(post => {
        const comments = post.comments && post.comments.length
            ? post.comments.map(comment => `
                <div class="bg-purple-50 rounded-lg px-3 py-2">
                    <p class="text-sm text-gray-700"><span class="font-semibold text-purple-700">${escapeHtml(comment.petName)}</span>: ${escapeHtml(comment.text)}</p>
                </div>
            `).join('')
            : '<p class="text-sm text-gray-500">No replies yet.</p>';

        return `
            <div class="border border-gray-200 rounded-xl p-4">
                <div class="flex justify-between items-start mb-2">
                    <p class="font-semibold text-indigo-700">${escapeHtml(post.petName)}</p>
                    <p class="text-xs text-gray-500">${formatPostTime(post.timestamp)}</p>
                </div>
                <p class="text-gray-800 mb-3">${escapeHtml(post.text)}</p>
                <div class="space-y-2 mb-3">${comments}</div>
                <div class="flex gap-2">
                    <input id="volunteerReplyInput-${post.id}" type="text" maxlength="180" placeholder="Reply as volunteer..." class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-purple-600" />
                    <button onclick="volunteerReplyToPost(${post.id})" class="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-sm">Reply</button>
                </div>
            </div>
        `;
    }).join('');
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

// ==================== Breathing Exercise ====================

let breathingInterval = null;
let breathingTimeout = null;
let breathingRound = 1;
let currentTechnique = 'relaxed';

const BREATHING_TECHNIQUES = {
    relaxed: { name: 'Box Breathing', phases: [
        { label: 'Breathe In', duration: 4, action: 'expand' },
        { label: 'Hold', duration: 4, action: 'hold' },
        { label: 'Breathe Out', duration: 4, action: 'shrink' },
        { label: 'Hold', duration: 4, action: 'hold' }
    ]},
    calming: { name: '4-7-8 Technique', phases: [
        { label: 'Breathe In', duration: 4, action: 'expand' },
        { label: 'Hold', duration: 7, action: 'hold' },
        { label: 'Breathe Out', duration: 8, action: 'shrink' }
    ]},
    energizing: { name: 'Quick Breath', phases: [
        { label: 'Breathe In', duration: 2, action: 'expand' },
        { label: 'Breathe Out', duration: 2, action: 'shrink' }
    ]}
};

function selectBreathingTechnique(technique) {
    currentTechnique = technique;
    // Update UI - highlight selected
    document.querySelectorAll('.breath-technique-btn').forEach(btn => {
        btn.classList.remove('border-indigo-500', 'border-emerald-500', 'border-orange-500', 'bg-indigo-50', 'bg-emerald-50', 'bg-orange-50');
        btn.classList.add('border-transparent');
    });
    const colors = { relaxed: 'indigo', calming: 'emerald', energizing: 'orange' };
    const color = colors[technique];
    const selectedBtn = document.querySelector(`.breath-technique-btn[data-technique="${technique}"]`);
    if (selectedBtn) {
        selectedBtn.classList.remove('border-transparent');
        selectedBtn.classList.add(`border-${color}-500`, `bg-${color}-50`);
    }
    // Stop current if running
    stopBreathing();
    showToast(`Selected: ${BREATHING_TECHNIQUES[technique].name}`, 'success');
}

function startBreathing() {
    const technique = BREATHING_TECHNIQUES[currentTechnique];
    const circle = document.getElementById('breathCircle');
    const text = document.getElementById('breathText');
    const timer = document.getElementById('breathTimer');
    const roundEl = document.getElementById('breathRound');
    const startBtn = document.getElementById('breathStartBtn');
    const stopBtn = document.getElementById('breathStopBtn');

    if (!circle || !text || !timer) return;

    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    breathingRound = 1;
    roundEl.textContent = breathingRound;

    function runPhase(phaseIndex) {
        if (!breathingInterval && phaseIndex !== 0) return; // stopped

        const phase = technique.phases[phaseIndex % technique.phases.length];
        let seconds = phase.duration;

        text.textContent = phase.label;
        timer.textContent = seconds;

        // Set circle animation
        circle.classList.remove('breathing-expand', 'breathing-shrink', 'breathing-hold');
        if (phase.action === 'expand') {
            circle.classList.add('breathing-expand');
            circle.style.animationDuration = phase.duration + 's';
        } else if (phase.action === 'shrink') {
            circle.classList.add('breathing-shrink');
            circle.style.animationDuration = phase.duration + 's';
        } else {
            circle.classList.add('breathing-hold');
        }

        // Countdown
        breathingInterval = setInterval(() => {
            seconds--;
            if (seconds <= 0) {
                clearInterval(breathingInterval);
                breathingInterval = true; // mark as running to differentiate from stopped (null)

                const nextPhase = phaseIndex + 1;
                // Check if we completed a full cycle
                if (nextPhase % technique.phases.length === 0) {
                    breathingRound++;
                    roundEl.textContent = breathingRound;
                    if (breathingRound > 5) {
                        // Done after 5 rounds
                        stopBreathing();
                        showToast('Great job! You completed the exercise 🎉', 'success');
                        return;
                    }
                }
                runPhase(nextPhase);
            } else {
                timer.textContent = seconds;
            }
        }, 1000);
    }

    breathingInterval = true; // mark as running
    runPhase(0);
}

function stopBreathing() {
    if (breathingInterval && breathingInterval !== true) {
        clearInterval(breathingInterval);
    }
    breathingInterval = null;
    breathingRound = 1;

    const circle = document.getElementById('breathCircle');
    const text = document.getElementById('breathText');
    const timer = document.getElementById('breathTimer');
    const roundEl = document.getElementById('breathRound');
    const startBtn = document.getElementById('breathStartBtn');
    const stopBtn = document.getElementById('breathStopBtn');

    if (circle) {
        circle.classList.remove('breathing-expand', 'breathing-shrink', 'breathing-hold');
        circle.style.animationDuration = '';
    }
    if (text) text.textContent = 'Breathe In';
    if (timer) timer.textContent = '4';
    if (roundEl) roundEl.textContent = '1';
    if (startBtn) startBtn.classList.remove('hidden');
    if (stopBtn) stopBtn.classList.add('hidden');
}

// ==================== Journal ====================

let journalEntries = [];

function initJournal() {
    try {
        journalEntries = JSON.parse(localStorage.getItem('journalEntries') || '[]');
    } catch (e) {
        journalEntries = [];
    }

    // Character counter
    const textarea = document.getElementById('journalEntry');
    if (textarea) {
        textarea.addEventListener('input', function() {
            const count = document.getElementById('journalCharCount');
            if (count) count.textContent = `${this.value.length} characters`;
        });
    }

    renderJournalHistory();
}

function saveJournalEntry() {
    const textarea = document.getElementById('journalEntry');
    if (!textarea) return;

    const text = textarea.value.trim();
    if (!text) {
        showToast('Please write something first', 'error');
        return;
    }

    const entry = {
        id: Date.now(),
        text: text,
        timestamp: new Date().toISOString(),
        user: currentUser ? currentUser.name : 'Anonymous'
    };

    journalEntries.push(entry);
    localStorage.setItem('journalEntries', JSON.stringify(journalEntries));

    textarea.value = '';
    const count = document.getElementById('journalCharCount');
    if (count) count.textContent = '0 characters';

    renderJournalHistory();
    showToast('Journal entry saved! 📝', 'success');
}

function renderJournalHistory() {
    const container = document.getElementById('journalHistory');
    if (!container) return;

    if (journalEntries.length === 0) {
        container.innerHTML = '<p class="text-gray-500">No journal entries yet. Start writing!</p>';
        return;
    }

    let html = '';
    // Show newest first
    [...journalEntries].reverse().forEach(entry => {
        const time = new Date(entry.timestamp).toLocaleString();
        const preview = entry.text.length > 200 ? entry.text.substring(0, 200) + '...' : entry.text;
        html += `
            <div class="p-5 bg-gradient-to-br from-gray-50 to-slate-50 rounded-xl border border-gray-200 hover:shadow-md transition-all duration-200">
                <div class="flex justify-between items-start mb-2">
                    <p class="text-xs text-gray-400 font-medium">${time}</p>
                    <button onclick="deleteJournalEntry(${entry.id})" class="text-red-400 hover:text-red-600 text-xs transition">🗑️ Delete</button>
                </div>
                <p class="text-gray-700 leading-relaxed whitespace-pre-wrap">${escapeHtml(preview)}</p>
            </div>
        `;
    });

    container.innerHTML = html;
}

function deleteJournalEntry(id) {
    journalEntries = journalEntries.filter(e => e.id !== id);
    localStorage.setItem('journalEntries', JSON.stringify(journalEntries));
    renderJournalHistory();
    showToast('Entry deleted', 'success');
}

// Initialize journal when navigating to journal page
const originalNavigateTo = navigateTo;
navigateTo = function(page) {
    originalNavigateTo(page);
    if (page === 'journal') {
        initJournal();
    } else if (page === 'breathing') {
        stopBreathing(); // Reset breathing state when navigating here
    }
};

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

