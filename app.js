// ═══════════════════════════════════════════════════════════════
//  U2Them — app.js   COMPLETE FINAL
//  • Owner Server with password @Dhanraj#2012
//  • Add member by username (unique check)
//  • Block / Unblock / Kick
//  • Grant / Revoke Premium  →  premium badge auto
//  • Make someone Owner  →  owner badge auto
//  • Owner has both Owner + Premium badges
//  • Delete hosted server from owner panel
//  • Premium users: host server, games, features — NO password
//  • Username change limit: 2 per month (owner can override)
//  • Chat fix: docChanges() so other users see messages live
//  • No premium-room password repeat per session
// ═══════════════════════════════════════════════════════════════

// ── FIREBASE ────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyD7mLqxB60_SO7hadhgO9pLKQxdhpCBdFI",
  authDomain:        "u2them-app.firebaseapp.com",
  projectId:         "u2them-app",
  storageBucket:     "u2them-app.firebasestorage.app",
  messagingSenderId: "93338709285",
  appId:             "1:93338709285:web:b6d48ced88b774323dbecc",
  measurementId:     "G-F9E7S8NNLN"
};
// Catch any uncaught error so the page doesn't silently fall back to a
// native form reload (that's what was wiping your email/password fields —
// if app.js crashed early, handleAuth never got defined, so pressing
// Enter just did a normal page reload instead of logging you in).
window.addEventListener('error', e => {
  console.error('Uncaught error:', e.error || e.message);
  alert('App error: ' + (e.error ? e.error.message : e.message));
});

let firebaseReady = false;
try {
  firebase.initializeApp(firebaseConfig);
  firebaseReady = true;
} catch (e) {
  console.error('Firebase init failed:', e);
  alert('Firebase failed to load. Check your internet connection and reload the app.\n\n' + e.message);
}
let db = null, auth = null;
if (firebaseReady) {
  try {
    db   = firebase.firestore();
    auth = firebase.auth();
  } catch (e) {
    console.error('Firebase services failed to init:', e);
    alert('Firebase services failed to load. Check your internet connection and reload the app.\n\n' + e.message);
    firebaseReady = false;
  }
}

// ── CONSTANTS ───────────────────────────────────────────────────
const OWNER_SERVER_PASS  = "@Dhanraj#2012";
const PREMIUM_ROOM_PASS  = "@Dhanraj";
const HOST_LIMIT         = 2;
const MSG_LIMIT          = 20;
const MSG_MAX_AGE        = 12 * 3600 * 1000;   // 12 hours
const USERNAME_MONTH_CAP = 2;                  // changes allowed per calendar month

const THEMES = ['theme-classic','theme-sunset','theme-ocean','theme-galaxy'];
const FONTS  = ['font-default','font-mono','font-rounded','font-elegant'];

// ── STATE ────────────────────────────────────────────────────────
let currentUser        = null;
let currentUserProfile = null;
let currentRoom        = "";
let unsubMessages      = null;
let unsubProfile       = null;
let isSignUpMode       = false;
let lastVisibleDoc     = null;
let isFetchingOlder    = false;

let themeIndex     = 0;
let fontIndex      = 0;
let selfDestructOn = false;
let hdMediaOn      = false;
let stealthOn      = false;

let activeReactionMsgId = null;
let pressTimer          = null;

let tttBoard    = Array(9).fill('');
let tttSymbol   = 'X';
let tttGameId   = null;
let unsubGame   = null;

let ownerTabActive    = 'members';
let ownerVerified     = false;   // true after password entered once this session
const unlockedPremium = new Set(); // session-level unlocked rooms

// ── HELPERS ─────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');

  const navScreens = ['roomScreen', 'friendsScreen', 'profileScreen'];
  const nav = document.getElementById('bottomNav');
  if (nav) {
    if (navScreens.includes(id)) {
      nav.classList.add('active');
      nav.querySelectorAll('.nav-tab').forEach(btn => {
        btn.classList.toggle('active-tab', btn.dataset.screen === id);
      });
    } else {
      nav.classList.remove('active');
    }
  }
}

function esc(str) {
  const d = document.createElement('div');
  d.innerText = str || '';
  return d.innerHTML;
}

function toast(msg) {
  let t = document.getElementById('_toast');
  if (!t) {
    t = document.createElement('div');
    t.id = '_toast';
    t.style.cssText =
      'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
      'background:rgba(0,240,255,.15);border:1px solid #00f0ff;color:#fff;' +
      'padding:8px 18px;border-radius:20px;font-size:12px;z-index:9999;' +
      'transition:opacity .4s;pointer-events:none;white-space:nowrap;backdrop-filter:blur(8px)';
    document.body.appendChild(t);
  }
  t.innerText = msg;
  t.style.opacity = '1';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.opacity = '0'; }, 2800);
}

// ── MODAL ────────────────────────────────────────────────────────
function callNeonModal(title, text, isPrompt, inputType) {
  inputType = inputType || 'password';
  return new Promise(resolve => {
    const overlay    = document.getElementById('customNeonModal');
    const titleEl    = document.getElementById('modalTitleNeon');
    const descEl     = document.getElementById('modalDescNeon');
    const inputWrap  = document.getElementById('modalInputContainer');
    const inputEl    = document.getElementById('modalInputNeon');
    const cancelBtn  = document.getElementById('modalCancelBtn');
    const confirmBtn = document.getElementById('modalConfirmBtn');

    titleEl.innerText       = title;
    descEl.innerText        = text;
    inputEl.value           = '';
    inputEl.type            = inputType;
    inputWrap.style.display = isPrompt ? 'block' : 'none';
    overlay.classList.add('active');

    const done = val => {
      confirmBtn.onclick = null;
      cancelBtn.onclick  = null;
      overlay.classList.remove('active');
      resolve(val);
    };
    confirmBtn.onclick = () => done(isPrompt ? inputEl.value : true);
    cancelBtn.onclick  = () => done(null);
  });
}

// ── AUTH STATE ───────────────────────────────────────────────────
if (firebaseReady && auth) {
  auth.onAuthStateChanged(async user => {
    if (user) {
      currentUser = user;
      try {
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists && doc.data().isBlocked) {
          try { await auth.signOut(); } catch (e) { /* ignore */ }
          currentUser = null; currentUserProfile = null;
          showScreen('authScreen');
          alert('Your account is blocked. Contact the owner.');
          return;
        }
      } catch (e) { /* offline — allow in */ }
      watchProfile(user.uid);
      showScreen('roomScreen');
    } else {
      currentUser = null; currentUserProfile = null;
      if (unsubProfile) { unsubProfile(); unsubProfile = null; }
      showScreen('authScreen');
    }
  });
}

function watchProfile(uid) {
  if (unsubProfile) unsubProfile();
  unsubProfile = db.collection('users').doc(uid).onSnapshot(doc => {
    if (!doc.exists) return;
    currentUserProfile = doc.data();
    updateRoomScreenUI();
  }, e => console.warn('Profile:', e.code));
}

function updateRoomScreenUI() {
  if (!currentUserProfile) return;
  const nick = currentUserProfile.nickname || 'User';

  // nickname in header
  const wel = document.getElementById('welcomeUser');
  if (wel) wel.innerText = nick;

  // avatar letter
  const av = document.getElementById('userAvatarEl');
  if (av) av.innerHTML = `<span style="font-size:16px;font-weight:bold;color:var(--neon-cyan)">${nick[0].toUpperCase()}</span>`;

  // badges row under nickname
  const br = document.getElementById('userBadgesRow');
  if (br) {
    br.innerHTML = '';
    if (currentUserProfile.isPremium || currentUserProfile.isOwner) {
      const pb = document.createElement('span');
      pb.className = 'badge badge-premium';
      pb.innerHTML = '<i class="fa-solid fa-gem" style="font-size:9px"></i> PREMIUM';
      br.appendChild(pb);
    }
    if (currentUserProfile.isOwner) {
      const ob = document.createElement('span');
      ob.className = 'badge badge-owner';
      ob.innerHTML = '<i class="fa-solid fa-crown" style="font-size:9px"></i> OWNER';
      br.appendChild(ob);
    }
  }

  // hosted private rooms
  buildHostedRoomCards();
  // upsell
  const uc = document.getElementById('upsellCard');
  if (uc) uc.style.display = (currentUserProfile.isPremium || currentUserProfile.isOwner) ? 'none' : 'flex';
}

