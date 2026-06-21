// Verified Configuration credentials assigned to u2them-app instance architecture
const firebaseConfig = {
  apiKey: "AIzaSyD7mLqxB60_SO7hadhgO9pLKQxdhpCBdFI",
  authDomain: "u2them-app.firebaseapp.com",
  projectId: "u2them-app",
  storageBucket: "u2them-app.firebasestorage.app",
  messagingSenderId: "93338709285",
  appId: "1:93338709285:web:b6d48ced88b774323dbecc",
  measurementId: "G-F9E7S8NNLN"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

db.enablePersistence().catch((err) => {
    console.warn("Persistence notice: ", err.code);
});

let currentUser = null;
let currentUserProfile = null; 
let currentRoom = "";
let unsubscribeMessages = null;
let unsubscribeProfile = null;
let isSignUpMode = false;

let lastVisibleDoc = null;
let isFetchingOlder = false;
const MESSAGE_LIMIT = 8;

const HOST_LIMIT_PREMIUM = 2; 

// ---------- Premium System Profiles Matrix ----------
const THEMES = ['theme-classic', 'theme-sunset', 'theme-ocean', 'theme-galaxy'];
const FONTS = ['font-default', 'font-mono', 'font-rounded', 'font-elegant'];
let themeIndex = 0;
let fontIndex = 0;
let selfDestructOn = false;
let hdMediaOn = false;
let stealthOn = false;

// ---------- Runtime Initialization Vector ----------
document.addEventListener("DOMContentLoaded", () => {
    if (window.Capacitor) {
        document.getElementById('googleLoginBtn').style.display = 'block';
        Capacitor.Plugins.GoogleAuth.initialize({
            clientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com', // Google Cloud Console Client ID yahan replace karein
            scopes: ['profile', 'email'],
        });
    }
    toggleAuthMode(false);
});

// ---------- Native Google Authentication Stream ----------
async function handleGoogleLogin() {
    const btn = document.getElementById('googleLoginBtn');
    const oldText = btn.innerHTML;
    btn.innerText = "Connecting Grid...";
    btn.disabled = true;

    try {
        const googleUser = await Capacitor.Plugins.GoogleAuth.signIn();
        const credential = firebase.auth.GoogleAuthProvider.credential(googleUser.authentication.idToken);
        const userCredential = await auth.signInWithCredential(credential);
        
        const userDoc = await db.collection('users').doc(userCredential.user.uid).get();
        if (!userDoc.exists) {
            await db.collection('users').doc(userCredential.user.uid).set({
                nickname: userCredential.user.displayName || "MatrixNode",
                nicknameLower: (userCredential.user.displayName || "matrixnode").toLowerCase(),
                email: userCredential.user.email,
                isOwner: false,
                isPremium: false,
                hostedRooms: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        btn.disabled = false;
        btn.innerHTML = oldText;
    } catch (err) {
        alert("Google Grid Error: " + err.message);
        btn.disabled = false;
        btn.innerHTML = oldText;
    }
}

// ---------- Legacy Email & Password Submit Core Handler (FIXED) ----------
async function handleAuth(e) {
    e.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const nickname = document.getElementById('authName').value.trim();
    const submitBtn = document.getElementById('authSubmitBtn');

    submitBtn.innerText = "Processing...";
    submitBtn.disabled = true;

    if (isSignUpMode) {
        if (!nickname) {
            alert("Nickname is required!");
            submitBtn.innerText = "Create Account & Join";
            submitBtn.disabled = false;
            return;
        }
        try {
            const taken = await isNicknameTaken(nickname);
            if (taken) {
                alert("That nickname is already taken.");
                submitBtn.innerText = "Create Account & Join";
                submitBtn.disabled = false;
                return;
            }

            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            await db.collection('users').doc(userCredential.user.uid).set({
                nickname: nickname,
                nicknameLower: nickname.toLowerCase(),
                email: email,
                isOwner: false,
                isPremium: false,
                hostedRooms: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            submitBtn.disabled = false;
        } catch (error) {
            alert("Signup Error: " + error.message);
            submitBtn.innerText = "Create Account & Join";
            submitBtn.disabled = false;
        }
    } else {
        auth.signInWithEmailAndPassword(email, password)
            .then(() => { submitBtn.disabled = false; })
            .catch((error) => {
                alert("Login Error: " + error.message);
                submitBtn.innerText = "Login";
                submitBtn.disabled = false;
            });
    }
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) targetScreen.classList.add('active');
}

function callNeonModal(title, text, isPrompt) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customNeonModal');
        const titleEl = document.getElementById('modalTitleNeon');
        const descEl = document.getElementById('modalDescNeon');
        const inputContainer = document.getElementById('modalInputContainer');
        const inputEl = document.getElementById('modalInputNeon');
        const cancelBtn = document.getElementById('modalCancelBtn');
        const confirmBtn = document.getElementById('modalConfirmBtn');

        titleEl.innerText = title;
        descEl.innerText = text;
        inputEl.value = "";
        inputContainer.style.display = isPrompt ? 'block' : 'none';
        overlay.classList.add('active');

        function cleanListeners() {
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            overlay.classList.remove('active');
        }
        confirmBtn.onclick = () => { const val = isPrompt ? inputEl.value : true; cleanListeners(); resolve(val); };
        cancelBtn.onclick = () => { cleanListeners(); resolve(null); };
    });
}

// ---------- Engine State Listener Core Synchronization ----------
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        watchUserProfile(user.uid);
        showScreen('roomScreen');
    } else {
        currentUser = null;
        currentUserProfile = null;
        if (unsubscribeProfile) unsubscribeProfile();
        showScreen('authScreen');
    }
});

