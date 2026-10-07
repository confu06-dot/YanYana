const {
    app,
    BrowserWindow,
    session,
    desktopCapturer,
    ipcMain,
    shell
} = require("electron");

const path = require("path");

app.setPath(
    "userData",
    path.join(__dirname, "yanyana-data")
);

app.commandLine.appendSwitch(
    "disable-http-cache"
);

app.commandLine.appendSwitch(
    "disable-gpu-shader-disk-cache"
);

app.commandLine.appendSwitch(
    "disable-gpu-program-cache"
);

app.commandLine.appendSwitch(
    "disable-features",
    "GpuDiskCache"
);

app.commandLine.appendSwitch(
    "disable-breakpad"
);

ipcMain.on("window-minimize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
});

ipcMain.on("window-maximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
        if (win.isMaximized()) {
            win.unmaximize();
        } else {
            win.maximize();
        }
    }
});

ipcMain.on("window-close", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
});

// Discord stili ekran & pencere kaynaklarını önizlemeleriyle getir
ipcMain.handle("get-screen-sources", async () => {
    try {
        const sources = await desktopCapturer.getSources({
            types: ["screen", "window"],
            thumbnailSize: { width: 360, height: 200 },
            fetchWindowIcons: true
        });

        return sources.map(s => ({
            id: s.id,
            name: s.name,
            thumbnail: s.thumbnail.toDataURL(),
            appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
            isScreen: s.id.startsWith("screen:")
        }));
    } catch (e) {
        console.error("❌ desktopCapturer error:", e);
        return [];
    }
});

// Chat linklerini güvenle tarayıcıda aç
ipcMain.handle("open-external-url", (event, url) => {
    if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
        shell.openExternal(url);
    }
});

function createWindow() {

    const win = new BrowserWindow({

        width: 1440,
        height: 900,

        minWidth: 1100,
        minHeight: 700,

        frame: false,
        backgroundColor: "#08080d",

        webPreferences: {

            nodeIntegration: true,

            contextIsolation: false,

            autoplayPolicy:
                "no-user-gesture-required"

        }

    });

    win.loadFile(
        path.join(
            __dirname,
            "index.html"
        )
    );
}

app.whenReady().then(() => {

    session.defaultSession
        .setDisplayMediaRequestHandler(
            async (request, callback) => {

                try {

                    const sources =
                        await desktopCapturer.getSources({
                            types: [
                                "screen",
                                "window"
                            ]
                        });

                    if (!sources.length) {

                        console.error(
                            "❌ Ekran kaynağı bulunamadı."
                        );

                        callback({});

                        return;
                    }

                    console.log(
                        "🖥️ Ekran kaynağı seçildi:",
                        sources[0].name
                    );

                    callback({
                        video: sources[0]
                    });

                } catch (error) {

                    console.error(
                        "❌ Ekran kaynağı alınamadı:",
                        error
                    );

                    callback({});
                }

            }
        );

    createWindow();

    app.on(
        "activate",
        () => {

            if (
                BrowserWindow
                    .getAllWindows()
                    .length === 0
            ) {

                createWindow();

            }

        }
    );

});

app.on(
    "window-all-closed",
    () => {

        if (
            process.platform !== "darwin"
        ) {

            app.quit();

        }

    }
);