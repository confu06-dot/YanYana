// ============================================================
// YANYANA - RENDERER.JS
// ============================================================

const SIGNALING_URL =
    "wss://yanyana-production.up.railway.app";

let socket = null;
let peerConnection = null;

let localStream = null;
let remoteStream = null;
let screenStream = null;

let pendingCandidates = [];

let currentRoomId = null;
let currentUserName = null;

let isMicOn = true;
let isCameraOn = true;
let isScreenSharing = false;

// ============================================================
// ELEMENTLER
// ============================================================

const lobby = document.getElementById("lobby");
const appScreen = document.getElementById("appScreen");

const nameInput = document.getElementById("nameInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const joinRoomArea = document.getElementById("joinRoomArea");
const roomCodeInput = document.getElementById("roomCodeInput");
const enterRoomBtn = document.getElementById("enterRoomBtn");

const roomCodeDisplay =
    document.getElementById("roomCodeDisplay");

const copyRoomBtn =
    document.getElementById("copyRoomBtn");

const copyRoomTopBtn =
    document.getElementById("copyRoomTopBtn");

const localVideo =
    document.getElementById("localVideo");

const remoteVideo =
    document.getElementById("remoteVideo");

const remoteAudio =
    document.getElementById("remoteAudio");

const remotePlaceholder =
    document.getElementById("remotePlaceholder");

const remotePlaceholderText =
    document.getElementById("remotePlaceholderText");

const remoteName =
    document.getElementById("remoteName");

const localName =
    document.getElementById("localName");

const remoteMicStatus =
    document.getElementById("remoteMicStatus");

const localMicStatus =
    document.getElementById("localMicStatus");

const micBtn =
    document.getElementById("micBtn");

const cameraBtn =
    document.getElementById("cameraBtn");

const screenBtn =
    document.getElementById("screenBtn");

const speakerBtn =
    document.getElementById("speakerBtn");

const leaveCallBtn =
    document.getElementById("leaveCallBtn");

const connectionText =
    document.getElementById("connectionText");

const connectionSubtext =
    document.getElementById("connectionSubtext");

const connectionDot =
    document.getElementById("connectionDot");

const peerStatus =
    document.getElementById("peerStatus");

const leaveModal =
    document.getElementById("leaveModal");

const cancelLeaveBtn =
    document.getElementById("cancelLeaveBtn");

const confirmLeaveBtn =
    document.getElementById("confirmLeaveBtn");

// ============================================================
// ODA KODU
// ============================================================

function generateRoomCode() {

    return String(
        Math.floor(100000 + Math.random() * 900000)
    );

}

// ============================================================
// EKRANLARI DEĞİŞTİR
// ============================================================

function showAppScreen() {

    if (lobby) {
        lobby.classList.add("hidden");
        lobby.style.display = "none";
    }

    if (appScreen) {
        appScreen.classList.remove("hidden");
        appScreen.style.display = "flex";
    }

}

function showLobby() {

    if (appScreen) {
        appScreen.classList.add("hidden");
        appScreen.style.display = "none";
    }

    if (lobby) {
        lobby.classList.remove("hidden");
        lobby.style.display = "flex";
    }

}

// ============================================================
// ODAYA GİR
// ============================================================

function enterRoom(roomId, name) {

    currentRoomId = String(roomId);
    currentUserName = String(name);

    const params = new URLSearchParams();

    params.set(
        "room",
        currentRoomId
    );

    params.set(
        "name",
        currentUserName
    );

    const newUrl =
        `${window.location.pathname}?${params.toString()}`;

    window.history.replaceState(
        {},
        "",
        newUrl
    );

    showAppScreen();

    if (roomCodeDisplay) {
        roomCodeDisplay.textContent =
            currentRoomId;
    }

    if (localName) {
        localName.textContent =
            currentUserName;
    }

    start();

}

// ============================================================
// ODA OLUŞTUR
// ============================================================

if (createRoomBtn) {

    createRoomBtn.addEventListener(
        "click",
        () => {

            const name =
                nameInput
                    ? nameInput.value.trim()
                    : "";

            if (!name) {

                alert(
                    "Önce adını yaz."
                );

                if (nameInput) {
                    nameInput.focus();
                }

                return;
            }

            const roomCode =
                generateRoomCode();

            enterRoom(
                roomCode,
                name
            );
        }
    );

}

// ============================================================
// ODAYA KATIL
// ============================================================

if (joinRoomBtn) {

    joinRoomBtn.addEventListener(
        "click",
        () => {

            if (joinRoomArea) {

                joinRoomArea.classList.remove(
                    "hidden"
                );

                joinRoomArea.style.display =
                    "block";
            }

            if (roomCodeInput) {
                roomCodeInput.focus();
            }
        }
    );

}

// ============================================================
// KATIL
// ============================================================

if (enterRoomBtn) {

    enterRoomBtn.addEventListener(
        "click",
        () => {

            const name =
                nameInput
                    ? nameInput.value.trim()
                    : "";

            const roomCode =
                roomCodeInput
                    ? roomCodeInput.value.trim()
                    : "";

            if (!name) {

                alert(
                    "Önce adını yaz."
                );

                if (nameInput) {
                    nameInput.focus();
                }

                return;
            }

            if (!/^\d{6}$/.test(roomCode)) {

                alert(
                    "6 haneli oda kodunu gir."
                );

                if (roomCodeInput) {
                    roomCodeInput.focus();
                }

                return;
            }

            enterRoom(
                roomCode,
                name
            );
        }
    );

}

// ============================================================
// ENTER
// ============================================================

if (nameInput) {

    nameInput.addEventListener(
        "keydown",
        event => {

            if (event.key === "Enter") {
                createRoomBtn?.click();
            }

        }
    );

}

if (roomCodeInput) {

    roomCodeInput.addEventListener(
        "keydown",
        event => {

            if (event.key === "Enter") {
                enterRoomBtn?.click();
            }

        }
    );

}

// ============================================================
// URL'DEN ODA
// ============================================================

const urlParams =
    new URLSearchParams(
        window.location.search
    );

const urlRoom =
    urlParams.get("room");

const urlName =
    urlParams.get("name");

if (urlRoom && urlName) {

    currentRoomId =
        urlRoom;

    currentUserName =
        urlName;

    showAppScreen();

    if (roomCodeDisplay) {
        roomCodeDisplay.textContent =
            currentRoomId;
    }

    if (localName) {
        localName.textContent =
            currentUserName;
    }

    start();

} else {

    showLobby();

}

// ============================================================
// BAĞLANTI DURUMU
// ============================================================

function setConnectionState(
    state,
    text,
    subtext
) {

    if (connectionText) {
        connectionText.textContent =
            text;
    }

    if (connectionSubtext) {
        connectionSubtext.textContent =
            subtext || "";
    }

    if (connectionDot) {

        connectionDot.classList.remove(
            "connected",
            "connecting",
            "error"
        );

        connectionDot.classList.add(
            state
        );
    }
}

// ============================================================
// LOCAL MEDIA
// ============================================================

async function getLocalMedia() {

    try {

        console.log(
            "🎥 Kamera ve mikrofon isteniyor..."
        );

        localStream =
            await navigator.mediaDevices.getUserMedia({

                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },

                video: {
                    width: {
                        ideal: 1280
                    },

                    height: {
                        ideal: 720
                    },

                    frameRate: {
                        ideal: 30,
                        max: 30
                    }
                }

            });

        console.log(
            "✅ Kamera + mikrofon hazır."
        );

        if (localVideo) {

            localVideo.srcObject =
                localStream;

            localVideo.muted =
                true;

            localVideo.autoplay =
                true;

            localVideo.playsInline =
                true;

            localVideo.play()
                .catch(error => {

                    console.warn(
                        "Local video play:",
                        error
                    );

                });
        }

        isMicOn = true;
        isCameraOn = true;

        updateLocalUI();

    } catch (error) {

        console.error(
            "❌ Kamera + mikrofon alınamadı:",
            error
        );

        try {

            localStream =
                await navigator.mediaDevices.getUserMedia({

                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }

                });

            isMicOn = true;
            isCameraOn = false;

            updateLocalUI();

            console.log(
                "🎤 Sadece mikrofon hazır."
            );

        } catch (audioError) {

            console.error(
                "❌ Mikrofon da alınamadı:",
                audioError
            );

            localStream =
                new MediaStream();

            isMicOn = false;
            isCameraOn = false;

            updateLocalUI();
        }
    }
}