function watchUserProfile(uid) {
    if (unsubscribeProfile) unsubscribeProfile();
    unsubscribeProfile = db.collection('users').doc(uid).onSnapshot(doc => {
        if (doc.exists) {
            currentUserProfile = doc.data();
            document.getElementById('welcomeUser').innerText = currentUserProfile.nickname || "User";
            setupOwnerCardUI();
        }
    });
}

async function isNicknameTaken(nickname) {
    const lower = nickname.toLowerCase();
    const existing = await db.collection('users').where('nicknameLower', '==', lower).limit(1).get();
    return !existing.empty;
}

function setupOwnerCardUI() {
    const roomList = document.querySelector('.room-list');
    const existing = document.getElementById('ownerRoomCard');
    if (!currentUserProfile || !currentUserProfile.isOwner) { if (existing) existing.remove(); return; }
    if (existing) return;

    const ownerCard = document.createElement('div');
    ownerCard.id = 'ownerRoomCard';
    ownerCard.className = 'room-card management-gold-card';
    ownerCard.onclick = () => openManagementArea();
    ownerCard.innerHTML = `
        <div class="room-icon secured" style="color:#ffcc00;"><i class="fa-solid fa-gears"></i></div>
        <div class="room-details"><h3>Management Area</h3><p>Server registration matrix & access vectors</p></div>
        <i class="fa-solid fa-crown secure-lock-neon" style="color:#ffcc00;"></i>`;
    roomList.appendChild(ownerCard);
}

async function openManagementArea() {
    if (!currentUserProfile || !currentUserProfile.isOwner) { alert("Owner clearance required."); return; }
    const usersSnap = await db.collection('users').get();
    const allUsers = [];
    usersSnap.forEach(doc => allUsers.push({ uid: doc.id, ...doc.data() }));

    const container = document.getElementById('managementDashboardContent');
    container.innerHTML = `
        <div class="dashboard-section">
            <h4><i class="fa-solid fa-users"></i> Registered Members (${allUsers.length})</h4>
            <ul class="dash-list">
                ${allUsers.map(u => `
                    <li>
                        <span>${escapeHtml(u.nickname || '(no nickname)')} ${u.isPremium ? '<span class="premium-badge-gold">PREMIUM</span>' : ''} ${u.isOwner ? '<span class="premium-badge-gold" style="background:#00f0ff;">OWNER</span>' : ''}</span>
                        <span style="display:flex; gap:6px;">
                            ${!u.isPremium ? `<button class="dash-btn add" onclick="grantPremium('${u.uid}')">Grant Premium</button>` : `<button class="dash-btn remove" onclick="revokePremiumAccess('${u.uid}')">Revoke</button>`}
                        </span>
                    </li>
                `).join('')}
            </ul>
        </div>`;
    showScreen('managementScreen');
}

async function grantPremium(uid) { await db.collection('users').doc(uid).update({ isPremium: true }); openManagementArea(); }
async function revokePremiumAccess(uid) { await db.collection('users').doc(uid).update({ isPremium: false }); openManagementArea(); }
function leaveManagement() { showScreen('roomScreen'); }

