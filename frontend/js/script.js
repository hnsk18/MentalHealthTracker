/* Sevak Frontend - Main Script */

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
let userSecureChatPollTimer = null;
let volunteerSecureChatPollTimer = null;
let lastUserSecureChatHash = '';
let lastVolunteerSecureChatHash = '';
let quizResultData = null;
let currentChatMode = 'ai';
const QUIZ_RESULT_STORAGE_KEY = 'sevak_quiz_result';

function normalizeQuizResultPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const score = Number(payload.score);
    const feedback = payload.feedback;
    if (!Number.isFinite(score) || !feedback || typeof feedback !== 'object') return null;
    return { score, feedback };
}

function setQuizResultContext(payload, persist = true) {
    const normalized = normalizeQuizResultPayload(payload);
    if (!normalized) return false;

    quizResultData = normalized;
    if (persist) {
        sessionStorage.setItem(QUIZ_RESULT_STORAGE_KEY, JSON.stringify(normalized));
    }
    return true;
}

function getStoredQuizResultContext() {
    try {
        const raw = sessionStorage.getItem(QUIZ_RESULT_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return normalizeQuizResultPayload(parsed);
    } catch (e) {
        return null;
    }
}

function clearStoredQuizResultContext() {
    sessionStorage.removeItem(QUIZ_RESULT_STORAGE_KEY);
}

// Used by quiz result iframe for deterministic handoff before navigating to messaging.
window.receiveQuizResultAndNavigate = function (payload) {
    const ok = setQuizResultContext(payload, true);
    if (!ok) return;

    // Auto-push mood from quiz result to mood tracker
    if (currentUser && payload.feedback && payload.feedback.mood) {
        pushQuizMoodToTracker(payload.feedback.mood, payload.score);
    }

    navigateTo('messaging');
};

function mapQuizMoodToAppMood(quizMood, score) {
    const lower = (quizMood || '').toLowerCase();
    if (/happy|positive|joyful|cheerful|good|great|content/i.test(lower)) return 'happy';
    if (/sad|depress|unhappy|low|down|grief|lonely/i.test(lower)) return 'sad';
    if (/stress|overwhelm|pressure|burnout|tense|exhaust|angry|frustrat/i.test(lower)) return 'stressed';
    if (/anxi|nervous|worried|fear|panic|uneasy|restless/i.test(lower)) return 'anxious';
    if (/calm|peace|relax|serene|balanced|steady|neutral|mindful/i.test(lower)) return 'calm';
    // Fallback based on score
    if (score >= 75) return 'happy';
    if (score >= 55) return 'calm';
    if (score >= 40) return 'stressed';
    if (score >= 25) return 'anxious';
    return 'sad';
}

async function pushQuizMoodToTracker(quizMood, score) {
    try {
        const mood = mapQuizMoodToAppMood(quizMood, score);
        const response = await fetch(`${API_BASE}/mood`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.user_id, mood })
        });
        if (response.ok) {
            console.log('Quiz mood pushed to tracker:', mood, '(from quiz mood:', quizMood, ')');
            showToast(`Mood "${mood}" saved from your quiz results 📊`, 'success');
        }
    } catch (e) {
        console.warn('Failed to push quiz mood to tracker:', e);
    }
}

// ==================== Initialization ====================

// Listen for messages from quiz iframe
window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'QUIZ_RESULT') {
        setQuizResultContext(event.data.data, true);
        console.log('Quiz data received:', quizResultData);
    }
});

// Handle browser back/forward buttons to preserve page navigation
window.addEventListener('popstate', function (event) {
    const pageFromHash = getPageFromHash();
    if (pageFromHash && currentUser && canAccessPage(pageFromHash)) {
        navigateTo(pageFromHash);
    } else if (pageFromHash && !currentUser && isPublicPage(pageFromHash)) {
        navigateTo(pageFromHash);
    } else if (currentUser) {
        navigateTo(getDefaultLandingPage());
    } else {
        navigateTo('home');
    }
});

