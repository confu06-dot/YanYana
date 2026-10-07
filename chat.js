// ============================================================
// YANYANA - CHAT.JS (PREMIUM CHAT SYSTEM WITH SOUND & TYPING)
// ============================================================

const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const messages = document.getElementById("messages");
const emojiBtn = document.getElementById("emojiBtn");
const emojiPicker = document.getElementById("emojiPicker");
const typingIndicator = document.getElementById("typingIndicator");
const typingPartnerName = document.getElementById("typingPartnerName");

let typingTimeout = null;
let lastTypingSent = 0;

// ============================================================
// WEB AUDIO SYNTHESIZED SOUND EFFECTS
// ============================================================

function playMessageSound() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1); // A5

        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.22);
    } catch (e) {}
}

// ============================================================
// HTML ESCAPE & LINK PARSER
// ============================================================

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
}

function formatMessageText(rawText) {
    const escaped = escapeHtml(rawText);
    const urlPattern = /(https?:\/\/[^\s<]+)/g;
    return escaped.replace(urlPattern, (url) => {
        return `<a href="#" class="chat-clickable-link" data-url="${url}" style="color: #a78bfa; text-decoration: underline; word-break: break-all;">${url}</a>`;
    });
}

// Handle clicking links safely
document.addEventListener("click", (e) => {
    const link = e.target.closest(".chat-clickable-link");
    if (link) {
        e.preventDefault();
        const targetUrl = link.getAttribute("data-url");
        if (targetUrl) {
            try {
                if (window.require) {
                    const { ipcRenderer } = window.require("electron");
                    ipcRenderer?.invoke("open-external-url", targetUrl);
                    return;
                }
            } catch (err) {}
            window.open(targetUrl, "_blank");
        }
    }
});

// ============================================================
// MESAJ EKLE
// ============================================================

function addChatMessage(name, text, isSelfOverride = null) {
    if (!messages) return;

    let isSelf = false;
    if (isSelfOverride !== null) {
        isSelf = isSelfOverride;
    } else {
        const myName = (typeof currentUserName !== "undefined" && currentUserName) ? currentUserName : "Sen";
        isSelf = (name === myName || name === "Sen");
    }

    const row = document.createElement("div");
    row.className = `chat-row ${isSelf ? "outgoing" : "incoming"}`;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const formattedText = formatMessageText(text);

    if (isSelf) {
        row.innerHTML = `
            <div class="bubble-wrap">
                <div class="bubble-body">${formattedText}</div>
                <div class="bubble-meta">
                    <span>${timeStr}</span>
                </div>
            </div>
        `;
    } else {
        row.innerHTML = `
            <img src="assets/avatar.jpg" alt="${escapeHtml(name)}" class="chat-avatar-small">
            <div class="bubble-wrap">
                <div class="bubble-body">${formattedText}</div>
                <div class="bubble-meta">
                    <span>${timeStr}</span>
                </div>
            </div>
        `;
        playMessageSound();
    }

    // Hide typing indicator when message arrives
    if (!isSelf && typingIndicator) {
        typingIndicator.classList.add("hidden");
    }

    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
}

// ============================================================
// TYPING INDICATOR
// ============================================================

window.showTypingIndicator = function(name) {
    if (!typingIndicator) return;
    if (typingPartnerName) {
        typingPartnerName.textContent = `${name || "Partner"} yazıyor...`;
    }
    typingIndicator.classList.remove("hidden");

    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        typingIndicator.classList.add("hidden");
    }, 2800);
};

function notifyTyping() {
    const now = Date.now();
    if (now - lastTypingSent < 1800) return;
    lastTypingSent = now;

    const ws = getSocket();
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: "typing",
            name: (typeof currentUserName !== "undefined" && currentUserName) ? currentUserName : "Sen"
        }));
    }
}

// ============================================================
// SOCKET
// ============================================================

function getSocket() {
    try {
        if (typeof socket !== "undefined") {
            return socket;
        }
    } catch {}
    return null;
}

// ============================================================
// GÖNDER
// ============================================================

function sendChatMessage() {
    if (!messageInput) return;

    const text = messageInput.value.trim();
    if (!text) return;

    const ws = getSocket();
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        addChatMessage("YanYana", "Sunucu bağlantısı yok.", false);
        return;
    }

    let name = "Sen";
    try {
        if (typeof currentUserName !== "undefined" && currentUserName) {
            name = currentUserName;
        }
    } catch {}

    ws.send(JSON.stringify({
        type: "chat",
        name: name,
        text: text
    }));

    messageInput.value = "";
    messageInput.focus();

    if (emojiPicker) {
        emojiPicker.classList.add("hidden");
    }
}

// ============================================================
// EVENTS
// ============================================================

if (sendBtn) {
    sendBtn.addEventListener("click", sendChatMessage);
}

if (messageInput) {
    messageInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            sendChatMessage();
        }
    });

    messageInput.addEventListener("input", notifyTyping);
}

// Emoji Picker
if (emojiBtn && emojiPicker) {
    emojiBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        emojiPicker.classList.toggle("hidden");
    });

    emojiPicker.querySelectorAll(".emoji-item-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (messageInput) {
                messageInput.value += btn.textContent;
                messageInput.focus();
            }
            emojiPicker.classList.add("hidden");
        });
    });

    document.addEventListener("click", (e) => {
        if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
            emojiPicker.classList.add("hidden");
        }
    });
}

// ============================================================
// RENDERER'DAN ÇAĞRILIR
// ============================================================

window.receiveYanYanaChat = function(name, text) {
    addChatMessage(name || "Misafir", text || "");
};

console.log("💬 Chat sistemi hazır.");