function toggleAuthMode(switchToSignUp) {
    isSignUpMode = switchToSignUp;
    const signupNameGroup = document.getElementById('signupNameGroup');
    const submitBtn = document.getElementById('authSubmitBtn');
    const toggleModeText = document.getElementById('toggleModeText');

    if (isSignUpMode) {
        signupNameGroup.style.display = 'block';
        submitBtn.innerText = "Create Account & Join";
        toggleModeText.innerHTML = `Already have an account? <span id="switchAuthMode" onclick="toggleAuthMode(false)">Login Here</span>`;
    } else {
        signupNameGroup.style.display = 'none';
        submitBtn.innerText = "Login";
        toggleModeText.innerHTML = `New Node? <span id="switchAuthMode" onclick="toggleAuthMode(true)">Sign Up</span>`;
    }
}

function logOutUser() { auth.signOut().then(() => { currentRoom = ""; lastVisibleDoc = null; document.getElementById('authForm').reset(); }); }

async function joinRoom(roomName) {
    if (roomName === 'Premium') {
        if (!currentUserProfile || !currentUserProfile.isPremium) {
            const tokenInput = await callNeonModal("Premium Security", "Enter Encryption Key for Premium Server:", true);
            if (tokenInput !== "@Dhanraj") { if (tokenInput !== null) alert("Access Denied!"); return; }
        }
    }
    currentRoom = roomName;
    document.getElementById('currentRoomTitle').innerText = roomName + " Server";
    const chatHeader = document.getElementById('chatScreenHeader');
    const tray = document.getElementById('premiumControlsTray');
    if (roomName === 'Premium') { chatHeader.className = "app-header premium-gold-header"; tray.style.display = 'flex'; applyTheme(); applyFont(); } 
    else { chatHeader.className = "app-header"; tray.style.display = 'none'; document.getElementById('chatMessages').className = 'chat-messages'; }
    
    lastVisibleDoc = null;
    document.getElementById('chatMessages').innerHTML = "";
    showScreen('chatScreen');
    listenToMessages();
    attachScrollPaginationListener();
}

function leaveChat() { if (unsubscribeMessages) unsubscribeMessages(); document.getElementById('chatMessages').removeEventListener('scroll', handleScrollPagination); showScreen('roomScreen'); }

function listenToMessages() {
    const chatMessages = document.getElementById('chatMessages');
    let query = db.collection('rooms').doc(currentRoom).collection('messages').orderBy('timestamp', 'desc').limit(MESSAGE_LIMIT);
    if (unsubscribeMessages) unsubscribeMessages();

    unsubscribeMessages = query.onSnapshot(snapshot => {
        cleanupExpiredMessages(snapshot);
        if (!lastVisibleDoc && snapshot.docs.length > 0) { lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1]; }
        const records = [];
        snapshot.forEach(doc => records.unshift({ id: doc.id, data: doc.data() }));
        records.forEach(item => { if (document.getElementById(`msg-${item.id}`)) return; renderSingleBubble(item.id, item.data, false); });
        if (!isFetchingOlder) { chatMessages.scrollTop = chatMessages.scrollHeight; }
    });
}

function attachScrollPaginationListener() { document.getElementById('chatMessages').addEventListener('scroll', handleScrollPagination); }

function handleScrollPagination() {
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages.scrollTop === 0 && lastVisibleDoc && !isFetchingOlder) {
        isFetchingOlder = true;
        const initialScrollHeight = chatMessages.scrollHeight;
        db.collection('rooms').doc(currentRoom).collection('messages').orderBy('timestamp', 'desc').startAfter(lastVisibleDoc).limit(MESSAGE_LIMIT).get()
            .then(snapshot => {
                if (snapshot.docs.length > 0) { lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1]; snapshot.forEach(doc => renderSingleBubble(doc.id, doc.data(), true)); chatMessages.scrollTop = chatMessages.scrollHeight - initialScrollHeight; }
                isFetchingOlder = false;
            }).catch(() => isFetchingOlder = false);
    }
}

