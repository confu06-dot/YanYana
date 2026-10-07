const messageInput =
    document.getElementById("messageInput");

const sendBtn =
    document.getElementById("sendBtn");

const messages =
    document.getElementById("messages");


// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(text) {

    const div =
        document.createElement("div");

    div.textContent =
        String(text);

    return div.innerHTML;
}


// ============================================================
// MESAJ EKLE
// ============================================================

function addChatMessage(name, text) {

    if (!messages) {
        return;
    }


    const message =
        document.createElement("div");

    message.className =
        "chat-message";


    message.innerHTML = `
        <div class="chat-message-name">
            ${escapeHtml(name)}
        </div>

        <div class="chat-message-text">
            ${escapeHtml(text)}
        </div>
    `;


    messages.appendChild(
        message
    );


    messages.scrollTop =
        messages.scrollHeight;
}


// ============================================================
// SOCKET
// ============================================================

function getSocket() {

    try {

        if (
            typeof socket !== "undefined"
        ) {
            return socket;
        }

    } catch {}

    return null;
}


// ============================================================
// GÖNDER
// ============================================================

function sendChatMessage() {

    if (!messageInput) {
        return;
    }


    const text =
        messageInput.value.trim();


    if (!text) {
        return;
    }


    const ws =
        getSocket();


    if (
        !ws ||
        ws.readyState !== WebSocket.OPEN
    ) {

        addChatMessage(
            "YanYana",
            "Sunucu bağlantısı yok."
        );

        return;
    }


    let name = "Sen";


    try {

        if (
            typeof currentUserName !==
                "undefined" &&
            currentUserName
        ) {
            name =
                currentUserName;
        }

    } catch {}


    ws.send(
        JSON.stringify({
            type: "chat",
            name: name,
            text: text
        })
    );


    messageInput.value = "";

    messageInput.focus();
}


// ============================================================
// EVENTS
// ============================================================

if (sendBtn) {

    sendBtn.addEventListener(
        "click",
        sendChatMessage
    );

}


if (messageInput) {

    messageInput.addEventListener(
        "keydown",
        event => {

            if (event.key === "Enter") {

                event.preventDefault();

                sendChatMessage();
            }

        }
    );

}


// ============================================================
// RENDERER'DAN ÇAĞRILIR
// ============================================================

window.receiveYanYanaChat =
    function(name, text) {

        addChatMessage(
            name || "Misafir",
            text || ""
        );

    };


console.log(
    "💬 Chat sistemi hazır."
);