// (Owner Server card is now static in HTML, like Premium — password-gated via openOwnerServer())

// inject hosted private room cards
function buildHostedRoomCards() {
  const wrap = document.getElementById('hostedRoomsWrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!currentUserProfile || !currentUserProfile.isPremium) return;
  (currentUserProfile.hostedRooms || []).forEach(r => {
    const card = document.createElement('div');
    card.className = 'room-card private-room-card';
    card.onclick = () => enterPrivateRoom(r.id, r.name);
    card.innerHTML = `
      <div class="room-icon" style="color:var(--purple)"><i class="fa-solid fa-lock"></i></div>
      <div class="room-details"><h3>${esc(r.name)}</h3><p>Your private server • Code: ${r.inviteCode}</p></div>
      <i class="fa-solid fa-angle-right" style="color:var(--purple);font-size:14px"></i>`;
    wrap.appendChild(card);
  });
}

// ── AUTH FORM ────────────────────────────────────────────────────
function toggleAuthMode(signUp) {
  isSignUpMode = signUp;
  document.getElementById('signupNameGroup').style.display = signUp ? 'block' : 'none';
  document.getElementById('rememberRow').style.display     = signUp ? 'none'  : 'flex';
  document.getElementById('authSubmitBtn').innerText       = signUp ? 'Create Account & Join' : 'Login';
  document.getElementById('toggleModeText').innerHTML      = signUp
    ? `Already have an account? <span onclick="toggleAuthMode(false)">Login Here</span>`
    : `New here? <span onclick="toggleAuthMode(true)">Sign Up</span>`;
}

async function handleAuth(e) {
  e.preventDefault();
  if (!firebaseReady || !auth || !db) {
    alert('Firebase is not connected. Check your internet and reload the app.');
    return;
  }
  const email    = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const btn      = document.getElementById('authSubmitBtn');
  if (!email || !password) { alert('Fill in email and password.'); return; }
  btn.innerText = 'Please wait...'; btn.disabled = true;

  if (isSignUpMode) {
    const nick = document.getElementById('authName').value.trim();
    if (!nick || nick.length < 2 || nick.length > 20) {
      alert('Username: 2-20 chars.'); btn.innerText = 'Create Account & Join'; btn.disabled = false; return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(nick)) {
      alert('Username: letters, numbers, underscore only.'); btn.innerText = 'Create Account & Join'; btn.disabled = false; return;
    }
    try {
      const taken = await db.collection('users').where('nicknameLower','==',nick.toLowerCase()).limit(1).get();
      if (!taken.empty) { alert('Username already taken.'); btn.innerText = 'Create Account & Join'; btn.disabled = false; return; }
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await db.collection('users').doc(cred.user.uid).set({
        nickname: nick, nicknameLower: nick.toLowerCase(),
        email, isOwner: false, isPremium: false,
        hostedRooms: [], isBlocked: false,
        usernameChanges: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      btn.disabled = false;
    } catch (err) { alert('Signup Error: ' + friendlyErr(err.code)); btn.innerText = 'Create Account & Join'; btn.disabled = false; }
  } else {
    const remember = document.getElementById('rememberMe').checked;
    localStorage.setItem('u2_rem', remember ? '1' : '0');
    if (remember) localStorage.setItem('u2_email', email); else localStorage.removeItem('u2_email');
    try {
      const p = remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION;
      await auth.setPersistence(p);
      await auth.signInWithEmailAndPassword(email, password);
      btn.innerText = 'Login'; btn.disabled = false;
    } catch (err) { alert('Login Error: ' + friendlyErr(err.code)); btn.innerText = 'Login'; btn.disabled = false; }
  }
}

function friendlyErr(code) {
  const m = {
    'auth/user-not-found':      'No account with this email.',
    'auth/wrong-password':      'Wrong password.',
    'auth/invalid-credential':  'Wrong email or password.',
    'auth/invalid-email':       'Invalid email format.',
    'auth/email-already-in-use':'Email already registered.',
    'auth/weak-password':       'Password min 6 characters.',
    'auth/too-many-requests':   'Too many attempts. Try later.',
    'auth/network-request-failed':'No internet connection.',
    'auth/operation-not-allowed':'Email/Password sign-in is disabled in Firebase Console. Enable it under Authentication > Sign-in method.',
    'permission-denied':        'Firestore permission denied. Check your Security Rules.',
    'unavailable':              'Could not reach the server. Check your internet connection.'
  };
  return m[code] || code;
}

function logOutUser() {
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  if (unsubProfile)  { unsubProfile();  unsubProfile  = null; }
  auth.signOut()
    .catch(err => console.warn('Sign out error:', err))
    .finally(() => {
      currentUser = null; currentUserProfile = null; currentRoom = '';
      lastVisibleDoc = null; ownerVerified = false;
      unlockedPremium.clear();
      const form = document.getElementById('authForm');
      if (form) form.reset();
      const rem = localStorage.getItem('u2_rem') === '1';
      document.getElementById('rememberMe').checked = rem;
      if (rem) {
        const sv = localStorage.getItem('u2_email');
        if (sv) document.getElementById('authEmail').value = sv;
      }
      toggleAuthMode(false);
      showScreen('authScreen');
    });
}

// ── USERNAME CHANGE (2/month limit) ─────────────────────────────
async function openChangeUsername() {
  if (!currentUserProfile) return;
  const changes = (currentUserProfile.usernameChanges || []);
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${now.getMonth()}`;
  const monthCount = changes.filter(c => c.month === thisMonth).length;

  if (monthCount >= USERNAME_MONTH_CAP && !currentUserProfile.isOwner) {
    const confirm = await callNeonModal(
      'Limit Reached',
      `You have used ${monthCount}/${USERNAME_MONTH_CAP} username changes this month. Contact the owner for permission.`,
      false
    );
    return;
  }

  const newNick = await callNeonModal('Change Username', 'Enter new unique username (2-20 chars):', true, 'text');
  if (!newNick || !newNick.trim()) return;
  const trimmed = newNick.trim();
  if (trimmed.length < 2 || trimmed.length > 20) { alert('2-20 characters required.'); return; }
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) { alert('Letters, numbers, underscore only.'); return; }

  const snap = await db.collection('users').where('nicknameLower','==',trimmed.toLowerCase()).limit(2).get();
  if (snap.docs.some(d => d.id !== currentUser.uid)) { alert('Username already taken.'); return; }

  const updatedChanges = [...changes, { month: thisMonth, ts: Date.now() }];
  try {
    await db.collection('users').doc(currentUser.uid).update({
      nickname: trimmed, nicknameLower: trimmed.toLowerCase(),
      usernameChanges: updatedChanges
    });
    toast('Username updated ✅');
  } catch (e) {
    alert('Failed to update username: ' + e.message);
  }
}

// Owner grants extra username change to a user
async function ownerGrantUsernameChange(uid) {
  const doc = await db.collection('users').doc(uid).get();
  if (!doc.exists) return;
  const changes = (doc.data().usernameChanges || []);
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${now.getMonth()}`;
  // Remove one change record for this month (effectively reducing count)
  const idx = changes.findLastIndex ? changes.findLastIndex(c => c.month === thisMonth)
                                    : (() => { for(let i=changes.length-1;i>=0;i--) if(changes[i].month===thisMonth) return i; return -1; })();
  if (idx !== -1) changes.splice(idx, 1);
  await db.collection('users').doc(uid).update({ usernameChanges: changes });
  toast('Extra username change granted ✅');
  loadOwnerTab(ownerTabActive);
}

// ── ROOMS ────────────────────────────────────────────────────────
async function joinRoom(roomName) {
  if (currentUserProfile && currentUserProfile.isBlocked) { alert('Account blocked.'); return; }

  if (roomName === 'Premium') {
    const ok = currentUserProfile && (currentUserProfile.isPremium || currentUserProfile.isOwner);
    if (!ok && !unlockedPremium.has('Premium')) {
      const key = await callNeonModal('Premium Access', 'Enter Encryption Key:', true);
      if (key !== PREMIUM_ROOM_PASS) { if (key !== null) alert('Access Denied!'); return; }
      unlockedPremium.add('Premium');
    }
  }
  currentRoom = roomName;
  enterChatUI(roomName + ' Server', roomName === 'Premium' || roomName.startsWith('hosted_'));
}

function enterPrivateRoom(roomId, roomName) {
  currentRoom = roomId;
  enterChatUI('🔒 ' + roomName, true);
}

function enterChatUI(title, isPremium) {
  document.getElementById('currentRoomTitle').innerText = title;
  const header = document.getElementById('chatScreenHeader');
  const tray   = document.getElementById('premiumControlsTray');
  const msgs   = document.getElementById('chatMessages');

  if (isPremium) {
    header.className = 'app-header premium-gold-header';
    tray.style.display = 'flex';
    msgs.className = 'chat-messages';
    applyTheme(); applyFont(); loadCustomWallpaper();
  } else {
    header.className = 'app-header';
    tray.style.display = 'none';
    msgs.className = 'chat-messages';
    msgs.style.backgroundImage = '';
  }
  lastVisibleDoc = null; isFetchingOlder = false;
  msgs.innerHTML = '';
  showScreen('chatScreen');
  startMessageListener();
  msgs.removeEventListener('scroll', handleScrollPagination);
  msgs.addEventListener('scroll', handleScrollPagination);
}

function leaveChat() {
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  document.getElementById('chatMessages').removeEventListener('scroll', handleScrollPagination);
  showScreen('roomScreen');
}

// ── MESSAGES  (key fix: docChanges + limitToLast + asc order) ───
function startMessageListener() {
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  const chatEl = document.getElementById('chatMessages');
  const q = db.collection('rooms').doc(currentRoom)
    .collection('messages')
    .orderBy('timestamp', 'asc')
    .limitToLast(MSG_LIMIT);

  unsubMessages = q.onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const doc  = change.doc;
        const data = doc.data();
        if (document.getElementById('msg-' + doc.id)) {
          updateReactionDisplay(doc.id, data.reactions); return;
        }
        if (data.timestamp) {
          const age = Date.now() - data.timestamp.toDate().getTime();
          if (age > MSG_MAX_AGE) {
            db.collection('rooms').doc(currentRoom).collection('messages').doc(doc.id).delete().catch(() => {});
            return;
          }
        }
        if (!lastVisibleDoc) lastVisibleDoc = doc;
        renderBubble(doc.id, data, false);
      }
      if (change.type === 'modified') {
        updateReactionDisplay(change.doc.id, change.doc.data().reactions);
        const el = document.getElementById('msg-' + change.doc.id);
        if (el && change.doc.data().status === 'read') {
          const tick = el.querySelector('.receipt-ticks-neon');
          if (tick) tick.outerHTML = `<i class="fa-solid fa-check-double receipt-ticks-neon received-check"></i>`;
        }
      }
      if (change.type === 'removed') {
        const el = document.getElementById('msg-' + change.doc.id);
        if (el) el.remove();
      }
    });
    if (!isFetchingOlder) chatEl.scrollTop = chatEl.scrollHeight;
  }, err => console.warn('Messages error:', err.code));
}