// ============================================================
// PEER CONNECTION
// ============================================================

function createPeerConnection() {

    if (peerConnection) {
        return peerConnection;
    }

    console.log(
        "🔗 PeerConnection oluşturuluyor..."
    );

    peerConnection =
        new RTCPeerConnection({

            iceServers: [

                {
                    urls:
                        "stun:stun.l.google.com:19302"
                },

                {
                    urls:
                        "stun:stun1.l.google.com:19302"
                }

            ],

            iceCandidatePoolSize: 10
        });


    if (localStream) {

        for (
            const track of
            localStream.getTracks()
        ) {

            console.log(
                "📤 Local track:",
                track.kind
            );

            peerConnection.addTrack(
                track,
                localStream
            );
        }
    }


    peerConnection.ontrack =
        event => {

            console.log(
                "📥 REMOTE TRACK:",
                event.track.kind
            );

            if (!remoteStream) {
                remoteStream =
                    new MediaStream();
            }

            const exists =
                remoteStream
                    .getTracks()
                    .some(
                        track =>
                            track.id ===
                            event.track.id
                    );

            if (!exists) {

                remoteStream.addTrack(
                    event.track
                );
            }

            if (remoteVideo) {

                remoteVideo.srcObject =
                    remoteStream;

                remoteVideo.autoplay =
                    true;

                remoteVideo.playsInline =
                    true;

                remoteVideo.muted =
                    false;

                remoteVideo.play()
                    .then(() => {

                        console.log(
                            "▶️ Karşı taraf videosu başladı."
                        );

                    })
                    .catch(error => {

                        console.warn(
                            "Remote video:",
                            error
                        );

                    });
            }

            if (remoteAudio) {
                remoteAudio.srcObject =
                    null;
            }

            if (remotePlaceholder) {
                remotePlaceholder.style.display =
                    "none";
            }

            if (peerStatus) {
                peerStatus.textContent =
                    "Görüntü ve ses bağlı";
            }
        };


    peerConnection.onicecandidate =
        event => {

            if (!event.candidate) {
                return;
            }

            sendSignal({

                type:
                    "candidate",

                candidate:
                    event.candidate
            });
        };


    peerConnection.onconnectionstatechange =
        () => {

            const state =
                peerConnection.connectionState;

            console.log(
                "🌐 WebRTC:",
                state
            );

            if (state === "connected") {

                setConnectionState(
                    "connected",
                    "Bağlandı",
                    "Görüşme aktif"
                );

            } else if (
                state === "connecting"
            ) {

                setConnectionState(
                    "connecting",
                    "Bağlanıyor",
                    "Karşı taraf bekleniyor..."
                );

            } else if (
                state === "failed"
            ) {

                setConnectionState(
                    "error",
                    "Bağlantı başarısız",
                    "WebRTC bağlantısı kurulamadı."
                );

            } else if (
                state === "disconnected"
            ) {

                setConnectionState(
                    "error",
                    "Bağlantı kesildi",
                    "Karşı taraf bağlantısı koptu."
                );
            }
        };


    return peerConnection;
}

