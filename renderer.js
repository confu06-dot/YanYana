// ============================================================
// YANYANA - RENDERER.JS (Discord-style suite, clean version)
// ============================================================

const SIGNALING_URL = "wss://yanyana-production.up.railway.app";

// ── State ────────────────────────────────────────────────────
let socket = null;
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let screenStream = null;
let pendingCandidates = [];

let currentRoomId   = null;
let currentUserName = null;

let isMicOn          = true;
let isCameraOn       = true;
let isScreenSharing  = false;
let isPipSwapped     = false;

// Network quality
let currentNetworkQuality = "good";
let currentBitrate        = 7_000_000;
let previousBitrate       = 0;
let lastQualityCheck      = 0;
let autoQualityEnabled    = true;
let reconnectAttempts     = 0;

// Screen picker state
let cachedSources       = [];
let selectedSourceId    = null;
let isScreenTabActive   = true;
let currentSelectedRes  = 1080;
let currentSelectedFps  = 30;

// Mic test
let isTestingMic = false;
let micAudioCtx  = null;
let micAnimFrame = null;

// Ping
let pingInterval = null;

// Toast
let toastTimeout = null;

// ── Electron IPC ─────────────────────────────────────────────
let ipcRenderer = null;
try {
    if (typeof window.require !== "undefined") {
        ipcRenderer = window.require("electron").ipcRenderer;
    }
} catch (e) {}

// ── DOM helpers ───────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

// Window controls
const winMinBtn   = el("winMinBtn");
const winMaxBtn   = el("winMaxBtn");
const winCloseBtn = el("winCloseBtn");

if (ipcRenderer) {
    winMinBtn  ?.addEventListener("click", () => ipcRenderer.send("window-minimize"));
    winMaxBtn  ?.addEventListener("click", () => ipcRenderer.send("window-maximize"));
    winCloseBtn?.addEventListener("click", () => ipcRenderer.send("window-close"));
} else {
    if (winMinBtn)   winMinBtn.style.display   = "none";
    if (winMaxBtn)   winMaxBtn.style.display   = "none";
    if (winCloseBtn) winCloseBtn.style.display = "none";
}

// Core video / audio elements
const localVideo        = el("localVideo");
const remoteVideo       = el("remoteVideo");
const remoteAudio       = el("remoteAudio");
const remotePlaceholder = el("remotePlaceholder");
const localPlaceholder  = el("localPlaceholder");

// Overlays
const localName        = el("localName");
const remoteName       = el("remoteName");
const localMicStatus   = el("localMicStatus");
const remoteMicStatus  = el("remoteMicStatus");
const liveStreamBadge  = el("liveStreamBadge");
const floatingCamBox   = el("floatingCamBox");
const pipCameraVideo   = el("pipCameraVideo");
const pipUserTag       = el("pipUserTag");

// Titlebar
const titlebarBadges   = el("titlebarBadges");
const topRoomCode      = el("topRoomCode");
const connectionText   = el("connectionText");
const connectionSubtext= el("connectionSubtext");
const connectionDot    = el("connectionDot");
const qualityDot       = el("qualityDot");
const currentQualityTag= el("currentQualityTag");
const pingDisplay      = el("pingDisplay");

// Dock buttons
const screenBtn        = el("screenBtn");
const cameraBtn        = el("cameraBtn");
const micBtn           = el("micBtn");
const leaveCallBtn     = el("leaveCallBtn");
const reactionBtn      = el("reactionBtn");
const settingsBtn      = el("settingsBtn");
const reactionBar      = el("reactionBar");

// Pip controls
const swapStreamBtn    = el("swapStreamBtn");
const closePipBtn      = el("closePipBtn");

// Room code
const copyRoomTopBtn   = el("copyRoomTopBtn");
const roomCodeDisplay  = el("roomCodeDisplay"); // hidden compat

// Modals
const joinModal           = el("joinModal");
const closeJoinModalBtn   = el("closeJoinModalBtn");
const joinRoomArea        = el("joinRoomArea");
const roomCodeInput       = el("roomCodeInput");
const enterRoomBtn        = el("enterRoomBtn");

const leaveModal          = el("leaveModal");
const cancelLeaveBtn      = el("cancelLeaveBtn");
const confirmLeaveBtn     = el("confirmLeaveBtn");

const settingsModal       = el("settingsModal");
const closeSettingsModalBtn = el("closeSettingsModalBtn");
const audioSourceSelect   = el("audioSourceSelect");
const videoSourceSelect   = el("videoSourceSelect");
const audioOutputSelect   = el("audioOutputSelect");
const masterVolumeSlider  = el("masterVolumeSlider");
const masterVolumeValue   = el("masterVolumeValue");
const testMicBtn          = el("testMicBtn");
const micMeterFill        = el("micMeterFill");
const micTestStatus       = el("micTestStatus");
const settingsCamPreview  = el("settingsCamPreview");

