const {
    app,
    BrowserWindow,
    session,
    desktopCapturer
} = require("electron");

const { autoUpdater } = require("electron-updater");
const path = require("path");

app.setPath(
    "userData",
    path.join(__dirname, "yanyana-data")
);

app.commandLine.appendSwitch("disable-http-cache");
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disable-gpu-program-cache");
app.commandLine.appendSwitch(
    "disable-features",
    "GpuDiskCache"
);
app.commandLine.appendSwitch("disable-breakpad");

function createWindow() {
    const win = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        backgroundColor: "#08080d",

        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            autoplayPolicy:
                "no-user-gesture-required"
        }
    });

    win.loadFile(
        path.join(__dirname, "index.html")
    );
}

function setupAutoUpdater() {
    if (!app.isPackaged) {
        console.log(
            "🔄 Geliştirme modunda güncelleme kontrolü kapalı."
        );
        return;
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("checking-for-update", () => {
        console.log(
            "🔎 YanYana güncelleme kontrol ediliyor..."
        );
    });

    autoUpdater.on("update-available", info => {
        console.log(
            "🆕 Yeni YanYana sürümü bulundu:",
            info.version
        );
    });

    autoUpdater.on("update-not-available", () => {
        console.log(
            "✅ YanYana güncel."
        );
    });

    autoUpdater.on("download-progress", progress => {
        console.log(
            `⬇️ Güncelleme indiriliyor: ${Math.round(
                progress.percent
            )}%`
        );
    });

    autoUpdater.on("update-downloaded", info => {
        console.log(
            "✅ Güncelleme indirildi:",
            info.version
        );

        // Uygulama kapatıldığında yeni sürümü kur.
        autoUpdater.quitAndInstall(
            false,
            true
        );
    });

    autoUpdater.on("error", error => {
        console.error(
            "❌ Güncelleme hatası:",
            error
        );
    });

    autoUpdater.checkForUpdates();
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

    setupAutoUpdater();

    app.on("activate", () => {
        if (
            BrowserWindow.getAllWindows()
                .length === 0
        ) {
            createWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (
        process.platform !== "darwin"
    ) {
        app.quit();
    }
});