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

// Initializing the Engine with Offline Resiliency Enabled
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Enabling Offline Caching Configuration
db.enablePersistence().catch((err) => {
    console.warn("Offline persistence warning: ", err.code);
});

let currentUser = null;
let currentRoom = "";
let unsubscribeMessages = null;

// Routing Control
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const targetScreen = document.getElementById(screenId);
    if(targetScreen) targetScreen.classList.add('active');
}

// FIX: Handle the Redirect Result when the page loads back up from Google
auth.getRedirectResult()
    .then((result) => {
        if (result.user) {
            console.log("Successfully logged in via redirect:", result.user.displayName);
        }
    })
    .catch((error) => {
        console.error("Redirect Auth Error:", error);
        alert("Google Sign-In Error: " + error.message + "\nEnsure Google provider is enabled in Firebase console.");
    });

// Authentication Session Event Watcher
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        document.getElementById('welcomeUser').innerText = user.displayName || "Active Identity";
        if (user.photoURL) document.getElementById('userAvatar').src = user.photoURL;
        showScreen('roomScreen');
    } else {
        showScreen('authScreen');
    }
});

// FIX: Optimized Mobile Redirect Flow instead of Pop-up
document.getElementById('googleLoginBtn').addEventListener('click', () => {
    // Visual feedback so you know the touch worked
    const loginBtn = document.getElementById('googleLoginBtn');
    loginBtn.innerText = "Connecting to Google...";
    loginBtn.style.opacity = "0.6";

    const provider = new firebase.auth.GoogleAuthProvider();
    
    // Using Redirect instead of Popup to bypass mobile browser blockades safely
    auth.signInWithRedirect(provider)
        .catch(err => {
            // Restore button state if it fails instantly
            loginBtn.innerHTML = `<img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="G"> Sign in with Google`;
            loginBtn.style.opacity = "1";
            alert("Auth initiation failure: " + err.message);
        });
});

// Sign-Out Core Controller
document.getElementById('logoutBtn').addEventListener('click', () => {
    auth.signOut().then(() => {
        // Force refresh back to login page visual state
        window.location.reload();
    });
});

// Join Room Entry Handler
function joinRoom(roomName) {
    if (roomName === 'Private') {
        const tokenInput = prompt("Enter Encryption Key for Private Vault:");
        if (tokenInput !== "@Dhanraj") {
            alert("Access Denied! Authorization token invalid.");
            return;
        }
    }
    
    currentRoom = roomName;
    document.getElementById('currentRoomTitle').innerText = roomName + " Room";
    showScreen('chatScreen');
    listenToMessages();
}

// Close and Return to Dashboard Selector Matrix View
function leaveChat() {
    if (unsubscribeMessages) unsubscribeMessages();
    showScreen('roomScreen');
}

// Real-Time Query Snapshot Listener
function listenToMessages() {
    const chatMessages = document.getElementById('chatMessages');
    
    unsubscribeMessages = db.collection('rooms')
        .doc(currentRoom)
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot(snapshot => {
            chatMessages.innerHTML = "";
            snapshot.forEach(doc => {
                const data = doc.data();
                const isMe = data.uid === currentUser.uid;
                
                let timeStr = "Just now";
                if (data.timestamp) {
                    timeStr = data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }

                const tickHtml = isMe ? `<span class="material-icons receipt-ticks read">done_all</span>` : '';

                const bubble = document.createElement('div');
                bubble.classList.add('message-wrapper', isMe ? 'sent' : 'received');
                
                let contentBody = `<span>${data.text}</span>`;
                if (data.type === "image") {
                    contentBody = `<img src="${data.url}" class="media-img" alt="Shared Media">`;
                }

                bubble.innerHTML = `
                    ${!isMe ? `<span class="user-tag">${data.sender}</span>` : ''}
                    ${contentBody}
                    <div class="message-meta">
                        <span>${timeStr}</span>
                        ${tickHtml}
                    </div>
                `;
                chatMessages.appendChild(bubble);
            });
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
}

// Handle Form Execution Submission Events
document.getElementById('messageForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('messageInput');
    const msgText = input.value.trim();
    if (!msgText) return;

    sendMessage(msgText, "text");
    input.value = "";
});

// Unified Message Writer Operation
function sendMessage(contentValue, typeString) {
    if(!currentUser) return;
    
    const payload = {
        sender: currentUser.displayName,
        uid: currentUser.uid,
        type: typeString,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (typeString === "text") payload.text = contentValue;
    else payload.url = contentValue;

    db.collection('rooms').doc(currentRoom).collection('messages').add(payload);
}

// Mocking Image Asset Media Pipeline Selection
function triggerMockMedia() {
    const mockImageLibrary = [
        "https://images.unsplash.com/photo-1516259762381-22954d7d3ad2?w=500",
        "https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=500",
        "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=500"
    ];
    const randomizedSelection = mockImageLibrary[Math.floor(Math.random() * mockImageLibrary.length)];
    
    if(confirm("Simulate media attach selection component?")) {
        sendMessage(randomizedSelection, "image");
    }
}