const screenShareModal    = el("screenShareModal");
const closeScreenModalBtn = el("closeScreenModalBtn");
const screenSourcesGrid   = el("screenSourcesGrid");
const tabScreensBtn       = el("tabScreensBtn");
const tabWindowsBtn       = el("tabWindowsBtn");
const qualitySelect       = null; // pill-based in HTML, handled separately
const fpsSelect           = null; // pill-based in HTML, handled separately
const audioShareToggle    = el("shareSystemAudioCheck");
const startShareBtn       = el("startScreenStreamBtn");
const stopShareBtn        = el("cancelScreenModalBtn"); // reused as cancel/stop

// Chat
const peerStatus  = el("peerStatus");

// Toast
const toastNotification = el("toastNotification");
const toastMessage      = el("toastMessage");

// Reactions container
const reactionFlyingContainer = el("reactionFlyingContainer");

// Views
const lobbyView   = el("lobby");
const waitingView = el("waitingView");
const callView    = el("appScreen"); // id="appScreen" in HTML

// Home inputs
const nameInput    = el("nameInput");
const createRoomBtn= el("createRoomBtn");
const joinRoomBtn  = el("joinRoomBtn");

// ── Toast ─────────────────────────────────────────────────────
function showToast(message, duration = 2400) {
    if (!toastNotification) return;
    if (toastMessage) toastMessage.textContent = message;
    toastNotification.classList.add("show");
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toastNotification.classList.remove("show");
    }, duration);
}

// ── View switcher ─────────────────────────────────────────────
function showView(viewName) {
    if (lobbyView)   lobbyView.classList.toggle("hidden",   viewName !== "home");
    if (waitingView) waitingView.classList.toggle("hidden", viewName !== "waiting");
    if (callView)    callView.classList.toggle("hidden",    viewName !== "call");

    // Show titlebar badges when in call or waiting
    if (titlebarBadges) {
        titlebarBadges.classList.toggle("hidden", viewName === "home");
    }
}

// ── Room code generator ───────────────────────────────────────
function generateRoomCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

// ── Enter room ────────────────────────────────────────────────
function enterRoom(roomId, name) {
    currentRoomId   = String(roomId);
    currentUserName = String(name || "Misafir");

    if (topRoomCode) topRoomCode.textContent = currentRoomId;
    if (localName)   localName.textContent   = currentUserName;
    if (pipUserTag)  pipUserTag.textContent  = currentUserName;

    // Go directly to call — no waiting screen
    showView("call");
    start();
}

// ── Create room button ────────────────────────────────────────
if (createRoomBtn) {
    createRoomBtn.addEventListener("click", () => {
        const name = nameInput ? nameInput.value.trim() : "";
        if (!name) {
            showToast("⚠️ Önce adını yaz!");
            nameInput?.focus();
            return;
        }
        enterRoom(generateRoomCode(), name);
    });
}

// ── Join room button (show modal) ─────────────────────────────
if (joinRoomBtn) {
    joinRoomBtn.addEventListener("click", () => {
        if (joinModal) joinModal.classList.remove("hidden");
        roomCodeInput?.focus();
    });
}

if (closeJoinModalBtn) {
    closeJoinModalBtn.addEventListener("click", () => {
        if (joinModal) joinModal.classList.add("hidden");
    });
}

if (enterRoomBtn) {
    enterRoomBtn.addEventListener("click", () => {
        const name     = nameInput     ? nameInput.value.trim()     : "";
        const roomCode = roomCodeInput ? roomCodeInput.value.trim() : "";

        if (!name) {
            showToast("⚠️ Önce adını yaz!");
            nameInput?.focus();
            return;
        }
        if (!/^\d{6}$/.test(roomCode)) {
            showToast("⚠️ 6 haneli oda kodunu gir.");
            roomCodeInput?.focus();
            return;
        }
        if (joinModal) joinModal.classList.add("hidden");
        enterRoom(roomCode, name);
    });
}

if (nameInput) {
    nameInput.addEventListener("keydown", e => {
        if (e.key === "Enter") createRoomBtn?.click();
    });
}

if (roomCodeInput) {
    roomCodeInput.addEventListener("keydown", e => {
        if (e.key === "Enter") enterRoomBtn?.click();
    });
}

// ── Copy room code ─────────────────────────────────────────────
if (copyRoomTopBtn) {
    copyRoomTopBtn.addEventListener("click", () => {
        if (currentRoomId) {
            navigator.clipboard.writeText(currentRoomId).catch(() => {});
            showToast("📋 Oda kodu kopyalandı!");
        }
    });
}