function handleScrollPagination() {
  const chatEl = document.getElementById('chatMessages');
  if (chatEl.scrollTop > 20 || isFetchingOlder || !lastVisibleDoc) return;
  isFetchingOlder = true;
  const prevH = chatEl.scrollHeight;
  db.collection('rooms').doc(currentRoom).collection('messages')
    .orderBy('timestamp','asc').endBefore(lastVisibleDoc).limitToLast(MSG_LIMIT).get()
    .then(snap => {
      if (snap.docs.length) {
        lastVisibleDoc = snap.docs[0];
        snap.docs.forEach(doc => renderBubble(doc.id, doc.data(), true));
        chatEl.scrollTop = chatEl.scrollHeight - prevH;
      }
      isFetchingOlder = false;
    }).catch(() => { isFetchingOlder = false; });
}

function renderBubble(docId, data, prepend) {
  const chatEl = document.getElementById('chatMessages');
  if (!chatEl || !currentUser) return;
  const isMe = data.uid === currentUser.uid;

  if (!isMe && data.status !== 'read') {
    db.collection('rooms').doc(currentRoom).collection('messages')
      .doc(docId).update({ status: 'read' }).catch(() => {});
  }

  let timeStr = 'now';
  if (data.timestamp) timeStr = data.timestamp.toDate().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });

  let tick = '';
  if (isMe) tick = data.status === 'read'
    ? `<i class="fa-solid fa-check-double receipt-ticks-neon received-check"></i>`
    : `<i class="fa-solid fa-check receipt-ticks-neon"></i>`;

  let body = `<span>${esc(data.text || '')}</span>`;
  if (data.type === 'image')       body = `<img src="${data.url}" class="media-img${data.hd ? ' hd-img' : ''}" alt="img">`;
  if (data.type === 'game_invite') body = `<div class="game-invite-card" onclick="acceptGameInvite('${esc(data.gameId || '')}')"><i class="fa-solid fa-gamepad"></i> Tic-Tac-Toe invite — tap to play!</div>`;

  let nameBadges = '';
  if (data.senderIsOwner) {
    nameBadges = '<span class="badge badge-owner msg-badge"><i class="fa-solid fa-crown" style="font-size:7px"></i> OWNER</span><span class="badge badge-premium msg-badge"><i class="fa-solid fa-gem" style="font-size:7px"></i> PREMIUM</span>';
  } else if (data.senderIsPremium) {
    nameBadges = '<span class="badge badge-premium msg-badge"><i class="fa-solid fa-gem" style="font-size:7px"></i> PREMIUM</span>';
  }
  const nameLine = (data.sender || '')
    ? `<span class="user-tag">${esc(data.sender || '')}${nameBadges}</span>`
    : '';

  const bubble = document.createElement('div');
  bubble.id = 'msg-' + docId;
  bubble.className = `message-wrapper ${isMe ? 'sent' : 'received'} ${stealthOn ? 'stealth-blur' : ''}`;
  bubble.innerHTML = `
    ${nameLine}
    ${body}
    <div class="reaction-display" id="reactions-${docId}"></div>
    <div class="message-meta"><span>${timeStr}</span>${tick}</div>`;

  let ps = false;
  bubble.addEventListener('touchstart', () => { ps = true; pressTimer = setTimeout(() => { if (ps) openReactionPicker(docId); }, 450); });
  bubble.addEventListener('touchend',   () => { ps = false; clearTimeout(pressTimer); });
  bubble.addEventListener('mousedown',  () => { ps = true; pressTimer = setTimeout(() => { if (ps) openReactionPicker(docId); }, 450); });
  bubble.addEventListener('mouseup',    () => { ps = false; clearTimeout(pressTimer); });

  if (prepend) chatEl.insertBefore(bubble, chatEl.firstChild);
  else         chatEl.appendChild(bubble);

  updateReactionDisplay(docId, data.reactions);

  if (selfDestructOn && !prepend) {
    setTimeout(() => db.collection('rooms').doc(currentRoom).collection('messages').doc(docId).delete().catch(() => {}), 10000);
  }
}

function handleMessageSubmit(e) {
  e.preventDefault();
  const inp = document.getElementById('messageInput');
  const txt = inp.value.trim(); if (!txt) return;
  pushMsg({ type:'text', text:txt });
  inp.value = '';
}