function renderSingleBubble(docId, data, prependState) {
    const chatMessages = document.getElementById('chatMessages');
    const isMe = data.uid === currentUser.uid;
    if (!isMe && data.status !== "read") { db.collection('rooms').doc(currentRoom).collection('messages').doc(docId).update({ status: "read" }); }

    let timeStr = "Just now";
    if (data.timestamp) { timeStr = data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    let tickHtml = isMe ? (data.status === "read" ? `<i class="fa-solid fa-check-double receipt-ticks-neon received-check"></i>` : `<i class="fa-solid fa-check receipt-ticks-neon"></i>`) : '';

    const bubble = document.createElement('div');
    bubble.id = `msg-${docId}`;
    bubble.className = `message-wrapper ${isMe ? 'sent' : 'received'} ${stealthOn ? 'stealth-blur' : ''}`;
    let contentBody = data.type === "image" ? `<img src="${data.url}" class="media-img ${data.hd ? 'hd-img' : ''}" alt="Media Asset">` : `<span>${escapeHtml(data.text || '')}</span>`;

    bubble.innerHTML = `${!isMe ? `<span class="user-tag">${escapeHtml(data.sender)}</span>` : ''}${contentBody}<div class="message-meta"><span>${timeStr}</span>${tickHtml}</div>`;
    if (prependState) { chatMessages.insertBefore(bubble, chatMessages.firstChild); } else { chatMessages.appendChild(bubble); }

    if (selfDestructOn && !prependState) { setTimeout(() => { db.collection('rooms').doc(currentRoom).collection('messages').doc(docId).delete().catch(() => {}); }, 10000); }
}

function escapeHtml(str) { const div = document.createElement('div'); div.innerText = str; return div.innerHTML; }

function cleanupExpiredMessages(snapshot) {
    const nowMs = Date.now();
    snapshot.forEach(doc => { const data = doc.data(); if (data.timestamp) { if (nowMs - data.timestamp.toDate().getTime() > 43200000) { db.collection('rooms').doc(currentRoom).collection('messages').doc(doc.id).delete(); } } });
}

function handleMessageSubmit(e) { e.preventDefault(); const input = document.getElementById('messageInput'); const msgText = input.value.trim(); if (!msgText) return; sendMessage(msgText, "text", null); input.value = ""; }

function sendMessage(contentValue, typeString, directUrl) {
    if (!currentUser) return;
    const payload = { sender: (currentUserProfile && currentUserProfile.nickname) || currentUser.email.split('@')[0], uid: currentUser.uid, type: typeString, status: "sent", timestamp: firebase.firestore.FieldValue.serverTimestamp() };
    if (typeString === "text") payload.text = contentValue; else { payload.url = directUrl; payload.hd = hdMediaOn; }
    db.collection('rooms').doc(currentRoom).collection('messages').add(payload);
}

function triggerMockMedia() {
    const hiddenInputDevice = document.createElement('input'); hiddenInputDevice.type = 'file'; hiddenInputDevice.accept = 'image/*';
    hiddenInputDevice.onchange = (event) => {
        const selectedFile = event.target.files[0]; if (!selectedFile) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const imgEl = new Image(); imgEl.src = e.target.result;
            imgEl.onload = () => {
                const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
                const MAX_WIDTH = hdMediaOn ? 1080 : 400; const quality = hdMediaOn ? 0.85 : 0.6;
                const scaleFactor = Math.min(1, MAX_WIDTH / imgEl.width); canvas.width = imgEl.width * scaleFactor; canvas.height = imgEl.height * scaleFactor;
                ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
                const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                if (compressedBase64.length > 900000) { alert("Image is too large."); return; }
                sendMessage("Shared Image", "image", compressedBase64);
            };
        };
        reader.readAsDataURL(selectedFile);
    };
    hiddenInputDevice.click();
}

// ---------- Premium Features Tools Configuration ----------
function applyTheme() { document.getElementById('chatMessages').className = 'chat-messages ' + THEMES[themeIndex]; }
function cyclePremiumBackground() { themeIndex = (themeIndex + 1) % THEMES.length; applyTheme(); }
function applyFont() { const cm = document.getElementById('chatMessages'); FONTS.forEach(f => cm.classList.remove(f)); cm.classList.add(FONTS[fontIndex]); }
function cycleTypographyEffect() { fontIndex = (fontIndex + 1) % FONTS.length; applyFont(); }
function toggleSelfDestructMode() { selfDestructOn = !selfDestructOn; document.getElementById('destructToggleBtn').classList.toggle('active-mode', selfDestructOn); }
function toggleHighQualityMedia() { hdMediaOn = !hdMediaOn; document.getElementById('mediaQualityToggleBtn').classList.toggle('active-mode', hdMediaOn); }
function toggleStealthMode() { stealthOn = !stealthOn; document.getElementById('stealthToggleBtn').classList.toggle('active-mode', stealthOn); document.querySelectorAll('.message-wrapper').forEach(el => el.classList.toggle('stealth-blur', stealthOn)); }