// ── Connection state ──────────────────────────────────────────
function setConnectionState(state, text, subtext) {
    if (connectionText)    connectionText.textContent    = text;
    if (connectionSubtext) connectionSubtext.textContent = subtext || "";
    if (connectionDot) {
        connectionDot.className = "connection-dot";
        connectionDot.classList.add(state);
    }
}

// ── Network quality UI ────────────────────────────────────────
function updateNetworkQualityUI() {
    if (!qualityDot) return;
    qualityDot.className = "status-dot";
    if (currentNetworkQuality === "good") {
        qualityDot.classList.add("status-dot-green");
        if (currentQualityTag) currentQualityTag.textContent = "HD";
    } else if (currentNetworkQuality === "medium") {
        qualityDot.classList.add("status-dot-yellow");
        if (currentQualityTag) currentQualityTag.textContent = "SD";
    } else {
        qualityDot.classList.add("status-dot-red");
        if (currentQualityTag) currentQualityTag.textContent = "Low";
    }
}

function evaluateNetworkQuality(pingMs) {
    const now = Date.now();
    if (now - lastQualityCheck < 5000) return;
    lastQualityCheck = now;

    const prev = currentNetworkQuality;
    if (pingMs < 50)       currentNetworkQuality = "good";
    else if (pingMs < 150) currentNetworkQuality = "medium";
    else                   currentNetworkQuality = "poor";

    updateNetworkQualityUI();

    if (!autoQualityEnabled) return;
    if (currentNetworkQuality === prev) return;

    // Adjust video sender bitrate
    if (!peerConnection) return;
    const sender = peerConnection.getSenders().find(s => s.track?.kind === "video");
    if (!sender) return;

    let target = 7_000_000;
    if (currentNetworkQuality === "poor")   target = 1_500_000;
    if (currentNetworkQuality === "medium") target = 3_000_000;
    if (currentSelectedFps === 60) target = Math.round(target * 1.3);

    const params = sender.getParameters();
    if (!params.encodings) params.encodings = [{}];
    params.encodings[0].maxBitrate = target;
    sender.setParameters(params).catch(() => {});

    if (currentNetworkQuality === "poor" && prev !== "poor") {
        showToast("📴 Bağlantı kötü, kalite otomatik düşürüldü.", 4000);
    } else if (currentNetworkQuality === "good" && prev !== "good") {
        showToast("✅ Bağlantı iyileşti, kalite artırıldı.", 3000);
    }
}

// ── Ping / pong ───────────────────────────────────────────────
function startPingMonitor() {
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            sendSignal({ type: "ping", time: Date.now() });
        }
    }, 3000);
}

function stopPingMonitor() {
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
}

// ── Local media ───────────────────────────────────────────────
async function getLocalMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }
        });
        isMicOn    = true;
        isCameraOn = true;
    } catch {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            isMicOn    = true;
            isCameraOn = false;
        } catch {
            localStream = new MediaStream();
            isMicOn    = false;
            isCameraOn = false;
        }
    }

    if (localVideo && localStream) {
        localVideo.srcObject = localStream;
        localVideo.muted     = true;
        localVideo.play().catch(() => {});
    }
    updateLocalUI();
}

// ── UI update helpers ─────────────────────────────────────────
function updateLocalUI() {
    // Mic button
    if (micBtn) {
        micBtn.classList.toggle("btn-off", !isMicOn);
        micBtn.title = isMicOn ? "Mikrofonu Kapat" : "Mikrofonu Aç";
    }
    if (localMicStatus) localMicStatus.textContent = isMicOn ? "🎤" : "🔇";

    // Camera button
    if (cameraBtn) {
        cameraBtn.classList.toggle("btn-off", !isCameraOn);
        cameraBtn.title = isCameraOn ? "Kamerayı Kapat" : "Kamerayı Aç";
    }
    if (localPlaceholder) localPlaceholder.style.display = isCameraOn ? "none" : "flex";

    // Broadcast status to peer
    if (socket?.readyState === WebSocket.OPEN) {
        sendSignal({ type: "mic-status",    enabled: isMicOn });
        sendSignal({ type: "camera-status", enabled: isCameraOn });
    }
}