function pushMsg(extra) {
  if (!currentUser || !currentRoom) return;
  const isPrem = !!(currentUserProfile && (currentUserProfile.isPremium || currentUserProfile.isOwner));
  const isOwn  = !!(currentUserProfile && currentUserProfile.isOwner);
  db.collection('rooms').doc(currentRoom).collection('messages').add({
    sender: (currentUserProfile && currentUserProfile.nickname) || currentUser.email.split('@')[0],
    uid:    currentUser.uid,
    senderIsPremium: isPrem,
    senderIsOwner:   isOwn,
    status: 'sent',
    reactions: {},
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    ...extra
  });
}

function triggerMockMedia() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = ev => {
      const img = new Image(); img.src = ev.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = hdMediaOn ? 1080 : 400; const q = hdMediaOn ? 0.85 : 0.6;
        const sc = Math.min(1, MAX / img.width);
        canvas.width = img.width * sc; canvas.height = img.height * sc;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const b64 = canvas.toDataURL('image/jpeg', q);
        if (b64.length > 900000) { alert('Image too large.'); return; }
        pushMsg({ type:'image', url:b64, hd:hdMediaOn });
      };
    };
    r.readAsDataURL(file);
  };
  inp.click();
}

// ── PREMIUM TOOLS ────────────────────────────────────────────────
function applyTheme() {
  const el = document.getElementById('chatMessages');
  THEMES.forEach(t => el.classList.remove(t)); el.classList.add(THEMES[themeIndex]);
}
function cyclePremiumBackground() { themeIndex = (themeIndex+1)%THEMES.length; applyTheme(); toast('Theme: '+THEMES[themeIndex].replace('theme-','').toUpperCase()); }
function applyFont() {
  const el = document.getElementById('chatMessages');
  FONTS.forEach(f => el.classList.remove(f)); el.classList.add(FONTS[fontIndex]);
}
function cycleTypographyEffect() { fontIndex = (fontIndex+1)%FONTS.length; applyFont(); toast('Font: '+FONTS[fontIndex].replace('font-','').toUpperCase()); }
function toggleSelfDestructMode() {
  selfDestructOn = !selfDestructOn;
  document.getElementById('destructToggleBtn').classList.toggle('active-mode', selfDestructOn);
  toast(selfDestructOn ? '💥 Self-Destruct ON (10s)' : 'Self-Destruct OFF');
}
function toggleHighQualityMedia() {
  hdMediaOn = !hdMediaOn;
  document.getElementById('mediaQualityToggleBtn').classList.toggle('active-mode', hdMediaOn);
  toast(hdMediaOn ? '📸 HD Stream ON' : 'HD Stream OFF');
}
function toggleStealthMode() {
  stealthOn = !stealthOn;
  document.getElementById('stealthToggleBtn').classList.toggle('active-mode', stealthOn);
  document.querySelectorAll('.message-wrapper').forEach(m => m.classList.toggle('stealth-blur', stealthOn));
  toast(stealthOn ? '🥷 Stealth ON (tap to reveal)' : 'Stealth OFF');
}
function triggerWallpaperUpload() {
  const inp = document.createElement('input'); inp.type='file'; inp.accept='image/*';
  inp.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader(); r.onload = ev => {
      const img = new Image(); img.src = ev.target.result;
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const sc = Math.min(1, 720/img.width);
        canvas.width = img.width*sc; canvas.height = img.height*sc;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const c = canvas.toDataURL('image/jpeg', 0.6);
        if (c.length > 900000) { alert('Wallpaper too large.'); return; }
        await db.collection('rooms').doc(currentRoom).set({ wallpaper: c }, { merge:true });
        const msgs = document.getElementById('chatMessages');
        msgs.style.backgroundImage = `url(${c})`; msgs.style.backgroundSize = 'cover';
      };
    }; r.readAsDataURL(file);
  }; inp.click();
}
async function loadCustomWallpaper() {
  const doc = await db.collection('rooms').doc(currentRoom).get();
  const msgs = document.getElementById('chatMessages');
  if (doc.exists && doc.data().wallpaper) { msgs.style.backgroundImage = `url(${doc.data().wallpaper})`; msgs.style.backgroundSize = 'cover'; }
  else msgs.style.backgroundImage = '';
}

// ── HOSTED ROOMS (premium feature) ──────────────────────────────
function genCode() { return Math.random().toString(36).substring(2,8).toUpperCase(); }

async function openHostedRoomsList() {
  if (!currentUserProfile || !currentUserProfile.isPremium) { showUpsell(); return; }
  const hosted = currentUserProfile.hostedRooms || [];
  const msgEl  = document.getElementById('chatRoomTitle'); // reuse owner tab approach via inline page
  // show inside chat area actually — open a sheet. We'll use a quick modal-like approach via showScreen
  // We build content and show ownerServerScreen in 'rooms' tab filtered to current user
  // Simpler: just show a screen for hosted rooms
  alert(`Your servers (${hosted.length}/${HOST_LIMIT}):\n` +
    (hosted.length ? hosted.map(r => `• ${r.name} (Code: ${r.inviteCode})`).join('\n') : 'None yet.') +
    '\n\nUse Owner Server > Rooms tab or use the cards on Home screen.');
}

async function createHostedRoom() {
  if (!currentUserProfile || !currentUserProfile.isPremium) { showUpsell(); return; }
  const hosted = currentUserProfile.hostedRooms || [];
  if (hosted.length >= HOST_LIMIT) { alert(`Max ${HOST_LIMIT} servers allowed.`); return; }
  const name = await callNeonModal('New Server', 'Enter a name for your server (3-20 chars):', true, 'text');
  if (!name || !name.trim()) return;
  const n = name.trim();
  if (n.length < 3 || n.length > 20) { alert('Server name: 3-20 chars.'); return; }
  if (hosted.some(r => r.name.toLowerCase() === n.toLowerCase())) { alert('You already have a server with that name.'); return; }
  const roomId = 'hosted_' + currentUser.uid + '_' + Date.now();
  const code   = genCode();
  const newRoom = { id: roomId, name: n, inviteCode: code, ownerUid: currentUser.uid };
  const updated = [...hosted, newRoom];
  await db.collection('users').doc(currentUser.uid).update({ hostedRooms: updated });
  await db.collection('inviteCodes').doc(code).set({ roomId, roomName: n, ownerUid: currentUser.uid });
  toast(`Server "${n}" created! Code: ${code}`);
}

async function joinByInviteCode() {
  const code = await callNeonModal('Join Server', 'Enter the 6-letter invite code:', true, 'text');
  if (!code || !code.trim()) return;
  const doc = await db.collection('inviteCodes').doc(code.trim().toUpperCase()).get();
  if (!doc.exists) { alert('Invalid invite code.'); return; }
  const d = doc.data();
  enterPrivateRoom(d.roomId, d.roomName);
}

// ── SETTINGS ─────────────────────────────────────────────────────
async function openSettingsMenu() {
  const ch = await callNeonModal('Settings', "Type 'name' to change username or 'password' to change password:", true, 'text');
  if (!ch) return;
  if (ch.trim().toLowerCase() === 'name') openChangeUsername();
  else if (ch.trim().toLowerCase() === 'password') changePassword();
  else alert("Type 'name' or 'password'.");
}
async function changePassword() {
  const cur = await callNeonModal('Current Password', 'Enter your CURRENT password:', true);
  if (!cur) return;
  const nw = await callNeonModal('New Password', 'Enter your NEW password (min 6 chars):', true);
  if (!nw || nw.length < 6) { alert('Min 6 chars.'); return; }
  try {
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, cur);
    await currentUser.reauthenticateWithCredential(cred);
    await currentUser.updatePassword(nw);
    toast('Password updated ✅');
  } catch (err) { alert('Error: ' + err.message); }
}