document.addEventListener('DOMContentLoaded', async function () {
    console.log('DOM Content Loaded');

    // Ensure only one navbar exists and it's clean
    const existingNavbars = document.querySelectorAll('nav[id="navbar"]');
    if (existingNavbars.length > 1) {
        existingNavbars.forEach((nav, index) => {
            if (index > 0) nav.remove();
        });
    }

    const initialPage = getPageFromHash();

    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            const sessionIsValid = await validateCurrentUserSession();
            if (sessionIsValid) {
                showNavbar();
                // Prefer the current page hash on refresh, fall back to default landing page
                let targetPage = initialPage;

                // Verify user can access the current page, otherwise use default
                if (!targetPage || !canAccessPage(targetPage)) {
                    targetPage = getDefaultLandingPage();
                } else if (!targetPage) {
                    targetPage = getDefaultLandingPage();
                }

                navigateTo(targetPage);
            }
        } catch (error) {
            console.error('Error loading saved user:', error);
            // If logged in user session fails, try to preserve page if it's public
            const fallbackPage = initialPage && isPublicPage(initialPage) ? initialPage : 'home';
            navigateTo(fallbackPage);
        }
    } else {
        // Not logged in - only allow public pages
        const fallbackPage = initialPage && isPublicPage(initialPage) ? initialPage : 'home';
        navigateTo(fallbackPage);
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    const registerForm = document.getElementById('registerForm');
    if (registerForm) registerForm.addEventListener('submit', handleRegister);

    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') sendMessage();
        });
    }

    const userVolunteerMessageInput = document.getElementById('userVolunteerMessageInput');
    if (userVolunteerMessageInput) {
        userVolunteerMessageInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') sendUserVolunteerMessage();
        });
    }

    const volunteerSecureChatInput = document.getElementById('volunteerSecureChatInput');
    if (volunteerSecureChatInput) {
        volunteerSecureChatInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') sendVolunteerSecureMessage();
        });
    }

    const feelingInput = document.getElementById('feelingPostInput');
    if (feelingInput) {
        feelingInput.addEventListener('input', function () {
            const counter = document.getElementById('feelingCharCount');
            if (counter) counter.textContent = `${this.value.length} / 300`;
        });
    }

    const volunteerPostInput = document.getElementById('volunteerPostInput');
    if (volunteerPostInput) {
        volunteerPostInput.addEventListener('input', function () {
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
            el.style.display = '';
        });
        const pageEl = document.getElementById(page);
        if (pageEl) {
            pageEl.classList.remove('hidden');
            pageEl.style.display = '';
            if (window.location.hash !== `#${page}`) {
                history.replaceState(null, '', `#${page}`);
            }
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

function getPageFromHash() {
    try {
        const hash = window.location.hash ? window.location.hash.replace('#', '').trim() : '';
        if (!hash) return null;
        // Check if page element exists
        const pageEl = document.getElementById(hash);
        if (pageEl && pageEl.classList.contains('page-section')) {
            return hash;
        }
        return null;
    } catch (e) {
        return null;
    }
}

function isPublicPage(page) {
    return ['home', 'login', 'register'].includes(page);
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
            // Handle approval-specific errors
            if (data.code === 'PENDING_APPROVAL') {
                showToast('⏳ Your volunteer account is pending admin approval. Please check back later.', 'info');
            } else if (data.code === 'REJECTED') {
                showToast('❌ Your volunteer application has been rejected. Contact support.', 'error');
            } else {
                showToast(data.error || 'Login failed', 'error');
            }
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
    const is_licensed = document.getElementById('registerLicensed')?.checked || false;
    const expertise = document.getElementById('registerExpertise')?.value || '';
    const region = document.getElementById('registerRegion')?.value || null;
    const age = document.getElementById('registerAge')?.value || null;
    try {
        const body = { name, email, password, role, region, age };
        if (role === 'volunteer') {
            body.is_licensed = is_licensed;
            body.expertise = expertise;
        }

        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (response.ok) {
            if (data.approval_status === 'pending') {
                showToast('Registration successful! Your account is pending admin approval.', 'info');
            } else {
                showToast('Registration successful! Please login.', 'success');
            }
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

function toggleVolunteerFields() {
    const role = document.getElementById('registerRole')?.value;
    const fields = document.getElementById('volunteerRegFields');
    if (!fields) return;
    if (role === 'volunteer') {
        fields.classList.remove('hidden');
    } else {
        fields.classList.add('hidden');
    }
}

function logout() {
    stopAllSecureChatPolling();
    stopAdminSSE();
    currentUser = null;
    localStorage.removeItem('currentUser');
    hideNavbar();
    navigateTo('home');
    showToast('Logged out successfully', 'success');
}

function handleInvalidSession(message = 'Your session expired after a server restart. Please login again.') {
    if (invalidSessionHandled) return;
    invalidSessionHandled = true;
    stopAllSecureChatPolling();
    stopAdminSSE();
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
        // Remove any duplicate navbars
        const allNavbars = document.querySelectorAll('nav[id="navbar"]');
        allNavbars.forEach((nav, index) => {
            if (index > 0) nav.remove();
        });

        // Show the single navbar
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

async function loadCommunityPosts() {
    try {
        const response = await fetch(`${API_BASE}/feed/posts`);
        const data = await response.json();
        if (!response.ok) {
            communityPosts = [];
            return;
        }
        communityPosts = data.posts || [];
    } catch (error) {
        communityPosts = [];
    }
}

function formatPostTime(isoString) {
    const parsed = parseAppDateTime(isoString);
    if (!parsed) return 'Unknown time';

    const istDate = getISTDate(parsed);
    const day = istDate.getUTCDate();
    const month = istDate.getUTCMonth() + 1;
    const year = istDate.getUTCFullYear();
    const hour24 = istDate.getUTCHours();
    const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');
    const hour12 = hour24 % 12 || 12;
    const period = hour24 >= 12 ? 'pm' : 'am';

    return `${day}/${month}/${year}, ${hour12}:${minutes}:${seconds} ${period} IST`;
}

function formatPostDate(isoString) {
    const parsed = parseAppDateTime(isoString);
    if (!parsed) return 'Invalid date';

    const istDate = getISTDate(parsed);
    const monthIndex = istDate.getUTCMonth();
    const day = istDate.getUTCDate();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[monthIndex]} ${day}`;
}

function getISTDate(dateObj) {
    const IST_OFFSET_MINUTES = 330;
    return new Date(dateObj.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
}

function parseAppDateTime(value) {
    if (!value) return null;

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'number') {
        const ms = value < 1e12 ? value * 1000 : value;
        const parsedNumberDate = new Date(ms);
        return Number.isNaN(parsedNumberDate.getTime()) ? null : parsedNumberDate;
    }

    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    let parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;

    // Normalize SQL-like timestamps that may come as "YYYY-MM-DD HH:mm:ss".
    const normalized = trimmed.replace(' ', 'T');
    parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) return parsed;

    // If timezone is missing, assume UTC for backend-generated timestamps.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(normalized)) {
        parsed = new Date(`${normalized}Z`);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    return null;
}

function anonymizeUserLabel(userId) {
    const id = String(userId || '');
    if (!id) return 'Anonymous Friend';
    const prefixes = ['Calm', 'Kind', 'Brave', 'Quiet', 'Gentle', 'Bright', 'Steady', 'Hopeful'];
    const animals = ['Otter', 'Robin', 'Koala', 'Panda', 'Fox', 'Dolphin', 'Sparrow', 'Turtle'];
    const seed = id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    return `${prefixes[seed % prefixes.length]} ${animals[(seed * 7) % animals.length]}`;
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

async function loadCommunityHome() {
    if (!currentUser) return;

    const petNameEl = document.getElementById('petNameDisplay');
    if (petNameEl) petNameEl.textContent = getCurrentPetName();

    await loadCommunityPosts();
    renderCommunityFeed();
    syncVolunteerRequestStatus();

    // Check for pending feedback after volunteer release
    checkPendingFeedback();
}

async function submitFeelingPost() {
    const input = document.getElementById('feelingPostInput');
    if (!input || !currentUser) return;

    const text = input.value.trim();
    if (!text) {
        showToast('Please write your feeling before posting.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/feed/posts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.user_id, caption: text })
        });
        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || 'Unable to create post.', 'error');
            return;
        }
    } catch (error) {
        showToast('Unable to create post.', 'error');
        return;
    }

    input.value = '';
    const counter = document.getElementById('feelingCharCount');
    if (counter) counter.textContent = '0 / 300';

    await loadCommunityPosts();
    renderCommunityFeed();
    showToast('Your feeling was posted anonymously.', 'success');
}

async function addCommentToPost(postId) {
    const commentInput = document.getElementById(`commentInput-${postId}`);
    if (!commentInput || !currentUser) return;

    const text = commentInput.value.trim();
    if (!text) {
        showToast('Comment cannot be empty.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/feed/posts/${postId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.user_id, comment: text })
        });
        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || 'Unable to add comment.', 'error');
            return;
        }
    } catch (error) {
        showToast('Unable to add comment.', 'error');
        return;
    }

    commentInput.value = '';
    await loadCommunityPosts();
    renderCommunityFeed();
}

function seedCommunityPosts() {
    showToast('Sample seeding is disabled in database mode. Create a real post instead.', 'info');
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
                    <button onclick="addCommentToPost('${post.id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">Comment</button>
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
                const volStr = data.volunteer_name ? ` with ${data.volunteer_name}` : '';
                showToast(`Volunteer request sent successfully${volStr}.`, 'success');
            }
            setVolunteerRequestUIState(true, data.request || { requested_at: new Date().toISOString(), volunteer_name: data.volunteer_name });
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
        const volStr = requestData && requestData.volunteer_name ? ` with ${requestData.volunteer_name}` : '';
        statusEl.classList.remove('hidden');
        statusEl.textContent = `Volunteer request active${volStr} (requested ${requestedAt}).`;
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
    const dates = moodHistory.slice(-7).map(m => formatPostDate(m.timestamp));
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
                    y: { beginAtZero: true, max: 5, ticks: { stepSize: 1, callback: (v) => ['Stressed', 'Sad', 'Anxious', 'Neutral', 'Calm', 'Happy'][v] || '', font: { size: 12 }, padding: 8 }, grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false } },
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
        happy: 'from-yellow-50 to-amber-50 border-yellow-300',
        sad: 'from-blue-50 to-indigo-50 border-blue-300',
        stressed: 'from-red-50 to-rose-50 border-red-300',
        anxious: 'from-orange-50 to-amber-50 border-orange-300',
        calm: 'from-green-50 to-emerald-50 border-green-300'
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
                const time = formatPostTime(mood.timestamp);
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

function getSecureChatHash(messages) {
    return JSON.stringify((messages || []).map((m) => `${m.sender_role}|${m.timestamp}|${m.text}`));
}

function stopUserSecureChatPolling() {
    if (userSecureChatPollTimer) {
        clearInterval(userSecureChatPollTimer);
        userSecureChatPollTimer = null;
    }
}

function stopVolunteerSecureChatPolling() {
    if (volunteerSecureChatPollTimer) {
        clearInterval(volunteerSecureChatPollTimer);
        volunteerSecureChatPollTimer = null;
    }
}

function stopAllSecureChatPolling() {
    stopUserSecureChatPolling();
    stopVolunteerSecureChatPolling();
}

function startUserSecureChatPolling() {
    if (userSecureChatPollTimer || !currentUser || currentUser.role !== 'user') return;
    userSecureChatPollTimer = setInterval(async () => {
        const messagingPage = document.getElementById('messaging');
        if (!messagingPage || messagingPage.classList.contains('hidden')) return;
        await loadUserVolunteerSecureChat(true);
    }, 2500);
}

function startVolunteerSecureChatPolling() {
    if (volunteerSecureChatPollTimer || !currentUser || currentUser.role !== 'volunteer') return;
    volunteerSecureChatPollTimer = setInterval(async () => {
        const volunteerPage = document.getElementById('volunteer-dashboard');
        if (!volunteerPage || volunteerPage.classList.contains('hidden')) return;
        await loadVolunteerHandlingUsers();
        if (selectedVolunteerSecureUserId) {
            await fetchVolunteerSecureChatMessages(selectedVolunteerSecureUserId, true);
        }
    }, 2500);
}

async function initChatSection() {
    // Restore chat history from server on section open
    if (!currentUser) return;

    // Reset to AI chat mode on init
    currentChatMode = 'ai';
    showAIChat();

    // Recover handoff context if chat opened after a delayed navigation.
    if (!quizResultData) {
        const storedQuizData = getStoredQuizResultContext();
        if (storedQuizData) {
            quizResultData = storedQuizData;
        }
    }

    // If quiz results are available, inject them as context (skip normal chat history)
    if (quizResultData) {
        injectQuizDataIntoChatbot();
        quizResultData = null; // Clear after using
        clearStoredQuizResultContext();
    } else {
        // Otherwise, load regular chat history with default greeting
        loadChatHistory();
    }

    if (currentUser.role === 'user') {
        // Await volunteer chat check so userAssignedVolunteerId is set before showing toggle
        await loadUserVolunteerSecureChat();
        checkAndShowVolunteerChatButton();
        startUserSecureChatPolling();

        // Check for pending feedback
        checkPendingFeedback();
    }
}

function switchChatMode(mode) {
    currentChatMode = mode;
    if (mode === 'ai') {
        showAIChat();
    } else if (mode === 'volunteer') {
        showVolunteerChat();
    }
}

function showAIChat() {
    const aiBox = document.getElementById('aiChatBox');
    const volunteerBox = document.getElementById('volunteerChatBox');
    const aiBtn = document.getElementById('aiChatBtn');
    const volunteerBtn = document.getElementById('volunteerChatBtn');

    if (aiBox) aiBox.classList.remove('hidden');
    if (volunteerBox) volunteerBox.classList.add('hidden');
    if (aiBtn) {
        aiBtn.classList.remove('bg-gray-100', 'text-gray-600');
        aiBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700', 'text-white');
    }
    if (volunteerBtn) {
        volunteerBtn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700', 'text-white');
        volunteerBtn.classList.add('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
    }
}

function showVolunteerChat() {
    const aiBox = document.getElementById('aiChatBox');
    const volunteerBox = document.getElementById('volunteerChatBox');
    const aiBtn = document.getElementById('aiChatBtn');
    const volunteerBtn = document.getElementById('volunteerChatBtn');

    if (aiBox) aiBox.classList.add('hidden');
    if (volunteerBox) volunteerBox.classList.remove('hidden');
    if (aiBtn) {
        aiBtn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700', 'text-white');
        aiBtn.classList.add('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
    }
    if (volunteerBtn) {
        volunteerBtn.classList.remove('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
        volunteerBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700', 'text-white');
    }
}

function checkAndShowVolunteerChatButton() {
    const volunteerBtn = document.getElementById('volunteerChatBtn');

    if (!volunteerBtn) return;

    // Check if user has an assigned volunteer
    if (userAssignedVolunteerId) {
        volunteerBtn.classList.remove('hidden');
        volunteerBtn.classList.add('flex');
    } else {
        volunteerBtn.classList.add('hidden');
        volunteerBtn.classList.remove('flex');
    }
}

async function injectQuizDataIntoChatbot() {
    if (!quizResultData) return;

    const { score, feedback } = quizResultData;
    const container = document.getElementById('messageContainer');
    if (!container) return;

    // Clear greeting and show quiz summary card
    container.innerHTML = '';

    // Build a human-readable summary of quiz results
    let summaryLines = [];
    summaryLines.push(`Score: ${score}%`);
    summaryLines.push(`Category: ${feedback.category || 'Evaluated'}`);
    summaryLines.push(`Mood: ${feedback.mood || 'Neutral'}`);
    if (feedback.personalityType) summaryLines.push(`Personality: ${feedback.personalityType}`);
    if (feedback.strengths && feedback.strengths.length > 0) {
        summaryLines.push(`\nStrengths:\n` + feedback.strengths.map(s => `✓ ${s}`).join('\n'));
    }
    if (feedback.weaknesses && feedback.weaknesses.length > 0) {
        summaryLines.push(`\nAreas for Growth:\n` + feedback.weaknesses.map(w => `• ${w}`).join('\n'));
    }
    if (feedback.suggestions && feedback.suggestions.length > 0) {
        summaryLines.push(`\nAI Suggestions:\n` + feedback.suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n'));
    }
    const summaryText = summaryLines.join('\n');

    // Add quiz results card in chat
    const contextDiv = document.createElement('div');
    contextDiv.className = 'flex items-start gap-3';
    contextDiv.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">📊</div>
        <div class="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl rounded-tl-none px-5 py-4 max-w-sm shadow-sm">
            <p class="text-indigo-700 text-sm font-bold mb-2">📋 Your Quiz Report</p>
            <p class="text-gray-700 text-xs whitespace-pre-wrap leading-relaxed font-mono">${escapeHtml(summaryText)}</p>
        </div>
    `;
    container.appendChild(contextDiv);
    container.scrollTop = container.scrollHeight;

    // Show typing indicator while AI generates personalized welcome
    setTypingIndicator(true);

    try {
        // Build rich prompt for Mistral with full quiz data
        const aiPrompt = `The user just completed a mental health assessment quiz. Here are their full results:\n\n${summaryText}\n\nBased on these results, provide a warm, empathetic, and personalized opening message as Nyxie. Acknowledge their specific score, mood, and at least one strength. Be supportive about the areas for growth. Ask them what they'd like to work on or talk about. Keep the response concise (3-4 sentences max).`;

        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser ? currentUser.user_id : null,
                message: aiPrompt,
                isJournalingMode: false,
                skipHistory: true  // Don't save this context prompt to chat history
            })
        });
        const data = await response.json();
        setTypingIndicator(false);

        let welcomeText = '';
        if (response.ok && data.ai_response && data.ai_response.text) {
            welcomeText = data.ai_response.text;
        } else {
            // Fallback to local generation if API fails
            welcomeText = generateMoodBasedResponse(score, feedback);
        }

        const aiResponseDiv = document.createElement('div');
        aiResponseDiv.className = 'flex items-start gap-3';
        aiResponseDiv.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">N</div>
            <div class="bg-indigo-50 border border-indigo-100 rounded-2xl rounded-tl-none px-4 py-3 max-w-sm shadow-sm">
                <p class="text-gray-800 text-sm">${escapeHtml(welcomeText)}</p>
            </div>
        `;
        container.appendChild(aiResponseDiv);
        container.scrollTop = container.scrollHeight;
    } catch (error) {
        setTypingIndicator(false);
        console.error('Error getting AI welcome from quiz data:', error);
        // Show fallback local response
        const fallbackText = generateMoodBasedResponse(score, feedback);
        const fallbackDiv = document.createElement('div');
        fallbackDiv.className = 'flex items-start gap-3';
        fallbackDiv.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">N</div>
            <div class="bg-indigo-50 border border-indigo-100 rounded-2xl rounded-tl-none px-4 py-3 max-w-sm shadow-sm">
                <p class="text-gray-800 text-sm">${escapeHtml(fallbackText)}</p>
            </div>
        `;
        container.appendChild(fallbackDiv);
        container.scrollTop = container.scrollHeight;
    }
}

function generateMoodBasedResponse(score, feedback) {
    let response = '';
    const mood = (feedback.mood || 'neutral').toLowerCase();
    const category = (feedback.category || 'general').toLowerCase();

    // Generate personalized response based on mood and score
    if (score >= 80) {
        response = `Great results! 🎉 You're managing well overall. Let's focus on strengthening those areas you mentioned and building resilience in the weak spots.`;
    } else if (score >= 60) {
        response = `You're doing okay, and that's a good starting point. I see you have solid strengths to build on. Let's work together to address the areas for growth you identified.`;
    } else if (score >= 40) {
        response = `I can see you're facing some challenges right now. The good news is that you've already shown some strengths. Let's focus on one thing at a time to help you feel better.`;
    } else {
        response = `I hear that you're going through a tough time. Please know I'm here to listen and support you. Let's start by talking through what's bothering you most.`;
    }

    // Add mood-specific tone
    if (mood === 'anxious' || mood === 'stress') {
        response += ` 😰 It sounds like anxiety is present. Let's explore some calming strategies together.`;
    } else if (mood === 'sad' || mood === 'depressed') {
        response += ` 💙 I sense sadness in your feedback. Remember, these feelings are valid, and we can work through them together.`;
    } else if (mood === 'happy' || mood === 'positive') {
        response += ` 😊 It's wonderful to see positive energy! Let's maintain this momentum.`;
    } else if (mood === 'overwhelmed') {
        response += ` 🌊 Feeling overwhelmed is completely normal. Let's break things down into manageable steps.`;
    }

    response += ` What would you like to talk about first?`;

    return response;
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
    // Analyze mood from the conversation before clearing it
    let moodData = null;
    try {
        const analyzeRes = await fetch(`${API_BASE}/chat/analyze-mood`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.user_id, session_id: 'default' })
        });
        const analyzeResult = await analyzeRes.json();
        if (analyzeRes.ok && analyzeResult.analyzed && analyzeResult.saved) {
            moodData = analyzeResult;
        }
    } catch (e) {
        console.warn('Mood analysis before new session failed:', e);
    }

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

    if (moodData && moodData.mood_entry) {
        showChatMoodInsight(moodData);
        showToast('Mood updated from your conversation 💜', 'success');
    } else {
        showToast('New session started', 'success');
    }
}