// ── WebRTC peer connection ────────────────────────────────────
function createPeerConnection() {
    if (peerConnection) return peerConnection;

    peerConnection = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" }
        ],
        iceCandidatePoolSize: 10
    });

    // Add tracks
    const videoTrack = isScreenSharing && screenStream
        ? screenStream.getVideoTracks()[0]
        : localStream?.getVideoTracks()[0];
    const videoSource = isScreenSharing && screenStream ? screenStream : localStream;

    if (videoTrack && videoSource) peerConnection.addTrack(videoTrack, videoSource);
    localStream?.getAudioTracks().forEach(t => peerConnection.addTrack(t, localStream));

    peerConnection.ontrack = event => {
        if (!remoteStream) remoteStream = new MediaStream();
        if (!remoteStream.getTracks().some(t => t.id === event.track.id)) {
            remoteStream.addTrack(event.track);
        }
        if (remoteVideo) {
            remoteVideo.srcObject = remoteStream;
            remoteVideo.muted     = false;
            remoteVideo.play().catch(() => {});
        }
        if (remoteAudio) remoteAudio.srcObject = null;
        if (remotePlaceholder) remotePlaceholder.style.display = "none";
        showView("call");
    };

    peerConnection.onicecandidate = event => {
        if (event.candidate) sendSignal({ type: "candidate", candidate: event.candidate });
    };

    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log("🌐 WebRTC:", state);

        if (state === "connected") {
            setConnectionState("connected", "Bağlı", "Görüşme aktif ✅");
            resetReconnect();
        } else if (state === "disconnected" || state === "failed") {
            setConnectionState("error", "Bağlantı kesildi", "Yeniden bağlanılıyor...");
            showToast("⚠️ Bağlantı koptu, yeniden bağlanılıyor...", 4000);
            tryIceRestart();
        }
    };

    return peerConnection;
}

function tryIceRestart() {
    if (!peerConnection || reconnectAttempts >= 5) return;
    reconnectAttempts++;
    setTimeout(async () => {
        if (!peerConnection) return;
        try {
            const offer = await peerConnection.createOffer({ iceRestart: true });
            await peerConnection.setLocalDescription(offer);
            sendSignal({ type: "offer", offer });
        } catch (e) {
            console.warn("ICE restart failed:", e);
            connectSocket(); // fallback: full reconnect
        }
    }, 2000 * reconnectAttempts);
}

function resetReconnect() {
    reconnectAttempts = 0;
}

// ── Signaling ─────────────────────────────────────────────────
function sendSignal(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

function connectSocket() {
    if (socket) { try { socket.close(); } catch {} }

    socket = new WebSocket(SIGNALING_URL);
    startPingMonitor();

    socket.onopen = () => {
        console.log("🟢 Signaling bağlandı.");
        setConnectionState("connecting", "Sunucu bağlı", "Odaya katılınıyor...");
        sendSignal({ type: "join", room: currentRoomId, name: currentUserName });
        reconnectAttempts = 0;
    };

    socket.onmessage = async event => {
        try {
            const msg = JSON.parse(event.data);
            await handleSignal(msg);
        } catch (e) { console.error("Signal parse:", e); }
    };

    socket.onerror = () => {
        setConnectionState("error", "Sunucu hatası", "Yeniden bağlanılıyor...");
    };

    socket.onclose = () => {
        console.warn("WebSocket kapandı. Yeniden deneniyor...");
        if (currentRoomId) {
            setTimeout(() => connectSocket(), 3000 + reconnectAttempts * 2000);
            reconnectAttempts++;
        }
    };
}

async function handleSignal(msg) {
    switch (msg.type) {

        case "joined":
            console.log(`✅ Odaya katıldı: ${msg.room} (${msg.count} kişi)`);
            setConnectionState("connected", "Odada", `${currentRoomId} • ${msg.count}/2 kişi`);
            if (topRoomCode) topRoomCode.textContent = currentRoomId;
            break;

        case "peer-joined":
            console.log("🧑 Karşı taraf katıldı:", msg.name);
            if (remoteName) remoteName.textContent = msg.name || "Karşı taraf";
            showToast(`🎉 ${msg.name || "Karşı taraf"} odaya girdi!`);
            showView("call");
            // Send offer
            if (!peerConnection) createPeerConnection();
            try {
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                sendSignal({ type: "offer", offer });
            } catch (e) { console.error("Offer oluşturulamadı:", e); }
            break;

        case "peer-name":
            if (remoteName) remoteName.textContent = msg.name || "Karşı taraf";
            break;

        case "peer-left":
            console.log("👋 Karşı taraf ayrıldı.");
            showToast("👋 Karşı taraf ayrıldı.", 4000);
            if (remotePlaceholder) remotePlaceholder.style.display = "flex";
            if (remoteVideo)       remoteVideo.srcObject = null;
            remoteStream = null;
            break;

        case "offer":
            if (!peerConnection) createPeerConnection();
            await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.offer));
            pendingCandidates.forEach(c => peerConnection.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
            pendingCandidates = [];
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            sendSignal({ type: "answer", answer });
            break;

        case "answer":
            if (peerConnection?.signalingState === "have-local-offer") {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.answer));
                pendingCandidates.forEach(c => peerConnection.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
                pendingCandidates = [];
            }
            break;

        case "candidate":
            if (peerConnection?.remoteDescription) {
                peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
            } else {
                pendingCandidates.push(msg.candidate);
            }
            break;

        case "chat":
            if (typeof addChatMessage === "function") addChatMessage(msg.name, msg.text);
            break;

        case "reaction":
            spawnFlyingReaction(msg.emoji, false);
            break;

        case "typing":
            if (typeof showTypingIndicator === "function") showTypingIndicator(msg.name);
            break;

        case "mic-status":
            if (remoteMicStatus) remoteMicStatus.textContent = msg.enabled ? "🎤" : "🔇";
            showToast(msg.enabled ? "🎤 Karşı taraf mikrofonu açtı" : "🔇 Karşı taraf mikrofonu kapattı", 2000);
            break;

        case "camera-status":
            showToast(msg.enabled ? "📷 Karşı taraf kamerayı açtı" : "📷 Karşı taraf kamerayı kapattı", 2000);
            break;

        case "pong": {
            const latency = Date.now() - (msg.time || 0);
            if (pingDisplay) pingDisplay.textContent = `${latency} ms`;
            evaluateNetworkQuality(latency);
            break;
        }

        case "full":
            showToast("❌ Oda dolu! Başka bir oda dene.", 5000);
            showView("home");
            break;

        case "error":
            showToast(`❌ Hata: ${msg.message}`, 4000);
            break;
    }
}