// ── REACTIONS ─────────────────────────────────────────────────────
function openReactionPicker(msgId) { activeReactionMsgId = msgId; document.getElementById('reactionPicker').classList.add('active'); }
function closeReactionPicker() { document.getElementById('reactionPicker').classList.remove('active'); activeReactionMsgId = null; }
async function sendReaction(emoji) {
  if (!activeReactionMsgId) return;
  const id = activeReactionMsgId; closeReactionPicker();
  const ref = db.collection('rooms').doc(currentRoom).collection('messages').doc(id);
  await db.runTransaction(async t => {
    const doc = await t.get(ref); if (!doc.exists) return;
    const reactions = doc.data().reactions || {};
    reactions[currentUser.uid] = emoji;
    t.update(ref, { reactions });
  });
}
function updateReactionDisplay(docId, reactions) {
  const el = document.getElementById('reactions-' + docId);
  if (!el || !reactions) return;
  const counts = {};
  Object.values(reactions).forEach(em => { counts[em] = (counts[em]||0)+1; });
  el.innerHTML = Object.entries(counts).map(([em,c]) => `<span class="reaction-pill">${em}${c>1?' '+c:''}</span>`).join('');
}
document.addEventListener('click', e => {
  const p = document.getElementById('reactionPicker');
  if (p && p.classList.contains('active') && !p.contains(e.target)) closeReactionPicker();
});

// ── TIC-TAC-TOE ──────────────────────────────────────────────────
async function openGameMenu() {
  const ch = await callNeonModal('Mini Games', "Type 'tictactoe' to invite room:", true, 'text');
  if (!ch) return;
  if (ch.trim().toLowerCase() === 'tictactoe') startTTT();
}
async function startTTT() {
  const ref = db.collection('rooms').doc(currentRoom).collection('games').doc();
  await ref.set({ board:Array(9).fill(''), turn:'X', playerX:currentUser.uid, playerO:null, winner:null, createdAt:firebase.firestore.FieldValue.serverTimestamp() });
  pushMsg({ type:'game_invite', text:'Tic-Tac-Toe invite', gameId: ref.id });
  enterTTT(ref.id,'X');
}
async function acceptGameInvite(gameId) {
  if (!gameId) { alert('This invite has no game attached — ask them to send a fresh invite.'); return; }
  try {
    const ref = db.collection('rooms').doc(currentRoom).collection('games').doc(gameId);
    const doc = await ref.get();
    if (!doc.exists) { alert('Game invite expired or was deleted.'); return; }
    const d = doc.data();
    if (d.playerX === currentUser.uid) { enterTTT(gameId,'X'); return; }
    if (d.playerO && d.playerO !== currentUser.uid) { alert('This game already has two players.'); return; }
    if (!d.playerO) await ref.update({ playerO: currentUser.uid });
    enterTTT(gameId,'O');
  } catch (e) {
    alert('Could not join game: ' + e.message);
  }
}
function enterTTT(gameId, sym) {
  tttGameId = gameId; tttSymbol = sym;
  showScreen('ticTacToeScreen');
  if (unsubGame) unsubGame();
  unsubGame = db.collection('rooms').doc(currentRoom).collection('games').doc(gameId).onSnapshot(doc => {
    if (!doc.exists) return;
    const d = doc.data(); tttBoard = d.board;
    renderTTTBoard();
    const st = document.getElementById('tttStatus');
    if (d.winner) st.innerText = d.winner === 'draw' ? "Draw!" : `${d.winner} wins!`;
    else if (!d.playerO) st.innerText = 'Waiting for opponent...';
    else st.innerText = d.turn === tttSymbol ? 'Your turn ⚡' : "Opponent's turn...";
  });
}
function renderTTTBoard() {
  document.getElementById('tttBoard').innerHTML = tttBoard.map((c,i) =>
    `<div class="ttt-cell" onclick="tttMove(${i})">${c}</div>`).join('');
}
async function tttMove(idx) {
  if (!tttGameId) return;
  const ref = db.collection('rooms').doc(currentRoom).collection('games').doc(tttGameId);
  await db.runTransaction(async t => {
    const doc = await t.get(ref); const d = doc.data();
    if (d.winner || d.turn !== tttSymbol || d.board[idx] !== '') return;
    const b = [...d.board]; b[idx] = tttSymbol;
    const w = checkWin(b);
    t.update(ref, { board:b, turn:tttSymbol==='X'?'O':'X', winner:w||null });
  });
}
function checkWin(b) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,c,d] of lines) if (b[a] && b[a]===b[c] && b[a]===b[d]) return b[a];
  return b.every(c=>c!=='') ? 'draw' : null;
}
function closeTicTacToe() { if (unsubGame) { unsubGame(); unsubGame=null; } tttGameId=null; showScreen('chatScreen'); }

// ── OWNER SERVER ─────────────────────────────────────────────────
async function openOwnerServer() {
  if (!ownerVerified) {
    const pass = await callNeonModal('Owner Server', 'Enter Owner Password:', true);
    if (pass !== OWNER_SERVER_PASS) { if (pass !== null) alert('Wrong password.'); return; }
    ownerVerified = true;
    // Make this user isOwner in Firestore if not already
    if (currentUserProfile && !currentUserProfile.isOwner) {
      await db.collection('users').doc(currentUser.uid).update({ isOwner: true, isPremium: true });
    }
  }
  showScreen('ownerServerScreen');
  // reset tabs
  document.querySelectorAll('.mgmt-tab').forEach((b,i) => b.classList.toggle('active', i===0));
  ownerTabActive = 'members';
  loadOwnerTab('members');
}