function showChatMoodInsight(moodData) {
    // Remove any existing insight card
    const existing = document.getElementById('chatMoodInsight');
    if (existing) existing.remove();

    const mood = moodData.mood_entry;
    const classifier = moodData.classifier || {};
    const moodName = (mood.mood || 'neutral').charAt(0).toUpperCase() + (mood.mood || 'neutral').slice(1);
    const dominantEmotion = classifier.dominant_emotion || mood.mood;
    const sentimentScore = classifier.sentiment_score != null ? classifier.sentiment_score : 0;
    const sentimentLabel = sentimentScore > 0.3 ? 'Positive' : sentimentScore < -0.3 ? 'Negative' : 'Neutral';
    const sentimentColor = sentimentScore > 0.3 ? '#22c55e' : sentimentScore < -0.3 ? '#ef4444' : '#f59e0b';
    const sourceLabel = classifier.source === 'mistral' ? 'Mistral AI' : 'Keyword Analysis';

    // Build emotion tags
    const emotionTags = (classifier.emotions || []).slice(0, 3).map(e => {
        const emotionName = e.label.charAt(0).toUpperCase() + e.label.slice(1);
        const pct = Math.round((e.score || 0) * 100);
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style="background: ${mood.color}22; color: ${mood.color}; border: 1px solid ${mood.color}44;">${emotionName} ${pct}%</span>`;
    }).join('');

    const insightCard = document.createElement('div');
    insightCard.id = 'chatMoodInsight';
    insightCard.style.cssText = 'opacity: 0; transform: translateY(-12px); transition: all 0.5s cubic-bezier(0.16,1,0.3,1);';
    insightCard.innerHTML = `
        <div class="mx-auto max-w-sm mb-4 rounded-2xl overflow-hidden shadow-lg border" style="border-color: ${mood.color}44; background: linear-gradient(135deg, ${mood.color}08, ${mood.color}18);">
            <div class="px-4 py-3">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-2xl">${mood.emoji}</span>
                        <div>
                            <p class="text-sm font-bold text-gray-800">Mood Detected: ${moodName}</p>
                            <p class="text-xs text-gray-500">from your conversation • ${sourceLabel}</p>
                        </div>
                    </div>
                    <button onclick="document.getElementById('chatMoodInsight').remove()" class="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
                </div>
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-xs font-semibold px-2 py-0.5 rounded-full" style="background: ${sentimentColor}20; color: ${sentimentColor};">${sentimentLabel} (${sentimentScore > 0 ? '+' : ''}${sentimentScore.toFixed(2)})</span>
                    <span class="text-xs text-gray-400">•</span>
                    <span class="text-xs text-gray-500">Dominant: ${dominantEmotion}</span>
                </div>
                ${emotionTags ? `<div class="flex flex-wrap gap-1 mb-2">${emotionTags}</div>` : ''}
                <div class="flex items-center gap-2 mt-2">
                    <button onclick="navigateTo('mood-tracker')" class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition">📊 View Mood Tracker →</button>
                </div>
            </div>
        </div>
    `;

    const container = document.getElementById('messageContainer');
    if (container) {
        container.insertBefore(insightCard, container.firstChild);
        // Animate in
        requestAnimationFrame(() => {
            insightCard.style.opacity = '1';
            insightCard.style.transform = 'translateY(0)';
        });
        // Auto-dismiss after 6 seconds
        setTimeout(() => {
            insightCard.style.opacity = '0';
            insightCard.style.transform = 'translateY(-12px)';
            setTimeout(() => insightCard.remove(), 500);
        }, 6000);
    }
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

async function loadUserVolunteerSecureChat(isPolling = false) {
    if (!currentUser || currentUser.role !== 'user') return;

    try {
        const response = await fetch(`${API_BASE}/secure-chat/user/${currentUser.user_id}`);
        const data = await response.json();

        if (response.status === 404 && data && data.error === 'User not found') {
            handleInvalidSession();
            return;
        }

        if (!response.ok || !data.connected) {
            userAssignedVolunteerId = null;
            lastUserSecureChatHash = '';
            checkAndShowVolunteerChatButton();
            return;
        }

        // Volunteer is assigned — update state and show toggle button
        userAssignedVolunteerId = data.volunteer_id;
        checkAndShowVolunteerChatButton();

        const status = document.getElementById('userVolunteerChatStatus');
        if (status) status.textContent = `Connected with ${data.volunteer_name || 'Volunteer'}`;

        const nextHash = getSecureChatHash(data.messages || []);
        if (!isPolling || nextHash !== lastUserSecureChatHash) {
            renderUserVolunteerSecureMessages(data.messages || []);
            lastUserSecureChatHash = nextHash;
        }
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

    await loadCommunityPosts();
    renderVolunteerCommunityFeed();

    await loadVolunteerHandlingUsers();

    try {
        const response = await fetch(`${API_BASE}/volunteer/users-needing-help/${currentUser.user_id}`);
        const data = await response.json();
        if (response.ok) {
            latestUsersNeedingHelp = data.users || [];
            renderVolunteerUsersNeedingHelp();
        }
    } catch (error) {
        showToast('Error loading users', 'error');
    }

    startVolunteerSecureChatPolling();
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
        const displayName = user.name || anonymizeUserLabel(user.user_id);
        return `
            <div class="bg-purple-50 rounded-xl p-4 border border-purple-100">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <p class="text-lg font-semibold text-gray-800">${escapeHtml(displayName)}</p>
                    </div>
                    <span class="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-semibold">${escapeHtml(user.stress_level)}</span>
                </div>
                <p class="text-sm text-gray-600 mb-3">Last quiz: ${new Date(user.last_quiz_date).toLocaleDateString()}</p>
                <p class="text-xs inline-block bg-purple-100 text-purple-700 px-2 py-1 rounded-full mb-2">${sourceLabel}</p>
                ${requestNote}
                <div class="flex gap-2 mt-3">
                    <button onclick="viewVolunteerUserProfile('${user.user_id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition text-sm font-semibold">View Profile</button>
                    <button ${alreadyHandling ? 'disabled' : ''} onclick="startHandlingUser('${user.user_id}')" class="${alreadyHandling ? 'bg-gray-300 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'} text-white px-4 py-2 rounded-lg transition text-sm font-semibold">
                        ${alreadyHandling ? 'Already Handling' : 'Start Handling'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function closeVolunteerUserProfile() {
    const panel = document.getElementById('volunteerUserProfilePanel');
    if (panel) panel.classList.add('hidden');
}

async function viewVolunteerUserProfile(userId) {
    if (!currentUser || currentUser.role !== 'volunteer') return;

    const panel = document.getElementById('volunteerUserProfilePanel');
    const header = document.getElementById('volunteerUserProfileHeader');
    const content = document.getElementById('volunteerUserProfileContent');
    if (!panel || !header || !content) return;

    panel.classList.remove('hidden');
    header.textContent = 'User Profile & Risk Report';
    content.innerHTML = '<p class="text-gray-500">Loading profile...</p>';

    try {
        const response = await fetch(`${API_BASE}/volunteer/user-profile/${currentUser.user_id}/${userId}`);
        const data = await response.json();

        if (!response.ok) {
            content.innerHTML = `<p class="text-red-600">${escapeHtml(data.error || 'Unable to load user profile.')}</p>`;
            return;
        }

        const user = data.user || {};
        const request = data.request;
        const mood = data.mood || {};
        const quiz = data.quiz || {};
        const latestQuiz = quiz.latest || null;
        const chatSessions = data.chat_sessions || [];
        const aiSummaries = data.ai_summaries || [];
        const overallRisk = data.overall_risk || { level: 'Low', factors: [] };
        const displayName = user.name || anonymizeUserLabel(user.user_id || userId);

        const moodCounts = mood.mood_counts || {};
        const moodSummary = Object.keys(moodCounts).length
            ? Object.entries(moodCounts).map(([m, c]) => `${m}: ${c}`).join(' | ')
            : 'No mood entries yet';

        const requestSummary = request
            ? `Status: ${request.status}${request.requested_at ? ` | Requested: ${formatPostTime(request.requested_at)}` : ''}${request.note ? ` | Note: ${escapeHtml(request.note)}` : ''}`
            : 'No active volunteer request';

        // Risk badge colors
        const riskColors = { High: 'bg-red-100 text-red-700 border-red-300', Medium: 'bg-amber-100 text-amber-700 border-amber-300', Low: 'bg-green-100 text-green-700 border-green-300' };
        const riskBadgeClass = riskColors[overallRisk.level] || riskColors.Low;
        const riskFactorLabels = {
            negative_mood: '😔 Negative mood logged',
            high_quiz_stress: '📊 High quiz stress',
            negative_chat_sentiment: '💬 Negative chat sentiment',
            open_support_request: '🔴 Open support request'
        };

        // Chat session cards
        const chatSessionsHtml = chatSessions.length
            ? chatSessions.map(s => {
                const sentimentColor = s.sentiment_score > 0.3 ? '#22c55e' : s.sentiment_score < -0.3 ? '#ef4444' : '#f59e0b';
                const emotionTags = (s.emotion_tags || []).slice(0, 3).map(e => {
                    const label = typeof e === 'string' ? e : (e.label || '');
                    return `<span class="inline-block px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 mr-1">${escapeHtml(label)}</span>`;
                }).join('');
                return `<div class="bg-white border border-gray-200 rounded-lg p-3 mb-2">
                    <div class="flex items-center justify-between mb-1">
                        <span class="font-semibold text-sm text-gray-800">${escapeHtml(s.dominant_emotion || 'neutral')}</span>
                        <span class="text-xs font-semibold px-2 py-0.5 rounded-full" style="background: ${sentimentColor}20; color: ${sentimentColor};">Score: ${(s.sentiment_score || 0).toFixed(2)}</span>
                    </div>
                    <div class="mb-1">${emotionTags}</div>
                    <p class="text-xs text-gray-500">${s.analyzed_at ? formatPostTime(s.analyzed_at) : ''}</p>
                    ${s.transcript_preview ? `<p class="text-xs text-gray-400 mt-1 italic">"${escapeHtml(s.transcript_preview)}..."</p>` : ''}
                </div>`;
            }).join('')
            : '<p class="text-sm text-gray-500">No chat sessions analyzed yet</p>';

        // AI summaries cards
        const aiSummariesHtml = aiSummaries.length
            ? aiSummaries.map(s => {
                const riskLabel = s.risk_level || s.category || 'Unknown';
                const riskColor = riskLabel === 'Good' ? 'text-green-600' : riskLabel === 'Needs Support' ? 'text-red-600' : 'text-amber-600';
                return `<div class="bg-white border border-gray-200 rounded-lg p-3 mb-2">
                    <div class="flex items-center justify-between mb-1">
                        <span class="font-semibold text-sm ${riskColor}">${escapeHtml(riskLabel)}</span>
                        <span class="text-xs text-gray-500">${s.created_at ? formatPostTime(s.created_at) : ''}</span>
                    </div>
                    ${s.mood ? `<p class="text-sm text-gray-700">Mood: ${escapeHtml(s.mood)}</p>` : ''}
                    ${s.strengths ? `<p class="text-xs text-gray-600">Strengths: ${s.strengths.map(st => escapeHtml(st)).join(', ')}</p>` : ''}
                    ${s.weaknesses ? `<p class="text-xs text-gray-600">Weaknesses: ${s.weaknesses.map(w => escapeHtml(w)).join(', ')}</p>` : ''}
                    ${s.suggestions ? `<p class="text-xs text-gray-500 mt-1">💡 ${s.suggestions.map(sg => escapeHtml(sg)).join(' | ')}</p>` : ''}
                </div>`;
            }).join('')
            : '<p class="text-sm text-gray-500">No quiz summaries yet</p>';

        content.innerHTML = `
            <!-- Overall Risk Banner -->
            <div class="mb-4 p-4 rounded-xl border-2 ${riskBadgeClass}">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-xs font-semibold mb-1">Overall Risk Assessment</p>
                        <p class="text-2xl font-bold">${overallRisk.level}</p>
                    </div>
                    <div class="text-4xl">${overallRisk.level === 'High' ? '🔴' : overallRisk.level === 'Medium' ? '🟡' : '🟢'}</div>
                </div>
                ${overallRisk.factors.length ? `<div class="mt-2 flex flex-wrap gap-1">${overallRisk.factors.map(f => `<span class="text-xs px-2 py-0.5 rounded-full bg-white bg-opacity-60">${riskFactorLabels[f] || f}</span>`).join('')}</div>` : ''}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div class="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                    <p class="text-xs text-indigo-700 font-semibold mb-1">Identity</p>
                    <p class="text-gray-800 font-bold">${escapeHtml(displayName)}</p>
                    <p class="text-sm text-gray-600">Role: ${escapeHtml(user.role || 'user')}</p>
                </div>
                <div class="bg-purple-50 rounded-xl p-4 border border-purple-100">
                    <p class="text-xs text-purple-700 font-semibold mb-1">Volunteer Request</p>
                    <p class="text-sm text-gray-700">${requestSummary}</p>
                </div>
                <div class="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                    <p class="text-xs text-emerald-700 font-semibold mb-1">Mood Snapshot</p>
                    <p class="text-gray-800">Current: ${(mood.current_mood && mood.current_mood.mood) ? escapeHtml(mood.current_mood.mood) : 'neutral'}</p>
                    <p class="text-sm text-gray-600">Total moods: ${mood.total_moods || 0}</p>
                    <p class="text-sm text-gray-600">${escapeHtml(moodSummary)}</p>
                </div>
                <div class="bg-amber-50 rounded-xl p-4 border border-amber-100">
                    <p class="text-xs text-amber-700 font-semibold mb-1">Latest Quiz</p>
                    ${latestQuiz
                ? `<p class="text-sm text-gray-700">Stress: ${escapeHtml(latestQuiz.stress_level || 'Unknown')}</p>
                           <p class="text-sm text-gray-700">Score: ${escapeHtml(String(latestQuiz.score ?? '-'))}</p>
                           <p class="text-sm text-gray-600">${escapeHtml(latestQuiz.recommendation || '')}</p>`
                : '<p class="text-sm text-gray-600">No quiz data yet</p>'
            }
                </div>
            </div>

            <!-- Chat Session History -->
            <div class="mb-4">
                <h4 class="text-lg font-bold text-gray-800 mb-2">💬 Chat Emotion History</h4>
                <div class="bg-gray-50 rounded-xl p-3 border border-gray-200 max-h-48 overflow-y-auto">
                    ${chatSessionsHtml}
                </div>
            </div>

            <!-- AI Quiz Summaries -->
            <div class="mb-4">
                <h4 class="text-lg font-bold text-gray-800 mb-2">📊 Quiz AI Summaries</h4>
                <div class="bg-gray-50 rounded-xl p-3 border border-gray-200 max-h-48 overflow-y-auto">
                    ${aiSummariesHtml}
                </div>
            </div>
        `;
    } catch (error) {
        content.innerHTML = '<p class="text-red-600">Error loading user profile.</p>';
    }
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
                    <p class="text-xs text-gray-600">${escapeHtml(user.stress_level)}</p>
                    <p class="text-xs text-gray-500 mt-1">Assigned: ${formatPostTime(user.assigned_at)}</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="openVolunteerSecureChat('${user.user_id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-semibold">Secure Chat</button>
                    <button onclick="stopHandlingUser('${user.user_id}')" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded-lg text-xs font-semibold">Release</button>
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
    lastVolunteerSecureChatHash = '';
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

async function fetchVolunteerSecureChatMessages(userId, isPolling = false) {
    try {
        const response = await fetch(`${API_BASE}/secure-chat/volunteer/${currentUser.user_id}/${userId}`);
        const data = await response.json();
        if (!response.ok) {
            if (!isPolling) {
                showToast(data.error || 'Unable to load secure chat.', 'error');
            }
            return false;
        }

        const nextHash = getSecureChatHash(data.messages || []);
        if (!isPolling || nextHash !== lastVolunteerSecureChatHash) {
            renderVolunteerSecureMessages(data.messages || []);
            lastVolunteerSecureChatHash = nextHash;
        }
        return true;
    } catch (error) {
        if (!isPolling) {
            showToast('Unable to load secure chat.', 'error');
        }
        return false;
    }
}

async function openVolunteerSecureChat(userId) {
    if (!currentUser || currentUser.role !== 'volunteer') return;
    selectedVolunteerSecureUserId = userId;
    lastVolunteerSecureChatHash = '';

    const header = document.getElementById('volunteerSecureChatHeader');
    const input = document.getElementById('volunteerSecureChatInput');
    const sendBtn = document.getElementById('volunteerSecureChatSendBtn');
    const user = volunteerHandlingUsers.find(u => u.user_id === userId);
    if (header) header.textContent = user ? `Secure chat with ${user.name}` : 'Secure chat with assigned user';
    if (input) input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;

    await fetchVolunteerSecureChatMessages(userId, false);
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

async function submitVolunteerPost() {
    const input = document.getElementById('volunteerPostInput');
    if (!input || !currentUser) return;

    const text = input.value.trim();
    if (!text) {
        showToast('Please write a message before posting.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/feed/posts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.user_id, caption: text })
        });
        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || 'Unable to publish post.', 'error');
            return;
        }
    } catch (error) {
        showToast('Unable to publish post.', 'error');
        return;
    }

    input.value = '';

    const counter = document.getElementById('volunteerPostCharCount');
    if (counter) counter.textContent = '0 / 280';

    await loadCommunityPosts();
    renderVolunteerCommunityFeed();
    showToast('Volunteer post published.', 'success');
}

async function volunteerReplyToPost(postId) {
    const input = document.getElementById(`volunteerReplyInput-${postId}`);
    if (!input || !currentUser) return;

    const text = input.value.trim();
    if (!text) {
        showToast('Reply cannot be empty.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/feed/posts/${postId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.user_id, comment: text })
        });
        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || 'Unable to send reply.', 'error');
            return;
        }
    } catch (error) {
        showToast('Unable to send reply.', 'error');
        return;
    }

    input.value = '';
    await loadCommunityPosts();
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
                    <button onclick="volunteerReplyToPost('${post.id}')" class="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-sm">Reply</button>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== Admin Dashboard ====================

// ==================== Admin: Tab Management ====================

let adminSSESource = null;
let adminNotifications = [];

function switchAdminTab(tab) {
    ['analytics', 'users', 'approvals', 'volunteers', 'rankings'].forEach(t => {
        const content = document.getElementById('adminTabContent-' + t);
        const btn = document.getElementById('adminTab-' + t);
        if (content) content.classList.toggle('hidden', t !== tab);
        if (btn) {
            if (t === tab) {
                btn.classList.remove('bg-gray-100', 'text-gray-600');
                btn.classList.add('bg-orange-500', 'text-white');
            } else {
                btn.classList.remove('bg-orange-500', 'text-white');
                btn.classList.add('bg-gray-100', 'text-gray-600');
            }
        }
    });
    if (tab === 'users') loadAdminUsers();
    if (tab === 'approvals') loadPendingVolunteers();
    if (tab === 'volunteers') loadAdminVolunteers();
    if (tab === 'rankings') loadVolunteerRankings();
}

// ==================== Admin: Dashboard Load ====================

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
            loadAgeGroupChart(data.age_group_breakdown);
            loadRegionChart(data.region_breakdown);
        }
    } catch (error) {
        showToast('Error loading analytics', 'error');
    }
    startAdminSSE();
}