// ── Start ─────────────────────────────────────────────────────
async function start() {
    console.log("🚀 YanYana başlıyor...");
    setConnectionState("connecting", "Bağlanıyor", "Cihazlar hazırlanıyor...");
    await getLocalMedia();
    createPeerConnection();
    connectSocket();
}

// ── Mic toggle ────────────────────────────────────────────────
if (micBtn) {
    micBtn.addEventListener("click", () => {
        isMicOn = !isMicOn;
        localStream?.getAudioTracks().forEach(t => { t.enabled = isMicOn; });
        updateLocalUI();
        showToast(isMicOn ? "🎤 Mikrofon açıldı" : "🔇 Mikrofon kapatıldı");
    });
}

// ── Camera toggle ──────────────────────────────────────────────
if (cameraBtn) {
    cameraBtn.addEventListener("click", () => {
        isCameraOn = !isCameraOn;
        localStream?.getVideoTracks().forEach(t => { t.enabled = isCameraOn; });
        if (localPlaceholder) localPlaceholder.style.display = isCameraOn ? "none" : "flex";
        updateLocalUI();
        showToast(isCameraOn ? "📷 Kamera açıldı" : "📷 Kamera kapatıldı");
    });
}

// ── Screen share — open modal ─────────────────────────────────
if (screenBtn) {
    screenBtn.addEventListener("click", () => {
        if (isScreenSharing) {
            stopScreenShare();
        } else {
            openScreenShareModal();
        }
    });
}

async function openScreenShareModal() {
    if (!screenShareModal) return;
    screenShareModal.classList.remove("hidden");
    selectedSourceId = null;
    if (startShareBtn) startShareBtn.disabled = true;
    await loadScreenSources();
}

async function loadScreenSources() {
    if (!screenSourcesGrid) return;
    screenSourcesGrid.innerHTML = `<div class="screen-loading">📡 Kaynaklar yükleniyor...</div>`;

    try {
        let sources = [];
        if (ipcRenderer) {
            sources = await ipcRenderer.invoke("get-screen-sources");
        }
        cachedSources = sources;
        renderSourceGrid(sources, isScreenTabActive);
    } catch (e) {
        screenSourcesGrid.innerHTML = `<div class="screen-loading">⚠️ Kaynaklar alınamadı.</div>`;
    }
}

function renderSourceGrid(sources, screensOnly) {
    if (!screenSourcesGrid) return;
    const filtered = screensOnly
        ? sources.filter(s => s.isScreen)
        : sources.filter(s => !s.isScreen);

    if (!filtered.length) {
        screenSourcesGrid.innerHTML = `<div class="screen-loading">Kaynak bulunamadı.</div>`;
        return;
    }

    screenSourcesGrid.innerHTML = "";
    filtered.forEach(src => {
        const card = document.createElement("div");
        card.className = "source-card";
        card.dataset.id = src.id;
        card.innerHTML = `
            <div class="source-thumb-wrap">
                <img src="${src.thumbnail}" alt="${src.name}" class="source-thumb">
                ${src.appIcon ? `<img src="${src.appIcon}" class="source-app-icon" alt="">` : ""}
            </div>
            <div class="source-name">${src.name}</div>
        `;
        card.addEventListener("click", () => {
            screenSourcesGrid.querySelectorAll(".source-card").forEach(c => c.classList.remove("selected"));
            card.classList.add("selected");
            selectedSourceId = src.id;
            if (startShareBtn) startShareBtn.disabled = false;
        });
        screenSourcesGrid.appendChild(card);
    });
}