function switchOwnerTab(tab, btn) {
  document.querySelectorAll('.mgmt-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  ownerTabActive = tab;
  loadOwnerTab(tab);
}

async function loadOwnerTab(tab) {
  const c = document.getElementById('ownerServerContent');
  c.innerHTML = '<p class="empty-log" style="padding-top:40px">Loading...</p>';
  if (tab === 'members') await renderMembersTab(c);
  if (tab === 'blocked') await renderBlockedTab(c);
  if (tab === 'rooms')   await renderRoomsTab(c);
  if (tab === 'stats')   await renderStatsTab(c);
}

// ─── MEMBERS TAB ─────────────────────────────────────────────────
async function renderMembersTab(c) {
  let all = [];
  try {
    const snap = await db.collection('users').orderBy('createdAt','desc').get();
    snap.forEach(d => all.push({ uid:d.id, ...d.data() }));
  } catch (e) {
    c.innerHTML = `<p class="empty-log" style="color:var(--neon-pink)">⚠️ Failed to load members: ${esc(e.message)}<br><br>This usually means your Firestore Security Rules don't allow the owner to read the full "users" collection. Check Firebase Console → Firestore → Rules.</p>`;
    return;
  }
  const active = all.filter(u => !u.isBlocked);

  // top bar: grant premium / owner by username
  c.innerHTML = `
    <div class="dashboard-section" style="margin-bottom:10px">
      <h4><i class="fa-solid fa-user-plus"></i> Grant Badge by Username</h4>
      <div style="display:flex;gap:8px;margin-top:6px">
        <input type="text" id="addMemberInput" placeholder="Enter exact username..."
          style="flex:1;padding:9px 12px;background:#000;border:1px solid #16223d;color:#fff;border-radius:8px;font-size:13px;outline:none">
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="dash-btn add" style="flex:1;padding:9px 14px;font-size:12px" onclick="ownerGrantByUsername('premium')">
          <i class="fa-solid fa-gem"></i> Grant Premium
        </button>
        <button class="dash-btn makeown" style="flex:1;padding:9px 14px;font-size:12px" onclick="ownerGrantByUsername('owner')">
          <i class="fa-solid fa-crown"></i> Grant Owner
        </button>
      </div>
      <p id="addMemberMsg" style="font-size:11px;margin-top:6px;color:var(--text-secondary)"></p>
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-num">${all.length}</div><div class="stat-label">Total</div></div>
      <div class="stat-card"><div class="stat-num">${all.filter(u=>u.isPremium||u.isOwner).length}</div><div class="stat-label">Premium</div></div>
    </div>
    <div class="dashboard-section">
      <h4><i class="fa-solid fa-users"></i> Active Members (${active.length})</h4>
      <ul class="dash-list">
        ${active.map(u => {
          const now = new Date(); const tm = `${now.getFullYear()}-${now.getMonth()}`;
          const chCount = (u.usernameChanges||[]).filter(x=>x.month===tm).length;
          return `<li>
            <div style="min-width:0">
              <div style="font-weight:bold;font-size:12px">${esc(u.nickname||'(no name)')}
                ${(u.isPremium||u.isOwner)?'<span class="badge badge-premium"><i class="fa-solid fa-gem" style="font-size:7px"></i> PREMIUM</span>':''}
                ${u.isOwner?'<span class="badge badge-owner"><i class="fa-solid fa-crown" style="font-size:7px"></i> OWNER</span>':''}
              </div>
              <div style="font-size:10px;color:var(--text-secondary)">${esc(u.email||'')} • Changes: ${chCount}/${USERNAME_MONTH_CAP}</div>
            </div>
            <div class="btn-row">
              ${(!u.isPremium && !u.isOwner)
                ? `<button class="dash-btn add" onclick="ownerGrantPremium('${u.uid}',true)">Grant Premium</button>`
                : (u.isOwner ? '' : `<button class="dash-btn remove" onclick="ownerGrantPremium('${u.uid}',false)">Revoke</button>`)}
              ${!u.isOwner
                ? `<button class="dash-btn makeown" onclick="ownerMakeOwner('${u.uid}')">Make Owner</button>`
                : ''}
              ${chCount >= USERNAME_MONTH_CAP && !u.isOwner
                ? `<button class="dash-btn enter" onclick="ownerGrantUsernameChange('${u.uid}')">+Name Change</button>`
                : ''}
              ${!u.isOwner
                ? `<button class="dash-btn block" onclick="ownerBlockUser('${u.uid}','${esc(u.nickname||'')}')">Block</button>`
                : ''}
            </div>
          </li>`;
        }).join('')}
      </ul>
    </div>`;
}

// Grant Premium or Owner by exact username (typed in owner panel)
async function ownerGrantByUsername(type) {
  const input = document.getElementById('addMemberInput');
  const msg   = document.getElementById('addMemberMsg');
  const nick  = (input ? input.value.trim() : '');
  if (!nick) { if (msg) { msg.style.color='var(--neon-pink)'; msg.innerText = '⚠️ Enter a username.'; } return; }

  try {
    const snap = await db.collection('users').where('nicknameLower','==',nick.toLowerCase()).limit(1).get();
    if (snap.empty) { if (msg) { msg.style.color='var(--neon-pink)'; msg.innerText = `❌ No user found with username "${nick}".`; } return; }

    const doc  = snap.docs[0];
    const data = doc.data();

    if (type === 'owner') {
      if (data.isOwner) {
        if (msg) { msg.style.color='var(--gold-accent)'; msg.innerText = `⚡ "${data.nickname}" is already an Owner.`; }
        return;
      }
      await db.collection('users').doc(doc.id).update({ isOwner: true, isPremium: true });
      if (msg) { msg.style.color='var(--success)'; msg.innerText = `👑 Owner + Premium badge granted to "${data.nickname}"!`; }
    } else {
      if (data.isPremium || data.isOwner) {
        if (msg) { msg.style.color='var(--gold-accent)'; msg.innerText = `⚡ "${data.nickname}" already has Premium access.`; }
        return;
      }
      await db.collection('users').doc(doc.id).update({ isPremium: true });
      if (msg) { msg.style.color='var(--success)'; msg.innerText = `✅ Premium badge granted to "${data.nickname}"!`; }
    }
    if (input) input.value = '';
    setTimeout(() => loadOwnerTab('members'), 1200);
  } catch (e) {
    if (msg) { msg.style.color='var(--neon-pink)'; msg.innerText = `⚠️ Error: ${e.message}`; }
  }
}

// ─── BLOCKED TAB ─────────────────────────────────────────────────
async function renderBlockedTab(c) {
  const snap = await db.collection('users').where('isBlocked','==',true).get();
  const list = []; snap.forEach(d => list.push({ uid:d.id, ...d.data() }));
  c.innerHTML = `
    <div class="dashboard-section">
      <h4><i class="fa-solid fa-ban"></i> Blocked Users (${list.length})</h4>
      ${list.length === 0 ? '<p class="empty-log">No blocked users</p>' :
        `<ul class="dash-list">
          ${list.map(u => `<li>
            <div>
              <div style="font-weight:bold;font-size:12px">${esc(u.nickname||'')} <span class="badge badge-blocked"><i class="fa-solid fa-ban" style="font-size:7px"></i> BLOCKED</span></div>
              <div style="font-size:10px;color:var(--text-secondary)">${esc(u.email||'')}</div>
            </div>
            <button class="dash-btn unblock" onclick="ownerUnblockUser('${u.uid}')">Unblock</button>
          </li>`).join('')}
        </ul>`}
    </div>`;
}

// ─── ROOMS TAB ───────────────────────────────────────────────────
async function renderRoomsTab(c) {
  const snap  = await db.collection('users').where('isPremium','==',true).get();
  const rooms = [];
  snap.forEach(d => {
    const dt = d.data();
    (dt.hostedRooms||[]).forEach(r => rooms.push({ ownerNick:dt.nickname, ownerUid:d.id, ...r }));
  });
  c.innerHTML = `
    <div class="dashboard-section">
      <h4><i class="fa-solid fa-server"></i> Private Hosted Servers (${rooms.length})</h4>
      ${rooms.length === 0 ? '<p class="empty-log">No private servers yet</p>' :
        `<ul class="dash-list">
          ${rooms.map(r => `<li>
            <div>
              <div style="font-weight:bold;font-size:12px">🔒 ${esc(r.name)}</div>
              <div style="font-size:10px;color:var(--text-secondary)">By: ${esc(r.ownerNick)} • Code: ${r.inviteCode}</div>
            </div>
            <button class="dash-btn danger" onclick="ownerDeleteRoom('${r.ownerUid}','${r.id}','${esc(r.name)}')">Delete</button>
          </li>`).join('')}
        </ul>`}
    </div>
    <div class="dashboard-section">
      <h4><i class="fa-solid fa-earth-asia"></i> Built-in Rooms</h4>
      <ul class="dash-list">
        <li><span>Public Chatroom</span><span style="color:var(--success);font-size:11px">● Active</span></li>
        <li><span>Premium Server</span><span style="color:var(--gold);font-size:11px">● Active</span></li>
      </ul>
    </div>`;
}

// ─── STATS TAB ───────────────────────────────────────────────────
async function renderStatsTab(c) {
  const snap = await db.collection('users').get();
  let total=0,prem=0,blk=0,hosted=0;
  snap.forEach(d => { const dt=d.data(); total++; if(dt.isPremium||dt.isOwner)prem++; if(dt.isBlocked)blk++; if(dt.hostedRooms)hosted+=dt.hostedRooms.length; });
  c.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-num">${total}</div><div class="stat-label">Total Users</div></div>
      <div class="stat-card"><div class="stat-num">${prem}</div><div class="stat-label">Premium</div></div>
      <div class="stat-card"><div class="stat-num">${blk}</div><div class="stat-label">Blocked</div></div>
      <div class="stat-card"><div class="stat-num">${hosted}</div><div class="stat-label">Private Rooms</div></div>
    </div>
    <div class="dashboard-section">
      <h4><i class="fa-solid fa-circle-info"></i> System Info</h4>
      <ul class="dash-list">
        <li><span>Auto-Wipe</span><span style="color:var(--neon-cyan)">12 Hours</span></li>
        <li><span>Self-Destruct</span><span style="color:var(--neon-cyan)">10 Seconds</span></li>
        <li><span>Max Hosted Rooms</span><span style="color:var(--gold)">${HOST_LIMIT} per premium user</span></li>
        <li><span>Username Changes</span><span style="color:var(--neon-cyan)">${USERNAME_MONTH_CAP} per month</span></li>
      </ul>
    </div>`;
}

// ─── OWNER ACTIONS ───────────────────────────────────────────────
async function ownerGrantPremium(uid, grant) {
  try {
    await db.collection('users').doc(uid).update({ isPremium: grant });
    toast(grant ? 'Premium granted ✅' : 'Premium revoked');
    loadOwnerTab(ownerTabActive);
  } catch (e) {
    alert('Failed to update premium status: ' + e.message + '\n\nThis usually means your Firestore Security Rules are blocking the owner from editing other users\' documents.');
  }
}
async function ownerMakeOwner(uid) {
  if (!confirm('Make this user an Owner? They will have full control.')) return;
  try {
    await db.collection('users').doc(uid).update({ isOwner: true, isPremium: true });
    toast('Owner status granted 👑');
    loadOwnerTab(ownerTabActive);
  } catch (e) {
    alert('Failed to grant Owner: ' + e.message + '\n\nThis usually means your Firestore Security Rules are blocking the owner from editing other users\' documents.');
  }
}
async function ownerBlockUser(uid, nick) {
  if (!confirm(`Block "${nick}"? They won't be able to log in.`)) return;
  try {
    await db.collection('users').doc(uid).update({ isBlocked: true });
    toast('User blocked 🚫');
    loadOwnerTab(ownerTabActive);
  } catch (e) {
    alert('Failed to block user: ' + e.message);
  }
}
async function ownerUnblockUser(uid) {
  try {
    await db.collection('users').doc(uid).update({ isBlocked: false });
    toast('User unblocked ✅');
    loadOwnerTab(ownerTabActive);
  } catch (e) {
    alert('Failed to unblock user: ' + e.message);
  }
}
async function ownerDeleteRoom(ownerUid, roomId, roomName) {
  if (!confirm(`Delete server "${roomName}" permanently?`)) return;
  try {
    const doc = await db.collection('users').doc(ownerUid).get();
    const updated = (doc.data().hostedRooms||[]).filter(r => r.id !== roomId);
    await db.collection('users').doc(ownerUid).update({ hostedRooms: updated });
    toast('Server deleted');
    loadOwnerTab(ownerTabActive);
  } catch (e) {
    alert('Failed to delete server: ' + e.message);
  }
}

// ── UPSELL ───────────────────────────────────────────────────────
function showUpsell() { document.getElementById('upsellModal').classList.add('active'); }

// ═══════════════════════════════════════════════════════════════
// PROFILE SYSTEM (bio, photo, about — visible to others via search)
// ═══════════════════════════════════════════════════════════════
async function openMyProfile() {
  showScreen('profileScreen');
  renderMyProfile();
}

function renderMyProfile() {
  const p = currentUserProfile || {};
  const c = document.getElementById('profileScreenContent');
  c.innerHTML = `
    <div class="dashboard-section" style="text-align:center">
      <div class="profile-pic-wrap" onclick="triggerProfilePicUpload()">
        ${p.photoURL ? `<img src="${p.photoURL}" class="profile-pic-img">` : `<div class="profile-pic-placeholder"><i class="fa-solid fa-camera"></i></div>`}
      </div>
      <p style="font-size:11px;color:var(--text-secondary);margin-top:6px">Tap photo to change</p>
      <h3 style="margin-top:10px">${esc(p.nickname || '')}</h3>
    </div>
    <div class="dashboard-section">
      <h4><i class="fa-solid fa-pen"></i> About</h4>
      <textarea id="profileAboutInput" class="profile-textarea" placeholder="Write something about yourself...">${esc(p.about || '')}</textarea>
      <h4 style="margin-top:14px"><i class="fa-solid fa-quote-left"></i> Bio</h4>
      <textarea id="profileBioInput" class="profile-textarea" placeholder="Short bio / status...">${esc(p.bio || '')}</textarea>
      <button class="dash-btn add" style="width:100%;margin-top:12px" onclick="saveMyProfile()">Save Profile</button>
    </div>
  `;
}

function triggerProfilePicUpload() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.src = ev.target.result;
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const SIZE = 240;
        const scale = Math.min(1, SIZE / Math.max(img.width, img.height));
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.7);
        if (compressed.length > 900000) {
          alert('Photo too large even after compression. Try a smaller image.');
          return;
        }
        await db.collection('users').doc(currentUser.uid).update({ photoURL: compressed });
        renderMyProfile();
      };
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