// ============================================================
// VIDEO OPTIMIZATION
// ============================================================

async function optimizeVideoSender(
    sender,
    maxBitrate,
    maxFramerate
) {

    try {

        const parameters =
            sender.getParameters();

        if (!parameters.encodings) {
            parameters.encodings = [{}];
        }

        parameters.encodings[0].maxBitrate =
            maxBitrate;

        parameters.encodings[0].maxFramerate =
            maxFramerate;

        parameters.encodings[0].scaleResolutionDownBy =
            1;

        await sender.setParameters(
            parameters
        );

    } catch (error) {

        console.warn(
            "Video bitrate ayarlanamadı:",
            error
        );
    }
}

// ============================================================
// SIGNALING
// ============================================================

function connectSocket() {

    if (socket) {
        try {
            socket.close();
        } catch {}
    }

    console.log(
        "🔌 Railway WebSocket:",
        SIGNALING_URL
    );

    socket =
        new WebSocket(
            SIGNALING_URL
        );

    socket.onopen =
        () => {

            console.log(
                "🟢 Signaling bağlantısı açıldı."
            );

            setConnectionState(
                "connected",
                "Sunucu bağlı",
                "Odaya bağlanılıyor..."
            );

            sendSignal({

                type:
                    "join",

                room:
                    currentRoomId,

                name:
                    currentUserName
            });
        };


    socket.onmessage =
        async event => {

            try {

                const message =
                    JSON.parse(
                        event.data
                    );

                console.log(
                    "📨 SIGNAL:",
                    message.type
                );

                await handleSignal(
                    message
                );

            } catch (error) {

                console.error(
                    "Signal parse hatası:",
                    error
                );
            }
        };


    socket.onerror =
        error => {

            console.error(
                "❌ WebSocket:",
                error
            );

            setConnectionState(
                "error",
                "Sunucu hatası",
                "WebSocket bağlantısı başarısız."
            );
        };


    socket.onclose =
        () => {

            console.log(
                "🔴 WebSocket kapandı."
            );
        };
}