// Tab switching
if (tabScreensBtn) {
    tabScreensBtn.addEventListener("click", () => {
        isScreenTabActive = true;
        tabScreensBtn.classList.add("active");
        tabWindowsBtn?.classList.remove("active");
        renderSourceGrid(cachedSources, true);
    });
}
if (tabWindowsBtn) {
    tabWindowsBtn.addEventListener("click", () => {
        isScreenTabActive = false;
        tabWindowsBtn.classList.add("active");
        tabScreensBtn?.classList.remove("active");
        renderSourceGrid(cachedSources, false);
    });
}

// Resolution / FPS pill selectors (HTML uses pill buttons, not <select>)
document.querySelectorAll("#resolutionSelector .pill-opt").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll("#resolutionSelector .pill-opt").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentSelectedRes = parseInt(btn.dataset.res) || 1080;
    });
});
document.querySelectorAll("#fpsSelector .pill-opt").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll("#fpsSelector .pill-opt").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentSelectedFps = parseInt(btn.dataset.fps) || 30;
    });
});

// Close screen modal
if (closeScreenModalBtn) {
    closeScreenModalBtn.addEventListener("click", () => {
        screenShareModal?.classList.add("hidden");
    });
}

// Start share button
if (startShareBtn) {
    startShareBtn.addEventListener("click", async () => {
        if (!selectedSourceId) return;
        screenShareModal?.classList.add("hidden");
        await startScreenShare(selectedSourceId);
    });
}

// Stop share button
if (stopShareBtn) {
    stopShareBtn.addEventListener("click", () => stopScreenShare());
}

async function startScreenShare(sourceId) {
    try {
        const withAudio = audioShareToggle ? audioShareToggle.checked : false;
        const res       = currentSelectedRes;
        const fps       = currentSelectedFps;
        const maxW      = res === 1440 ? 2560 : res === 1080 ? 1920 : 1280;
        const maxH      = res === 1440 ? 1440 : res === 1080 ? 1080 : 720;

        const constraints = {
            audio: withAudio ? { mandatory: { chromeMediaSource: "desktop" } } : false,
            video: {
                mandatory: {
                    chromeMediaSource:   "desktop",
                    chromeMediaSourceId: sourceId,
                    maxWidth:  maxW,
                    maxHeight: maxH,
                    maxFrameRate: fps
                }
            }
        };

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch {
            // Fallback: getDisplayMedia
            stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: withAudio });
        }

        screenStream = stream;
        isScreenSharing = true;

        // Replace video track in peer connection
        if (peerConnection) {
            const videoSender = peerConnection.getSenders().find(s => s.track?.kind === "video");
            if (videoSender && screenStream.getVideoTracks()[0]) {
                await videoSender.replaceTrack(screenStream.getVideoTracks()[0]);
            }
        }

        // Show screen in local video
        if (localVideo) {
            localVideo.srcObject = screenStream;
            localVideo.muted     = true;
            localVideo.play().catch(() => {});
        }

        // Show PiP camera box
        if (localStream?.getVideoTracks()?.length && isCameraOn) {
            if (floatingCamBox) floatingCamBox.classList.remove("hidden");
            if (pipCameraVideo) {
                pipCameraVideo.srcObject = localStream;
                pipCameraVideo.muted     = true;
                pipCameraVideo.play().catch(() => {});
            }
        }

        // Show LIVE badge
        if (liveStreamBadge) liveStreamBadge.classList.remove("hidden");
        if (screenBtn)       screenBtn.classList.add("active");

        showToast(`🖥️ Ekran paylaşımı başladı (${res}p ${fps}fps)`);

        // Handle stream end
        screenStream.getVideoTracks()[0].onended = () => stopScreenShare();

    } catch (e) {
        console.error("Screen share failed:", e);
        showToast("❌ Ekran paylaşımı başlatılamadı.", 4000);
    }
}