// ==================== Admin: Real-time Notifications (SSE) ====================

function startAdminSSE() {
    if (adminSSESource) return;
    try {
        adminSSESource = new EventSource(`${API_BASE}/admin/notifications/stream`);
        adminSSESource.addEventListener('new_account', (e) => {
            const payload = JSON.parse(e.data);
            addAdminNotification(payload);
        });
        adminSSESource.onerror = () => {};
    } catch (err) {
        console.warn('SSE not available:', err);
    }
}

function stopAdminSSE() {
    if (adminSSESource) { adminSSESource.close(); adminSSESource = null; }
}

function addAdminNotification(payload) {
    adminNotifications.unshift(payload);
    renderAdminNotifications();
    const roleIcon = payload.role === 'volunteer' ? '🤝' : payload.role === 'admin' ? '⚙️' : '👤';
    showToast(`${roleIcon} New ${payload.role} account: ${payload.name || 'Unknown'}`, 'info');
}

function renderAdminNotifications() {
    const badge = document.getElementById('adminNotifBadge');
    const list = document.getElementById('adminNotifList');
    if (!badge || !list) return;
    const count = adminNotifications.length;
    if (count > 0) {
        badge.classList.remove('hidden');
        badge.textContent = count > 99 ? '99+' : count;
    } else {
        badge.classList.add('hidden');
    }
    if (count === 0) {
        list.innerHTML = '<p class="text-gray-400 text-sm p-4 text-center">No notifications yet</p>';
        return;
    }
    list.innerHTML = adminNotifications.map(n => {
        const time = new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const roleIcon = n.role === 'volunteer' ? '🤝' : n.role === 'admin' ? '⚙️' : '👤';
        return `<div class="p-3">
            <div class="flex items-center gap-2">
                <span class="text-lg">${roleIcon}</span>
                <div>
                    <p class="text-sm font-semibold text-gray-800">${n.name || 'Unknown'}</p>
                    <p class="text-xs text-gray-400">${n.role} · ${time}</p>
                </div>
            </div>
        </div>`;
    }).join('');
}

