const WebSocket = require("ws");

const PORT = process.env.PORT || 3001;

const server = new WebSocket.Server({
    port: PORT
});

const rooms = new Map();

console.log(
    `YanYana server çalışıyor: port ${PORT}`
);


// ============================================================
// ROOM HELPER
// ============================================================

function getRoom(roomId) {

    if (!rooms.has(roomId)) {
        rooms.set(roomId, []);
    }

    return rooms.get(roomId);
}


function send(ws, data) {

    if (
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {
        ws.send(
            JSON.stringify(data)
        );
    }

}


function broadcast(room, data, except = null) {

    for (const client of room) {

        if (client === except) {
            continue;
        }

        send(client, data);
    }

}


// ============================================================
// CONNECTION
// ============================================================

server.on("connection", (ws) => {

    console.log("Yeni WebSocket bağlantısı.");


    ws.roomId = null;
    ws.userName = null;


    // --------------------------------------------------------
    // MESSAGE
    // --------------------------------------------------------

    ws.on("message", (raw) => {

        try {

            const message =
                JSON.parse(raw.toString());

            // =================================================
            // JOIN
            // =================================================

            if (message.type === "join") {

                const roomId =
                    String(message.room || "");

                const name =
                    String(message.name || "Misafir");


                if (!roomId) {

                    send(ws, {
                        type: "error",
                        message: "Oda kodu eksik."
                    });

                    return;
                }


                const room =
                    getRoom(roomId);


                // Maksimum 2 kişi
                if (room.length >= 2) {

                    send(ws, {
                        type: "full"
                    });

                    return;
                }


                ws.roomId = roomId;
                ws.userName = name;


                room.push(ws);


                console.log(
                    `Odaya katıldı: ${roomId} / ${name}`
                );


                send(ws, {
                    type: "joined",
                    room: roomId,
                    count: room.length
                });


                // Yeni kişi geldiyse mevcut kişiye bildir
                if (room.length === 2) {

                    const other =
                        room.find(
                            client => client !== ws
                        );


                    send(other, {
                        type: "peer-joined",
                        name: name
                    });


                    // Yeni kişiye mevcut kişinin adını gönder
                    send(ws, {
                        type: "peer-name",
                        name: other.userName
                    });


                    console.log(
                        `Oda doldu: ${roomId}`
                    );
                }


                return;
            }


            // =================================================
            // PEER NAME
            // =================================================

            if (message.type === "peer-name") {

                const room =
                    rooms.get(ws.roomId);

                if (!room) {
                    return;
                }

                broadcast(
                    room,
                    {
                        type: "peer-name",
                        name: ws.userName
                    },
                    ws
                );

                return;
            }


            // =================================================
            // OFFER
            // =================================================

            if (message.type === "offer") {

                const room =
                    rooms.get(ws.roomId);

                if (!room) {
                    return;
                }

                broadcast(
                    room,
                    {
                        type: "offer",
                        offer: message.offer
                    },
                    ws
                );

                return;
            }


            // =================================================
            // ANSWER
            // =================================================

            if (message.type === "answer") {

                const room =
                    rooms.get(ws.roomId);

                if (!room) {
                    return;
                }

                broadcast(
                    room,
                    {
                        type: "answer",
                        answer: message.answer
                    },
                    ws
                );

                return;
            }


            // =================================================
            // ICE CANDIDATE
            // =================================================

            if (message.type === "candidate") {

                const room =
                    rooms.get(ws.roomId);

                if (!room) {
                    return;
                }

                broadcast(
                    room,
                    {
                        type: "candidate",
                        candidate: message.candidate
                    },
                    ws
                );

                return;
            }


            // =================================================
            // CHAT
            // =================================================

            if (message.type === "chat") {

                const room =
                    rooms.get(ws.roomId);

                if (!room) {
                    return;
                }

                broadcast(
                    room,
                    {
                        type: "chat",
                        name:
                            message.name ||
                            ws.userName ||
                            "Misafir",
                        text:
                            String(
                                message.text || ""
                            )
                    }
                );

                return;
            }

        } catch (error) {

            console.error(
                "Mesaj işleme hatası:",
                error
            );

        }

    });


    // --------------------------------------------------------
    // CLOSE
    // --------------------------------------------------------

    ws.on("close", () => {

        const roomId =
            ws.roomId;

        if (!roomId) {
            return;
        }


        const room =
            rooms.get(roomId);


        if (!room) {
            return;
        }


        const index =
            room.indexOf(ws);


        if (index !== -1) {
            room.splice(index, 1);
        }


        broadcast(
            room,
            {
                type: "peer-left"
            }
        );


        if (room.length === 0) {

            rooms.delete(roomId);

            console.log(
                `Oda silindi: ${roomId}`
            );

        }

    });


    ws.on("error", (error) => {

        console.error(
            "WebSocket hatası:",
            error
        );

    });

});