function stopScreenShare() {
    if (!isScreenSharing) return;

    screenStream?.getTracks().forEach(t => t.stop());
    screenStream = null;
    isScreenSharing = false;

    // Restore camera
    if (localVideo && localStream) {
        localVideo.srcObject = localStream;
        localVideo.muted     = true;
        localVideo.play().catch(() => {});
    }

    // Replace track back
    if (peerConnection && localStream) {
        const videoSender = peerConnection.getSenders().find(s => s.track?.kind === "video");
        if (videoSender && localStream.getVideoTracks()[0]) {
            videoSender.replaceTrack(localStream.getVideoTracks()[0]).catch(() => {});
        }
    }

    if (floatingCamBox) floatingCamBox.classList.add("hidden");
    if (liveStreamBadge) liveStreamBadge.classList.add("hidden");
    if (screenBtn)       screenBtn.classList.remove("active");
    if (pipCameraVideo)  pipCameraVideo.srcObject = null;

    showToast("🔴 Ekran paylaşımı durduruldu.");
}

// ── Draggable PiP ──────────────────────────────────────────────
if (floatingCamBox) {
    let dragging = false, ox = 0, oy = 0;
    floatingCamBox.addEventListener("mousedown", e => {
        if (e.target.tagName === "BUTTON" || e.target.tagName === "VIDEO") return;
        dragging = true;
        ox = e.clientX - floatingCamBox.offsetLeft;
        oy = e.clientY - floatingCamBox.offsetTop;
        floatingCamBox.style.cursor = "grabbing";
    });
    document.addEventListener("mousemove", e => {
        if (!dragging) return;
        floatingCamBox.style.left = `${e.clientX - ox}px`;
        floatingCamBox.style.top  = `${e.clientY - oy}px`;
        floatingCamBox.style.right  = "auto";
        floatingCamBox.style.bottom = "auto";
    });
    document.addEventListener("mouseup", () => {
        dragging = false;
        floatingCamBox.style.cursor = "grab";
    });
}

if (closePipBtn) {
    closePipBtn.addEventListener("click", () => {
        floatingCamBox?.classList.add("hidden");
    });
}

if (swapStreamBtn) {
    swapStreamBtn.addEventListener("click", () => {
        isPipSwapped = !isPipSwapped;
        if (isPipSwapped) {
            // PiP shows screen, main shows camera
            if (localVideo && localStream) localVideo.srcObject = localStream;
            if (pipCameraVideo && screenStream) pipCameraVideo.srcObject = screenStream;
        } else {
            // PiP shows camera, main shows screen
            if (localVideo && screenStream) localVideo.srcObject = screenStream;
            if (pipCameraVideo && localStream) pipCameraVideo.srcObject = localStream;
        }
        showToast("🔄 Görünüm değiştirildi.");
    });
}

// ── Leave call ────────────────────────────────────────────────
if (leaveCallBtn) {
    leaveCallBtn.addEventListener("click", () => {
        leaveModal?.classList.remove("hidden");
    });
}
if (cancelLeaveBtn) {
    cancelLeaveBtn.addEventListener("click", () => {
        leaveModal?.classList.add("hidden");
    });
}
if (confirmLeaveBtn) {
    confirmLeaveBtn.addEventListener("click", () => leaveRoom());
}

function leaveRoom() {
    stopScreenShare();
    stopPingMonitor();
    peerConnection?.close();
    peerConnection = null;
    try { socket?.close(); } catch {}
    socket = null;
    localStream?.getTracks().forEach(t => t.stop());
    localStream  = null;
    remoteStream = null;
    currentRoomId   = null;
    currentUserName = null;
    if (leaveModal) leaveModal.classList.add("hidden");
    showView("home");
}

// ── Reactions ─────────────────────────────────────────────────
if (reactionBtn) {
    reactionBtn.addEventListener("click", e => {
        e.stopPropagation();
        reactionBar?.classList.toggle("hidden");
    });
}
document.addEventListener("click", e => {
    if (reactionBar && !reactionBar.contains(e.target) && e.target !== reactionBtn) {
        reactionBar.classList.add("hidden");
    }
});

if (reactionBar) {
    reactionBar.querySelectorAll(".rx-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const emoji = btn.dataset.emoji || btn.textContent;
            spawnFlyingReaction(emoji, true);
            sendSignal({ type: "reaction", emoji, name: currentUserName });
            reactionBar.classList.add("hidden");
        });
    });
}

function spawnFlyingReaction(emoji, isMine) {
    if (!reactionFlyingContainer) return;
    playPopSound();

    const el2 = document.createElement("div");
    el2.className = "flying-reaction";
    el2.textContent = emoji;
    el2.style.left = `${20 + Math.random() * 60}%`;
    el2.style.animationDuration = `${2.5 + Math.random()}s`;
    reactionFlyingContainer.appendChild(el2);
    setTimeout(() => el2.remove(), 3500);
}

function playPopSound() {
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx  = new AC();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
    } catch {}
}