function toggleAdminNotificationPanel() {
    const panel = document.getElementById('adminNotifPanel');
    if (panel) panel.classList.toggle('hidden');
}

function clearAdminNotifications() {
    adminNotifications = [];
    renderAdminNotifications();
    const panel = document.getElementById('adminNotifPanel');
    if (panel) panel.classList.add('hidden');
}

// ==================== Admin: Volunteer Management ====================

async function loadAdminVolunteers() {
    const container = document.getElementById('adminVolunteerList');
    if (!container) return;
    container.innerHTML = '<p class="text-gray-400 text-center py-8">Loading...</p>';
    try {
        const res = await fetch(`${API_BASE}/admin/volunteers`);
        const data = await res.json();
        if (!res.ok) { container.innerHTML = `<p class="text-red-500 p-4">${data.error}</p>`; return; }
        const volunteers = data.volunteers || [];
        if (volunteers.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-8">No volunteers yet. Add one above.</p>';
            return;
        }
        container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead>
                    <tr class="bg-gray-50 text-gray-500 uppercase text-xs">
                        <th class="px-4 py-3 text-left rounded-l-lg">#</th>
                        <th class="px-4 py-3 text-left">Name</th>
                        <th class="px-4 py-3 text-left">ID</th>
                        <th class="px-4 py-3 text-right rounded-r-lg">Action</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    ${volunteers.map((v, i) => `
                    <tr class="hover:bg-gray-50 transition-colors">
                        <td class="px-4 py-3 text-gray-400">${i + 1}</td>
                        <td class="px-4 py-3 font-semibold text-gray-800">🤝 ${v.dummy_name || 'Unnamed'}</td>
                        <td class="px-4 py-3 text-gray-400 font-mono text-xs">${v.id}</td>
                        <td class="px-4 py-3 text-right">
                            <button onclick="adminRemoveVolunteer('${v.id}', '${v.dummy_name}')" class="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1 rounded-lg text-xs font-semibold transition-all">🗑 Remove</button>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
    } catch (err) {
        container.innerHTML = '<p class="text-red-500 p-4">Error loading volunteers.</p>';
    }
}

async function adminAddVolunteer() {
    const name = document.getElementById('newVolName')?.value?.trim();
    const email = document.getElementById('newVolEmail')?.value?.trim();
    const password = document.getElementById('newVolPassword')?.value?.trim();
    if (!name || !email || !password) { showToast('Please fill in all fields.', 'error'); return; }
    try {
        const res = await fetch(`${API_BASE}/admin/volunteers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(`Volunteer ${name} added successfully!`, 'success');
            document.getElementById('newVolName').value = '';
            document.getElementById('newVolEmail').value = '';
            document.getElementById('newVolPassword').value = '';
            loadAdminVolunteers();
        } else {
            showToast(data.error || 'Failed to add volunteer.', 'error');
        }
    } catch (err) {
        showToast('Error adding volunteer.', 'error');
    }
}

async function adminRemoveVolunteer(volunteerId, name) {
    if (!confirm(`Remove volunteer "${name}"? This cannot be undone.`)) return;
    try {
        const res = await fetch(`${API_BASE}/admin/volunteers/${volunteerId}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
            showToast(`Volunteer ${name} removed.`, 'success');
            loadAdminVolunteers();
        } else {
            showToast(data.error || 'Failed to remove volunteer.', 'error');
        }
    } catch (err) {
        showToast('Error removing volunteer.', 'error');
    }
}

// ==================== Admin: Volunteer Rankings ====================

async function loadVolunteerRankings() {
    const container = document.getElementById('adminRankingsList');
    if (!container) return;
    container.innerHTML = '<p class="text-gray-400 text-center py-8">Calculating rankings...</p>';
    try {
        const res = await fetch(`${API_BASE}/admin/volunteer-rankings`);
        const data = await res.json();
        if (!res.ok) { container.innerHTML = `<p class="text-red-500 p-4">${data.error}</p>`; return; }
        const rankings = data.rankings || [];
        if (rankings.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-8">No volunteers to rank yet.</p>';
            return;
        }
        const badgeColors = {
            green: 'bg-green-100 text-green-700',
            yellow: 'bg-yellow-100 text-yellow-700',
            red: 'bg-red-100 text-red-700',
            grey: 'bg-gray-100 text-gray-500'
        };
        const rankIcons = ['🥇', '🥈', '🥉'];
        container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead>
                    <tr class="bg-gray-50 text-gray-500 uppercase text-xs">
                        <th class="px-4 py-3 text-left rounded-l-lg">Rank</th>
                        <th class="px-4 py-3 text-left">Volunteer</th>
                        <th class="px-4 py-3 text-center">Students</th>
                        <th class="px-4 py-3 text-center">👍 Positive</th>
                        <th class="px-4 py-3 text-center">👎 Negative</th>
                        <th class="px-4 py-3 text-center">⭐ Feedback</th>
                        <th class="px-4 py-3 text-center">Score</th>
                        <th class="px-4 py-3 text-center rounded-r-lg">Rating</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    ${rankings.map((r, i) => {
                        const icon = rankIcons[i] || `#${i + 1}`;
                        const scoreDisplay = r.score !== null ? r.score + '%' : '—';
                        const badgeCls = badgeColors[r.badge] || badgeColors.grey;
                        const feedbackDisplay = r.feedback_avg_rating !== null
                            ? `<span class="text-yellow-500">${'★'.repeat(Math.round(r.feedback_avg_rating))}${'☆'.repeat(5 - Math.round(r.feedback_avg_rating))}</span> <span class="text-xs text-gray-500">(${r.feedback_count})</span>`
                            : '<span class="text-gray-400">—</span>';
                        return `<tr class="hover:bg-gray-50 transition-colors">
                            <td class="px-4 py-3 text-xl">${icon}</td>
                            <td class="px-4 py-3 font-semibold text-gray-800">🤝 ${r.name || 'Unknown'}</td>
                            <td class="px-4 py-3 text-center text-gray-600">${r.students_helped}</td>
                            <td class="px-4 py-3 text-center text-green-600 font-semibold">${r.positive_impacts}</td>
                            <td class="px-4 py-3 text-center text-red-500 font-semibold">${r.negative_impacts}</td>
                            <td class="px-4 py-3 text-center">${feedbackDisplay}</td>
                            <td class="px-4 py-3 text-center font-bold text-gray-800">${scoreDisplay}</td>
                            <td class="px-4 py-3 text-center"><span class="px-3 py-1 rounded-full text-xs font-bold ${badgeCls}">${r.label}</span></td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
    } catch (err) {
        container.innerHTML = '<p class="text-red-500 p-4">Error loading rankings.</p>';
    }
}

// ==================== Admin: User Management ====================

async function loadAdminUsers() {
    const container = document.getElementById('adminUsersList');
    if (!container) return;
    container.innerHTML = '<p class="text-gray-400 text-center py-8">Loading...</p>';
    try {
        const res = await fetch(`${API_BASE}/admin/users`);
        const data = await res.json();
        if (!res.ok) { container.innerHTML = `<p class="text-red-500 p-4">${data.error}</p>`; return; }
        const users = data.users || [];
        if (users.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-8">No users found.</p>';
            return;
        }
        const roleIcons = { user: '👤', volunteer: '🤝', admin: '⚙️' };
        const statusColors = {
            approved: 'bg-green-100 text-green-700',
            pending: 'bg-yellow-100 text-yellow-700',
            rejected: 'bg-red-100 text-red-700'
        };
        container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead>
                    <tr class="bg-gray-50 text-gray-500 uppercase text-xs">
                        <th class="px-4 py-3 text-left rounded-l-lg">#</th>
                        <th class="px-4 py-3 text-left">Name</th>
                        <th class="px-4 py-3 text-left">Role</th>
                        <th class="px-4 py-3 text-center">Status</th>
                        <th class="px-4 py-3 text-center">Licensed</th>
                        <th class="px-4 py-3 text-left">Expertise</th>
                        <th class="px-4 py-3 text-right rounded-r-lg">Action</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    ${users.map((u, i) => {
                        const icon = roleIcons[u.role] || '👤';
                        const statusCls = statusColors[u.approval_status] || statusColors.approved;
                        const statusLabel = (u.approval_status || 'approved').charAt(0).toUpperCase() + (u.approval_status || 'approved').slice(1);
                        return `<tr class="hover:bg-gray-50 transition-colors">
                            <td class="px-4 py-3 text-gray-400">${i + 1}</td>
                            <td class="px-4 py-3 font-semibold text-gray-800">${icon} ${escapeHtml(u.dummy_name || 'Unnamed')}</td>
                            <td class="px-4 py-3 text-gray-600 capitalize">${escapeHtml(u.role)}</td>
                            <td class="px-4 py-3 text-center"><span class="px-2 py-1 rounded-full text-xs font-bold ${statusCls}">${statusLabel}</span></td>
                            <td class="px-4 py-3 text-center">${u.role === 'volunteer' ? (u.is_licensed ? '✅' : '❌') : '—'}</td>
                            <td class="px-4 py-3 text-gray-600 text-xs">${u.role === 'volunteer' && u.expertise ? escapeHtml(u.expertise) : '—'}</td>
                            <td class="px-4 py-3 text-right">
                                ${u.role !== 'admin' ? `<button onclick="adminDeleteUser('${u.id}', '${escapeHtml(u.dummy_name)}')" class="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1 rounded-lg text-xs font-semibold transition-all">🗑 Delete</button>` : '<span class="text-gray-400 text-xs">Protected</span>'}
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
    } catch (err) {
        container.innerHTML = '<p class="text-red-500 p-4">Error loading users.</p>';
    }
}

async function adminDeleteUser(userId, name) {
    if (!confirm(`Delete user "${name}"? This action cannot be undone.`)) return;
    try {
        const res = await fetch(`${API_BASE}/admin/users/${userId}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
            showToast(`User ${name} deleted.`, 'success');
            loadAdminUsers();
        } else {
            showToast(data.error || 'Failed to delete user.', 'error');
        }
    } catch (err) {
        showToast('Error deleting user.', 'error');
    }
}

// ==================== Admin: Pending Volunteer Approvals ====================

async function loadPendingVolunteers() {
    const container = document.getElementById('adminPendingList');
    if (!container) return;
    container.innerHTML = '<p class="text-gray-400 text-center py-8">Loading...</p>';
    try {
        const res = await fetch(`${API_BASE}/admin/pending-volunteers`);
        const data = await res.json();
        if (!res.ok) { container.innerHTML = `<p class="text-red-500 p-4">${data.error}</p>`; return; }
        const volunteers = data.volunteers || [];
        if (volunteers.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-8">🎉 No pending volunteer applications.</p>';
            return;
        }
        container.innerHTML = volunteers.map(v => {
            const licenseBadge = v.is_licensed
                ? '<span class="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">✅ Licensed Professional</span>'
                : '<span class="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold">📝 Not Licensed</span>';
            const expertiseStr = v.expertise ? escapeHtml(v.expertise) : 'No expertise specified';
            const createdAt = v.created_at ? formatPostTime(v.created_at) : 'Unknown';
            return `
                <div class="border-2 border-yellow-200 bg-yellow-50 rounded-2xl p-6 mb-4 transition-all hover:shadow-md">
                    <div class="flex items-start justify-between gap-4">
                        <div class="flex-1">
                            <h4 class="text-lg font-bold text-gray-800 mb-1">🤝 ${escapeHtml(v.dummy_name || 'Unnamed')}</h4>
                            <p class="text-sm text-gray-600 mb-2">Applied: ${createdAt}</p>
                            <div class="flex flex-wrap gap-2 mb-3">
                                ${licenseBadge}
                                <span class="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">🎯 ${expertiseStr}</span>
                            </div>
                        </div>
                        <div class="flex flex-col gap-2">
                            <button onclick="adminApproveVolunteer('${v.id}', '${escapeHtml(v.dummy_name)}')" class="bg-green-500 hover:bg-green-600 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all transform hover:scale-105 shadow-sm">✅ Approve</button>
                            <button onclick="adminRejectVolunteer('${v.id}', '${escapeHtml(v.dummy_name)}')" class="bg-red-500 hover:bg-red-600 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all transform hover:scale-105 shadow-sm">❌ Reject</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = '<p class="text-red-500 p-4">Error loading pending volunteers.</p>';
    }
}

async function adminApproveVolunteer(volunteerId, name) {
    if (!confirm(`Approve volunteer "${name}"? They will be able to access the platform.`)) return;
    try {
        const res = await fetch(`${API_BASE}/admin/volunteers/${volunteerId}/approve`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            showToast(`✅ Volunteer ${name} approved!`, 'success');
            loadPendingVolunteers();
            loadAdminVolunteers();
        } else {
            showToast(data.error || 'Failed to approve volunteer.', 'error');
        }
    } catch (err) {
        showToast('Error approving volunteer.', 'error');
    }
}

async function adminRejectVolunteer(volunteerId, name) {
    if (!confirm(`Reject volunteer "${name}"? They will not be able to access the platform.`)) return;
    try {
        const res = await fetch(`${API_BASE}/admin/volunteers/${volunteerId}/reject`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            showToast(`❌ Volunteer ${name} rejected.`, 'success');
            loadPendingVolunteers();
        } else {
            showToast(data.error || 'Failed to reject volunteer.', 'error');
        }
    } catch (err) {
        showToast('Error rejecting volunteer.', 'error');
    }
}

// ==================== Student Feedback System ====================

let pendingFeedbackVolunteerId = null;
let currentFeedbackRating = 0;

async function checkPendingFeedback() {
    if (!currentUser || currentUser.role !== 'user') return;
    try {
        const res = await fetch(`${API_BASE}/feedback/pending/${currentUser.user_id}`);
        const data = await res.json();
        if (res.ok && data.has_pending) {
            pendingFeedbackVolunteerId = data.volunteer_id;
            const nameEl = document.getElementById('feedbackVolunteerName');
            if (nameEl) nameEl.textContent = `Rate your session with ${data.volunteer_name || 'your volunteer'}`;
            openFeedbackModal();
        }
    } catch (err) {
        // Silent — don't block user experience
    }
}

function openFeedbackModal() {
    const modal = document.getElementById('feedbackModal');
    if (modal) modal.classList.remove('hidden');
    // Reset state
    currentFeedbackRating = 0;
    const stars = document.querySelectorAll('.feedback-star');
    stars.forEach(s => s.classList.replace('text-yellow-400', 'text-gray-300'));
    const textarea = document.getElementById('feedbackText');
    if (textarea) textarea.value = '';
    const btn = document.getElementById('feedbackSubmitBtn');
    if (btn) btn.disabled = true;
    const label = document.getElementById('feedbackRatingLabel');
    if (label) label.textContent = 'Tap a star to rate';
}

function closeFeedbackModal() {
    const modal = document.getElementById('feedbackModal');
    if (modal) modal.classList.add('hidden');
    pendingFeedbackVolunteerId = null;
    currentFeedbackRating = 0;
}

function setFeedbackRating(rating) {
    currentFeedbackRating = rating;
    const stars = document.querySelectorAll('.feedback-star');
    const labels = ['', 'Poor 😞', 'Below Average 😐', 'Average 🙂', 'Good 😊', 'Excellent 🤩'];
    stars.forEach(s => {
        const starNum = parseInt(s.getAttribute('data-star'));
        if (starNum <= rating) {
            s.classList.remove('text-gray-300');
            s.classList.add('text-yellow-400');
        } else {
            s.classList.remove('text-yellow-400');
            s.classList.add('text-gray-300');
        }
    });
    const label = document.getElementById('feedbackRatingLabel');
    if (label) label.textContent = labels[rating] || '';
    const btn = document.getElementById('feedbackSubmitBtn');
    if (btn) btn.disabled = false;
}

async function submitFeedback() {
    if (!currentUser || !pendingFeedbackVolunteerId || currentFeedbackRating < 1) return;
    const feedbackText = document.getElementById('feedbackText')?.value || '';
    const btn = document.getElementById('feedbackSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

    try {
        const res = await fetch(`${API_BASE}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.user_id,
                volunteer_id: pendingFeedbackVolunteerId,
                rating: currentFeedbackRating,
                feedback_text: feedbackText
            })
        });
        const data = await res.json();
        if (res.ok) {
            showToast('Thank you for your feedback! ⭐', 'success');
            closeFeedbackModal();
        } else {
            showToast(data.error || 'Failed to submit feedback.', 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Submit Feedback'; }
        }
    } catch (err) {
        showToast('Error submitting feedback.', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Submit Feedback'; }
    }
}
let ageGroupChart = null;
let regionChart = null;

function loadAgeGroupChart(ageGroupBreakdown) {
    const ctx = document.getElementById('ageGroupChart');
    if (!ctx || !ageGroupBreakdown) return;

    const labels = Object.keys(ageGroupBreakdown).filter(k => ageGroupBreakdown[k].total > 0);
    const negativeMoods = labels.map(k => ageGroupBreakdown[k].negative_moods);
    const totalUsers = labels.map(k => ageGroupBreakdown[k].total);

    if (ageGroupChart) ageGroupChart.destroy();
    ageGroupChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Negative mood logs',
                    data: negativeMoods,
                    backgroundColor: '#f87171',
                    borderRadius: 8
                },
                {
                    label: 'Total users',
                    data: totalUsers,
                    backgroundColor: '#a5b4fc',
                    borderRadius: 8
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const idx = context.dataIndex;
                            const group = labels[idx];
                            const total = ageGroupBreakdown[group].total;
                            const neg = ageGroupBreakdown[group].negative_moods;
                            if (context.datasetIndex === 0 && total > 0) {
                                return `${Math.round((neg / total) * 100)}% of this group logged negative moods`;
                            }
                        }
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}

function loadRegionChart(regionBreakdown) {
    const ctx = document.getElementById('regionChart');
    if (!ctx || !regionBreakdown) return;

    const labels = Object.keys(regionBreakdown).filter(k => regionBreakdown[k].total_users > 0);
    const negativeMoods = labels.map(k => regionBreakdown[k].negative_moods);
    const totalUsers = labels.map(k => regionBreakdown[k].total_users);

    if (regionChart) regionChart.destroy();
    regionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Negative mood logs',
                    data: negativeMoods,
                    backgroundColor: '#fb923c',
                    borderRadius: 8
                },
                {
                    label: 'Total users',
                    data: totalUsers,
                    backgroundColor: '#6ee7b7',
                    borderRadius: 8
                }
            ]
        },
        options: {
            responsive: true,
            indexAxis: 'y',
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const idx = context.dataIndex;
                            const region = labels[idx];
                            const total = regionBreakdown[region].total_users;
                            const neg = regionBreakdown[region].negative_moods;
                            if (context.datasetIndex === 0 && total > 0) {
                                return `${Math.round((neg / total) * 100)}% of this region logged negative moods`;
                            }
                        }
                    }
                }
            },
            scales: {
                x: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}

function loadMoodDistributionChart(moodDistribution) {
    const ctx = document.getElementById('moodDistributionChart');
    const labels = Object.keys(moodDistribution);
    const values = Object.values(moodDistribution);
    const colors = ['#FFD700', '#4169E1', '#FF6347', '#FF8C00', '#90EE90'];
    if (moodDistributionChart) moodDistributionChart.destroy();
    moodDistributionChart = new Chart(ctx, { type: 'doughnut', data: { labels, datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderColor: '#fff', borderWidth: 2 }] }, options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 12 } } } } } });
}

function loadRoleDistributionChart(roleDistribution) {
    const ctx = document.getElementById('roleDistributionChart');
    const labels = Object.keys(roleDistribution);
    const values = Object.values(roleDistribution);
    const colors = ['#667eea', '#764ba2', '#f44336'];
    if (roleDistributionChart) roleDistributionChart.destroy();
    roleDistributionChart = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Number of Users', data: values, backgroundColor: colors.slice(0, labels.length), borderRadius: 8 }] }, options: { responsive: true, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } } });
}

// ==================== Breathing Exercise ====================

let breathingInterval = null;
let breathingTimeout = null;
let breathingRound = 1;
let currentTechnique = 'relaxed';

const BREATHING_TECHNIQUES = {
    relaxed: {
        name: 'Box Breathing', phases: [
            { label: 'Breathe In', duration: 4, action: 'expand' },
            { label: 'Hold', duration: 4, action: 'hold' },
            { label: 'Breathe Out', duration: 4, action: 'shrink' },
            { label: 'Hold', duration: 4, action: 'hold' }
        ]
    },
    calming: {
        name: '4-7-8 Technique', phases: [
            { label: 'Breathe In', duration: 4, action: 'expand' },
            { label: 'Hold', duration: 7, action: 'hold' },
            { label: 'Breathe Out', duration: 8, action: 'shrink' }
        ]
    },
    energizing: {
        name: 'Quick Breath', phases: [
            { label: 'Breathe In', duration: 2, action: 'expand' },
            { label: 'Breathe Out', duration: 2, action: 'shrink' }
        ]
    }
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
        textarea.addEventListener('input', function () {
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
navigateTo = function (page) {
    originalNavigateTo(page);

    if (page === 'messaging' && currentUser && currentUser.role === 'user') {
        startUserSecureChatPolling();
    } else {
        stopUserSecureChatPolling();
    }

    if (page === 'volunteer-dashboard' && currentUser && currentUser.role === 'volunteer') {
        startVolunteerSecureChatPolling();
    } else {
        stopVolunteerSecureChatPolling();
    }

    if (page === 'journal') {
        initJournal();
    } else if (page === 'breathing') {
        stopBreathing(); // Reset breathing state when navigating here
    }
};

// ==================== Utilities ====================

async function testApiConnection() {
    try {
        const response = await fetch('/api/test');
        const text = await response.text();

        if (response.ok) {
            showToast(`API Connected: ${text}`, 'success');
        } else {
            showToast(`API Error (${response.status})`, 'error');
        }
    } catch (error) {
        showToast('API unreachable. Check backend deployment.', 'error');
    }
}

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