function sendSignal(data) {

    if (
        !socket ||
        socket.readyState !==
            WebSocket.OPEN
    ) {
        return;
    }

    socket.send(
        JSON.stringify(data)
    );
}

// ============================================================
// SIGNAL HANDLER
// ============================================================

async function handleSignal(message) {

    switch (message.type) {

        case "joined":

            console.log(
                "🏠 Odaya girdik:",
                message.room,
                "Kişi:",
                message.count
            );

            if (roomCodeDisplay) {
                roomCodeDisplay.textContent =
                    message.room ||
                    currentRoomId;
            }

            break;

        case "peer-joined":

            console.log(
                "👤 Karşı taraf katıldı:",
                message.name
            );

            setRemoteName(
                message.name
            );

            if (peerStatus) {
                peerStatus.textContent =
                    "Karşı taraf bağlandı";
            }

            await createOffer();

            break;

        case "peer-name":

            setRemoteName(
                message.name
            );

            break;

        case "offer":

            await handleOffer(
                message.offer
            );

            break;

        case "answer":

            await handleAnswer(
                message.answer
            );

            break;

        case "candidate":

            await handleCandidate(
                message.candidate
            );

            break;

        case "chat":

            if (
                typeof window.receiveYanYanaChat ===
                "function"
            ) {

                window.receiveYanYanaChat(
                    message.name,
                    message.text
                );
            }

            break;

        case "peer-left":

            console.log(
                "👋 Karşı taraf ayrıldı."
            );

            resetRemote();

            if (peerStatus) {
                peerStatus.textContent =
                    "● Bekleniyor";
            }

            setConnectionState(
                "connected",
                "Sunucu bağlı",
                "Karşı taraf bekleniyor..."
            );

            break;

        case "full":

            alert(
                "Bu oda zaten dolu."
            );

            leaveRoom();

            break;

        case "error":

            console.error(
                "Server error:",
                message.message
            );

            alert(
                message.message ||
                "Sunucu hatası."
            );

            break;
    }
}

// ============================================================
// OFFER
// ============================================================

async function createOffer() {

    try {

        const pc =
            createPeerConnection();

        console.log(
            "📤 OFFER oluşturuluyor..."
        );

        const offer =
            await pc.createOffer();

        await pc.setLocalDescription(
            offer
        );

        sendSignal({

            type:
                "offer",

            offer:
                pc.localDescription
        });

        console.log(
            "📤 OFFER gönderildi."
        );

    } catch (error) {

        console.error(
            "❌ Offer oluşturulamadı:",
            error
        );
    }
}

// ============================================================
// HANDLE OFFER
// ============================================================