// ── Settings modal ────────────────────────────────────────────
if (settingsBtn) {
    settingsBtn.addEventListener("click", async () => {
        settingsModal?.classList.remove("hidden");
        await populateDevices();
        // Camera preview
        if (settingsCamPreview && localStream) {
            settingsCamPreview.srcObject = localStream;
            settingsCamPreview.muted     = true;
            settingsCamPreview.play().catch(() => {});
        }
    });
}
if (closeSettingsModalBtn) {
    closeSettingsModalBtn.addEventListener("click", () => {
        settingsModal?.classList.add("hidden");
        if (settingsCamPreview) settingsCamPreview.srcObject = null;
        stopMicTest();
    });
}

async function populateDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics     = devices.filter(d => d.kind === "audioinput");
        const cameras  = devices.filter(d => d.kind === "videoinput");
        const speakers = devices.filter(d => d.kind === "audiooutput");

        if (audioSourceSelect) {
            audioSourceSelect.innerHTML = "";
            mics.forEach(d => {
                const opt = document.createElement("option");
                opt.value = d.deviceId;
                opt.textContent = d.label || `Mikrofon ${audioSourceSelect.options.length + 1}`;
                audioSourceSelect.appendChild(opt);
            });
        }
        if (videoSourceSelect) {
            videoSourceSelect.innerHTML = "";
            cameras.forEach(d => {
                const opt = document.createElement("option");
                opt.value = d.deviceId;
                opt.textContent = d.label || `Kamera ${videoSourceSelect.options.length + 1}`;
                videoSourceSelect.appendChild(opt);
            });
        }
        if (audioOutputSelect) {
            audioOutputSelect.innerHTML = "";
            speakers.forEach(d => {
                const opt = document.createElement("option");
                opt.value = d.deviceId;
                opt.textContent = d.label || `Hoparlör ${audioOutputSelect.options.length + 1}`;
                audioOutputSelect.appendChild(opt);
            });
        }
    } catch (e) { console.warn("Cihaz listeleme hatası:", e); }
}

// Speaker selection
if (audioOutputSelect) {
    audioOutputSelect.addEventListener("change", async () => {
        const sinkId = audioOutputSelect.value;
        for (const el3 of [remoteAudio, remoteVideo]) {
            if (el3 && typeof el3.setSinkId === "function") {
                try { await el3.setSinkId(sinkId); } catch {}
            }
        }
        showToast("🔊 Hoparlör değiştirildi.");
    });
}

// Master volume slider
if (masterVolumeSlider) {
    masterVolumeSlider.addEventListener("input", () => {
        const vol = masterVolumeSlider.value / 100;
        if (remoteAudio) remoteAudio.volume = vol;
        if (remoteVideo) remoteVideo.volume = vol;
        if (masterVolumeValue) masterVolumeValue.textContent = `${masterVolumeSlider.value}%`;
    });
}

// Mic test
if (testMicBtn) {
    testMicBtn.addEventListener("click", toggleMicTest);
}

async function toggleMicTest() {
    if (isTestingMic) { stopMicTest(); return; }
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const stream   = localStream || await navigator.mediaDevices.getUserMedia({ audio: true });
        micAudioCtx    = new AC();
        const source   = micAudioCtx.createMediaStreamSource(stream);
        const analyser = micAudioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        isTestingMic = true;
        if (testMicBtn)    testMicBtn.textContent    = "🛑 Testi Durdur";
        if (micTestStatus) micTestStatus.textContent = "Dinleniyor...";

        function tick() {
            if (!isTestingMic) return;
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            const pct = Math.min(100, Math.round(avg * 2.2));
            if (micMeterFill)  micMeterFill.style.width    = `${pct}%`;
            if (micTestStatus) micTestStatus.textContent   = pct > 6 ? `Ses: ${pct}%` : "Sessiz";
            micAnimFrame = requestAnimationFrame(tick);
        }
        tick();
    } catch (e) { console.warn("Mikrofon test hatası:", e); }
}

function stopMicTest() {
    isTestingMic = false;
    if (micAnimFrame) cancelAnimationFrame(micAnimFrame);
    try { micAudioCtx?.close(); } catch {}
    micAudioCtx = null;
    if (testMicBtn)    testMicBtn.textContent    = "🎙️ Test Başlat";
    if (micMeterFill)  micMeterFill.style.width  = "0%";
    if (micTestStatus) micTestStatus.textContent = "Sessiz";
}

// ── URL params on startup ─────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const urlRoom   = urlParams.get("room");
const urlName   = urlParams.get("name");

if (urlRoom) {
    enterRoom(urlRoom, urlName || "Misafir");
} else {
    showView("home");
}

console.log("✨ YanYana Renderer hazır.");