async function saveMyProfile() {
  const about = document.getElementById('profileAboutInput').value.trim();
  const bio = document.getElementById('profileBioInput').value.trim();
  await db.collection('users').doc(currentUser.uid).update({ about, bio });
  alert('Profile saved!');
}

// ═══════════════════════════════════════════════════════════════
// FRIEND SYSTEM: search, request, accept/reject, list, private chat
// ═══════════════════════════════════════════════════════════════
function friendDocId(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

async function openFriendsScreen() {
  showScreen('friendsScreen');
  renderFriendsScreen();
}

async function renderFriendsScreen() {
  const c = document.getElementById('friendsScreenContent');
  c.innerHTML = `<p class="empty-log">Loading...</p>`;

  const myUid = currentUser.uid;

  // Incoming requests: docs where toUid == me and status pending
  const incomingSnap = await db.collection('friendRequests')
    .where('toUid', '==', myUid).where('status', '==', 'pending').get();

  // Outgoing requests: docs where fromUid == me and status pending
  const outgoingSnap = await db.collection('friendRequests')
    .where('fromUid', '==', myUid).where('status', '==', 'pending').get();

  // Accepted friendships
  const friendsSnap1 = await db.collection('friendRequests')
    .where('fromUid', '==', myUid).where('status', '==', 'accepted').get();
  const friendsSnap2 = await db.collection('friendRequests')
    .where('toUid', '==', myUid).where('status', '==', 'accepted').get();

  const incoming = [];
  for (const doc of incomingSnap.docs) {
    const d = doc.data();
    const userDoc = await db.collection('users').doc(d.fromUid).get();
    if (userDoc.exists) incoming.push({ reqId: doc.id, uid: d.fromUid, ...userDoc.data() });
  }

  const outgoing = [];
  for (const doc of outgoingSnap.docs) {
    const d = doc.data();
    const userDoc = await db.collection('users').doc(d.toUid).get();
    if (userDoc.exists) outgoing.push({ reqId: doc.id, uid: d.toUid, ...userDoc.data() });
  }

  const friends = [];
  for (const doc of [...friendsSnap1.docs, ...friendsSnap2.docs]) {
    const d = doc.data();
    const friendUid = d.fromUid === myUid ? d.toUid : d.fromUid;
    const userDoc = await db.collection('users').doc(friendUid).get();
    if (userDoc.exists) friends.push({ uid: friendUid, ...userDoc.data() });
  }

  c.innerHTML = `
    ${incoming.length > 0 ? `
    <div class="dashboard-section">
      <h4><i class="fa-solid fa-user-clock"></i> Friend Requests (${incoming.length})</h4>
      <ul class="dash-list">
        ${incoming.map(u => `
          <li>
            <span onclick="viewUserProfile('${u.uid}')" style="cursor:pointer">${esc(u.nickname || '?')}</span>
            <span style="display:flex;gap:6px">
              <button class="dash-btn add" onclick="respondFriendRequest('${u.reqId}','accepted',this)">Accept</button>
              <button class="dash-btn remove" onclick="respondFriendRequest('${u.reqId}','rejected',this)">Reject</button>
            </span>
          </li>
        `).join('')}
      </ul>
    </div>` : ''}

    <div class="dashboard-section">
      <h4><i class="fa-solid fa-user-group"></i> Friends (${friends.length})</h4>
      <ul class="dash-list">
        ${friends.length === 0 ? '<li class="empty-log">No friends yet. Tap search to find people.</li>' : ''}
        ${friends.map(u => `
          <li>
            <span onclick="viewUserProfile('${u.uid}')" style="cursor:pointer">${esc(u.nickname || '?')}</span>
            <button class="dash-btn add" onclick="openFriendChat('${u.uid}','${esc(u.nickname || '')}')">Chat</button>
          </li>
        `).join('')}
      </ul>
    </div>

    ${outgoing.length > 0 ? `
    <div class="dashboard-section">
      <h4><i class="fa-solid fa-paper-plane"></i> Sent Requests (${outgoing.length})</h4>
      <ul class="dash-list">
        ${outgoing.map(u => `<li><span>${esc(u.nickname || '?')}</span><span class="empty-log" style="font-size:11px">Pending...</span></li>`).join('')}
      </ul>
    </div>` : ''}
  `;
}

async function respondFriendRequest(reqId, status, btn) {
  if (status === 'rejected') {
    // Delete instead of just marking rejected, so the sender's "Sended"
    // state clears and they can send a fresh request later.
    await db.collection('friendRequests').doc(reqId).delete();
    if (btn && btn.closest('li')) { btn.closest('li').remove(); return; }
  } else {
    await db.collection('friendRequests').doc(reqId).update({ status });
  }
  renderFriendsScreen();
}

async function openFriendSearch() {
  const query = await callNeonModal('Find Friends', 'Type a username to search:', true, 'text');
  if (!query || !query.trim()) return;

  const lower = query.trim().toLowerCase();
  const snap = await db.collection('users')
    .where('nicknameLower', '>=', lower).where('nicknameLower', '<=', lower + '\uf8ff').limit(10).get();

  if (snap.empty) {
    alert('No users found with that username.');
    return;
  }

  const results = [];
  snap.forEach(doc => { if (doc.id !== currentUser.uid) results.push({ uid: doc.id, ...doc.data() }); });

  if (results.length === 0) {
    alert('No matching users found.');
    return;
  }

  const myUid = currentUser.uid;

  // Figure out current relationship status with each result so the button
  // reflects reality (Add Friend / Sended / Accept+Reject / Friends).
  for (const u of results) {
    const docId = friendDocId(myUid, u.uid);
    const reqDoc = await db.collection('friendRequests').doc(docId).get();
    if (reqDoc.exists) {
      const d = reqDoc.data();
      u.reqId = reqDoc.id;
      if (d.status === 'accepted') u.relation = 'friends';
      else if (d.status === 'pending' && d.fromUid === myUid) u.relation = 'sent';
      else if (d.status === 'pending' && d.toUid === myUid) u.relation = 'incoming';
      else u.relation = 'none'; // rejected → can send again
    } else {
      u.relation = 'none';
    }
  }

  const c = document.getElementById('friendsScreenContent');
  c.innerHTML = `
    <div class="dashboard-section">
      <h4><i class="fa-solid fa-magnifying-glass"></i> Search Results</h4>
      <ul class="dash-list">
        ${results.map(u => `
          <li id="searchRow_${u.uid}">
            <span onclick="viewUserProfile('${u.uid}')" style="cursor:pointer">${esc(u.nickname || '?')}</span>
            ${renderFriendActionHtml(u)}
          </li>
        `).join('')}
      </ul>
      <button class="dash-btn" style="width:100%;margin-top:10px;background:#16223d;color:#fff" onclick="renderFriendsScreen()">Back to Friends</button>
    </div>
  `;
}

// Returns the right action markup for a search-result row based on relation status.
function renderFriendActionHtml(u) {
  if (u.relation === 'friends') {
    return `<button class="dash-btn add" onclick="openFriendChat('${u.uid}','${esc(u.nickname || '')}')">Chat</button>`;
  }
  if (u.relation === 'sent') {
    return `<span class="empty-log" style="font-size:11px">Sended</span>`;
  }
  if (u.relation === 'incoming') {
    return `<span style="display:flex;gap:6px">
      <button class="dash-btn add" onclick="respondFriendRequest('${u.reqId}','accepted',this)">Accept</button>
      <button class="dash-btn remove" onclick="respondFriendRequest('${u.reqId}','rejected',this)">Reject</button>
    </span>`;
  }
  return `<button class="dash-btn add" onclick="sendFriendRequest('${u.uid}', this)">Add Friend</button>`;
}

async function sendFriendRequest(toUid, btn) {
  const myUid = currentUser.uid;
  const docId = friendDocId(myUid, toUid);

  const existing = await db.collection('friendRequests').doc(docId).get();
  if (existing.exists) {
    const status = existing.data().status;
    if (status === 'accepted') { alert('You are already friends.'); return; }
    if (status === 'pending') { alert('A request is already pending.'); return; }
  }

  await db.collection('friendRequests').doc(docId).set({
    fromUid: myUid, toUid: toUid, status: 'pending',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  // Update the button in place instead of popping an alert + leaving the page.
  if (btn) {
    const span = document.createElement('span');
    span.className = 'empty-log';
    span.style.fontSize = '11px';
    span.innerText = 'Sended';
    btn.replaceWith(span);
  } else {
    renderFriendsScreen();
  }
}

async function viewUserProfile(uid) {
  const doc = await db.collection('users').doc(uid).get();
  if (!doc.exists) { alert('User not found.'); return; }
  const u = doc.data();

  const docId = friendDocId(currentUser.uid, uid);
  const reqDoc = await db.collection('friendRequests').doc(docId).get();
  let actionHtml = `<button class="dash-btn add" style="width:100%" onclick="sendFriendRequest('${uid}', this)">Add Friend</button>`;
  if (reqDoc.exists) {
    const d = reqDoc.data();
    if (d.status === 'accepted') {
      actionHtml = `<button class="dash-btn add" style="width:100%" onclick="openFriendChat('${uid}','${esc(u.nickname || '')}')">Chat</button>`;
    } else if (d.status === 'pending' && d.fromUid === currentUser.uid) {
      actionHtml = `<span class="empty-log">Sended</span>`;
    } else if (d.status === 'pending' && d.toUid === currentUser.uid) {
      actionHtml = `<span style="display:flex;gap:6px">
        <button class="dash-btn add" style="flex:1" onclick="respondFriendRequest('${reqDoc.id}','accepted',this)">Accept</button>
        <button class="dash-btn remove" style="flex:1" onclick="respondFriendRequest('${reqDoc.id}','rejected',this)">Reject</button>
      </span>`;
    }
  }

  document.getElementById('viewProfileTitle').innerText = u.nickname || 'Profile';
  document.getElementById('viewProfileContent').innerHTML = `
    <div class="dashboard-section" style="text-align:center">
      ${u.photoURL ? `<img src="${u.photoURL}" class="profile-pic-img">` : `<div class="profile-pic-placeholder"><i class="fa-solid fa-user"></i></div>`}
      <h3 style="margin-top:10px">${esc(u.nickname || '?')}</h3>
      ${u.isPremium ? '<span class="premium-badge-gold">PREMIUM</span>' : ''}
    </div>
    <div class="dashboard-section">
      <h4>About</h4>
      <p style="font-size:13px;color:var(--text-secondary)">${esc(u.about || 'No about info yet.')}</p>
      <h4 style="margin-top:14px">Bio</h4>
      <p style="font-size:13px;color:var(--text-secondary)">${esc(u.bio || 'No bio yet.')}</p>
    </div>
    <div class="dashboard-section">
      ${actionHtml}
    </div>
  `;
  showScreen('viewProfileScreen');
}

function closeViewProfile() {
  showScreen('friendsScreen');
}

// Private 1-on-1 chat — reuses the normal chat screen with a deterministic room id
async function openFriendChat(friendUid, friendNickname) {
  if (currentUserProfile && currentUserProfile.isBlocked) { alert('Account blocked.'); return; }
  const roomId = 'dm_' + friendDocId(currentUser.uid, friendUid);
  currentRoom = roomId;
  enterPrivateRoom(roomId, friendNickname);
}


document.addEventListener('DOMContentLoaded', () => {
  toggleAuthMode(false);

  // Restore remember-me
  const rem = localStorage.getItem('u2_rem') === '1';
  document.getElementById('rememberMe').checked = rem;
  if (rem) {
    const sv = localStorage.getItem('u2_email');
    if (sv) document.getElementById('authEmail').value = sv;
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
  } else {
    auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).catch(() => {});
  }

  // Enter key in message box
  const msgInput = document.getElementById('messageInput');
  if (msgInput) {
    msgInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleMessageSubmit(e); }
    });
  }
});