async function handleOffer(
    offer
) {

    try {

        const pc =
            createPeerConnection();

        await pc.setRemoteDescription(
            new RTCSessionDescription(
                offer
            )
        );

        await flushCandidates();

        const answer =
            await pc.createAnswer();

        await pc.setLocalDescription(
            answer
        );

        sendSignal({

            type:
                "answer",

            answer:
                pc.localDescription
        });

        console.log(
            "📤 ANSWER gönderildi."
        );

    } catch (error) {

        console.error(
            "❌ Offer işlenemedi:",
            error
        );
    }
}

// ============================================================
// HANDLE ANSWER
// ============================================================

async function handleAnswer(
    answer
) {

    try {

        if (!peerConnection) {
            return;
        }

        await peerConnection.setRemoteDescription(
            new RTCSessionDescription(
                answer
            )
        );

        await flushCandidates();

        console.log(
            "✅ ANSWER kabul edildi."
        );

    } catch (error) {

        console.error(
            "❌ Answer işlenemedi:",
            error
        );
    }
}

// ============================================================
// ICE
// ============================================================

async function handleCandidate(
    candidate
) {

    try {

        if (
            !peerConnection ||
            !peerConnection.remoteDescription
        ) {

            pendingCandidates.push(
                candidate
            );

            return;
        }

        await peerConnection.addIceCandidate(
            new RTCIceCandidate(
                candidate
            )
        );

    } catch (error) {

        console.error(
            "❌ ICE eklenemedi:",
            error
        );
    }
}

async function flushCandidates() {

    if (
        !peerConnection ||
        !peerConnection.remoteDescription
    ) {
        return;
    }

    while (
        pendingCandidates.length > 0
    ) {

        const candidate =
            pendingCandidates.shift();

        try {

            await peerConnection.addIceCandidate(
                new RTCIceCandidate(
                    candidate
                )
            );

        } catch (error) {

            console.error(
                "❌ ICE flush:",
                error
            );
        }
    }
}

// ============================================================
// REMOTE NAME
// ============================================================

function setRemoteName(
    name
) {

    if (remoteName) {

        remoteName.textContent =
            name || "Karşı taraf";
    }
}

// ============================================================
// REMOTE RESET
// ============================================================

function resetRemote() {

    remoteStream =
        null;

    if (remoteVideo) {
        remoteVideo.srcObject =
            null;
    }

    if (remoteAudio) {
        remoteAudio.srcObject =
            null;
    }

    if (remotePlaceholder) {
        remotePlaceholder.style.display =
            "flex";
    }

    if (remotePlaceholderText) {
        remotePlaceholderText.textContent =
            "Karşı taraf bekleniyor";
    }

    if (remoteName) {
        remoteName.textContent =
            "Karşı taraf";
    }
}

// ============================================================
// LOCAL UI
// ============================================================

function updateLocalUI() {

    if (localMicStatus) {

        localMicStatus.textContent =
            isMicOn
                ? "🎤"
                : "🔇";
    }

    if (micBtn) {

        micBtn.classList.toggle(
            "off",
            !isMicOn
        );

        micBtn.innerHTML =
            isMicOn
                ? "🎤 Mikrofon Açık"
                : "🔇 Mikrofon Kapalı";
    }

    if (cameraBtn) {

        cameraBtn.classList.toggle(
            "off",
            !isCameraOn
        );

        cameraBtn.innerHTML =
            isCameraOn
                ? "📷 Kamera Açık"
                : "🚫 Kamera Yok";
    }
}

// ============================================================
// MİKROFON
// ============================================================

if (micBtn) {

    micBtn.addEventListener(
        "click",
        () => {

            if (!localStream) {
                return;
            }

            const tracks =
                localStream.getAudioTracks();

            if (!tracks.length) {
                return;
            }

            isMicOn =
                !isMicOn;

            for (
                const track of tracks
            ) {

                track.enabled =
                    isMicOn;
            }

            updateLocalUI();
        }
    );
}

// ============================================================
// KAMERA
// ============================================================

if (cameraBtn) {

    cameraBtn.addEventListener(
        "click",
        () => {

            if (!localStream) {
                return;
            }

            const tracks =
                localStream.getVideoTracks();

            if (!tracks.length) {
                return;
            }

            isCameraOn =
                !isCameraOn;

            for (
                const track of tracks
            ) {

                track.enabled =
                    isCameraOn;
            }

            updateLocalUI();
        }
    );
}

// ============================================================
// EKRAN PAYLAŞIMI
// ============================================================

// ============================================================
// EKRAN PAYLAŞIMI
// ============================================================

if (screenBtn) {

    screenBtn.addEventListener(
        "click",
        toggleScreenShare
    );

}

async function toggleScreenShare() {

    if (isScreenSharing) {

        await stopScreenShare();

        return;
    }

    if (!peerConnection) {

        alert(
            "Önce karşı tarafın bağlanmasını bekle."
        );

        return;
    }

    try {

        console.log(
            "🖥️ Ekran paylaşımı isteniyor..."
        );

        screenStream =
            await navigator.mediaDevices.getDisplayMedia({

                video: {
                    width: {
                        ideal: 1920
                    },

                    height: {
                        ideal: 1080
                    },

                    frameRate: {
                        ideal: 60,
                        max: 60
                    }
                },

                audio: false

            });

        const screenTrack =
            screenStream.getVideoTracks()[0];

        if (!screenTrack) {

            console.error(
                "❌ Ekran track'i bulunamadı."
            );

            return;
        }

        screenTrack.contentHint =
          "detail";

        // ====================================================
        // VAR OLAN KAMERA TRACK'İ VARSA ONU DEĞİŞTİR
        // ====================================================

        let sender =
            peerConnection
                .getSenders()
                .find(
                    item =>
                        item.track &&
                        item.track.kind === "video"
                );

        if (sender) {

            console.log(
                "🎥 Kamera track'i ekran ile değiştiriliyor."
            );

            await sender.replaceTrack(
                screenTrack
            );

        }

        // ====================================================
        // KAMERA YOKSA EKRAN TRACK'İNİ YENİ EKLE
        // ====================================================

        else {

            console.log(
                "🖥️ Kamera track'i yok. Ekran track'i ekleniyor."
            );

            sender =
                peerConnection.addTrack(
                    screenTrack,
                    screenStream
                );

            // Yeni video track eklendiği için
            // tekrar SDP görüşmesi yapıyoruz.

            const offer =
                await peerConnection.createOffer();

            await peerConnection.setLocalDescription(
                offer
            );

            sendSignal({

                type:
                    "offer",

                offer:
                    peerConnection.localDescription
            });
        }

        await optimizeVideoSender(
            sender,
            10000000,
            30
        );

        isScreenSharing =
            true;

        if (screenBtn) {

            screenBtn.classList.add(
                "active"
            );

            screenBtn.innerHTML =
                "🛑 Ekranı Durdur";
        }

        screenTrack.onended =
            () => {

                stopScreenShare();

            };

        console.log(
            "🖥️ Ekran paylaşımı başladı."
        );

    } catch (error) {

        console.error(
            "❌ Ekran paylaşımı:",
            error
        );

        screenStream = null;
        isScreenSharing = false;
    }
}

// ============================================================
// EKRAN PAYLAŞIMINI DURDUR
// ============================================================

async function stopScreenShare() {

    if (!isScreenSharing) {
        return;
    }

    try {

        const cameraTrack =
            localStream
                ? localStream.getVideoTracks()[0]
                : null;

        const sender =
            peerConnection
                ? peerConnection
                    .getSenders()
                    .find(
                        item =>
                            item.track &&
                            item.track.kind === "video"
                    )
                : null;

        // ====================================================
        // KAMERA VARSA EKRANDAN KAMERAYA GERİ DÖN
        // ====================================================

        if (
            sender &&
            cameraTrack
        ) {

            console.log(
                "🎥 Kameraya geri dönülüyor."
            );

            await sender.replaceTrack(
                cameraTrack
            );

            await optimizeVideoSender(
                sender,
                6000000,
                60
            );
        }

        // ====================================================
        // KAMERA YOKSA EKRAN TRACK'İNİ KALDIR
        // ====================================================

        else if (
            sender &&
            !cameraTrack
        ) {

            console.log(
                "🖥️ Kamera yok, ekran track'i kaldırılıyor."
            );

            peerConnection.removeTrack(
                sender
            );

            // Track kaldırıldığı için
            // karşı tarafa yeni SDP gönder.

            const offer =
                await peerConnection.createOffer();

            await peerConnection.setLocalDescription(
                offer
            );

            sendSignal({

                type:
                    "offer",

                offer:
                    peerConnection.localDescription
            });
        }

        // ====================================================
        // SCREEN STREAM KAPAT
        // ====================================================

        if (screenStream) {

            for (
                const track of
                screenStream.getTracks()
            ) {

                track.stop();
            }
        }

        screenStream =
            null;

        isScreenSharing =
            false;

        if (screenBtn) {

            screenBtn.classList.remove(
                "active"
            );

            screenBtn.innerHTML =
                "🖥️ Ekran Paylaş";
        }

        console.log(
            "🛑 Ekran paylaşımı durduruldu."
        );

    } catch (error) {

        console.error(
            "❌ Ekran paylaşımı kapatma:",
            error
        );
    }
}

// ============================================================
// EKRAN PAYLAŞIMINI DURDUR
// ============================================================

async function stopScreenShare() {

    if (!isScreenSharing) {
        return;
    }

    try {

        const cameraTrack =
            localStream
                ? localStream.getVideoTracks()[0]
                : null;

        const sender =
            peerConnection
                ? peerConnection
                    .getSenders()
                    .find(
                        item =>
                            item.track &&
                            item.track.kind ===
                                "video"
                    )
                : null;

        if (
            sender &&
            cameraTrack
        ) {

            await sender.replaceTrack(
                cameraTrack
            );

            await optimizeVideoSender(
                sender,
                6000000,
                60
            );
        }

        if (screenStream) {

            for (
                const track of
                screenStream.getTracks()
            ) {

                track.stop();
            }
        }

        screenStream =
            null;

        isScreenSharing =
            false;

        if (screenBtn) {

            screenBtn.classList.remove(
                "active"
            );

            screenBtn.innerHTML =
                "🖥️ Ekran Paylaş";
        }

    } catch (error) {

        console.error(
            "❌ Ekran paylaşımı kapatma:",
            error
        );
    }
}

// ============================================================
// SES
// ============================================================

if (speakerBtn) {

    speakerBtn.addEventListener(
        "click",
        () => {

            if (!remoteVideo) {
                return;
            }

            remoteVideo.muted =
                !remoteVideo.muted;

            speakerBtn.innerHTML =
                remoteVideo.muted
                    ? "🔇 Ses Kapalı"
                    : "🔊 Ses";
        }
    );
}

// ============================================================
// ODA KODU KOPYALA
// ============================================================

async function copyRoomCode() {

    if (!currentRoomId) {
        return;
    }

    try {

        await navigator.clipboard.writeText(
            currentRoomId
        );

        console.log(
            "📋 Oda kodu kopyalandı."
        );

    } catch (error) {

        console.error(
            "❌ Oda kodu kopyalanamadı:",
            error
        );
    }
}

if (copyRoomBtn) {

    copyRoomBtn.addEventListener(
        "click",
        copyRoomCode
    );
}

if (copyRoomTopBtn) {

    copyRoomTopBtn.addEventListener(
        "click",
        copyRoomCode
    );
}

// ============================================================
// TAM EKRAN
// ============================================================

function enableFullscreen() {

    const remoteBox =
        document.getElementById("remoteVideoBox");

    const remoteVideoElement =
        document.getElementById("remoteVideo");

    if (!remoteBox) {
        return;
    }

    // Daha önce oluşturulduysa tekrar oluşturma
    if (
        document.getElementById("fullscreenBtn")
    ) {
        return;
    }

    const button =
        document.createElement("button");

    button.id =
        "fullscreenBtn";

    button.className =
        "fullscreen-button";

    button.textContent =
        "⛶";

    button.title =
        "Tam ekran";

    button.addEventListener(
        "click",
        async () => {

            try {

                if (
                    document.fullscreenElement
                ) {

                    await document.exitFullscreen();

                    return;
                }

                // Önce video elementini dene
                if (
                    remoteVideoElement &&
                    remoteVideoElement.requestFullscreen
                ) {

                    await remoteVideoElement.requestFullscreen();

                } else {

                    await remoteBox.requestFullscreen();

                }

            } catch (error) {

                console.error(
                    "❌ Tam ekran açılamadı:",
                    error
                );

                // Video çalışmazsa kutuyu dene
                try {

                    await remoteBox.requestFullscreen();

                } catch (secondError) {

                    console.error(
                        "❌ Kutu tam ekranı da açılamadı:",
                        secondError
                    );
                }
            }
        }
    );

    remoteBox.appendChild(
        button
    );


    // ========================================================
    // ÇİFT TIKLA TAM EKRAN
    // ========================================================

    if (remoteVideoElement) {

        remoteVideoElement.addEventListener(
            "dblclick",
            async () => {

                try {

                    if (
                        document.fullscreenElement
                    ) {

                        await document.exitFullscreen();

                    } else {

                        await remoteVideoElement.requestFullscreen();

                    }

                } catch (error) {

                    console.error(
                        "❌ Çift tık tam ekran:",
                        error
                    );

                    try {

                        await remoteBox.requestFullscreen();

                    } catch {}
                }
            }
        );
    }


    // ========================================================
    // TAM EKRANDAN ÇIKINCA
    // ========================================================

    document.addEventListener(
        "fullscreenchange",
        () => {

            if (
                document.fullscreenElement
            ) {

                button.textContent =
                    "⛶";

                button.title =
                    "Tam ekrandan çık";

            } else {

                button.textContent =
                    "⛶";

                button.title =
                    "Tam ekran";
            }
        }
    );
}

// ============================================================
// ÇIKIŞ
// ============================================================

if (leaveCallBtn) {

    leaveCallBtn.addEventListener(
        "click",
        () => {

            if (leaveModal) {

                leaveModal.style.display =
                    "flex";
            }
        }
    );
}

if (cancelLeaveBtn) {

    cancelLeaveBtn.addEventListener(
        "click",
        () => {

            if (leaveModal) {

                leaveModal.style.display =
                    "none";
            }
        }
    );
}

if (confirmLeaveBtn) {

    confirmLeaveBtn.addEventListener(
        "click",
        leaveRoom
    );
}

function leaveRoom() {

    if (screenStream) {

        for (
            const track of
            screenStream.getTracks()
        ) {

            track.stop();
        }
    }

    if (localStream) {

        for (
            const track of
            localStream.getTracks()
        ) {

            track.stop();
        }
    }

    if (peerConnection) {

        peerConnection.close();

        peerConnection =
            null;
    }

    if (socket) {

        socket.close();

        socket =
            null;
    }

    currentRoomId =
        null;

    currentUserName =
        null;

    showLobby();

    if (joinRoomArea) {

        joinRoomArea.classList.add(
            "hidden"
        );

        joinRoomArea.style.display =
            "none";
    }

    if (roomCodeInput) {
        roomCodeInput.value =
            "";
    }

    const cleanUrl =
        window.location.pathname;

    window.history.replaceState(
        {},
        "",
        cleanUrl
    );
}

// ============================================================
// BAŞLAT
// ============================================================

async function start() {

    console.log(
        "🚀 YanYana başlatılıyor..."
    );

    console.log(
        "🏠 Oda:",
        currentRoomId
    );

    console.log(
        "👤 Kullanıcı:",
        currentUserName
    );

    showAppScreen();

    setConnectionState(
        "connecting",
        "Bağlanıyor",
        "Kamera hazırlanıyor..."
    );

    await getLocalMedia();

    createPeerConnection();

    connectSocket();

    enableFullscreen();

    console.log(
        "✅ YanYana hazır."
    );
}