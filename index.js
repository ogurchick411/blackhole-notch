const { app, BrowserWindow, screen, ipcMain, systemPreferences } = require('electron');
const os = require('os');
const { exec } = require('child_process');

let mainWindow;

function getNotchDimensions() {
    const model = os.cpus()[0]?.model || '';
    let width = 180;
    let height = 28;
    return { width, height };
}

function createNotchWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.bounds;

    mainWindow = new BrowserWindow({
        width: 540,
        height: 150,
        x: Math.floor((screenWidth - 540) / 2),
        y: 0,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        focusable: false,
        enableLargerThanScreen: true,
        hasShadow: false, 
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setIgnoreMouseEvents(true, { forward: true });

    mainWindow.loadFile('index.html');

    mainWindow.webContents.on('did-finish-load', () => {
        startMusicTicker();
    });
}

function startMusicTicker() {
    const appleScript = `
        tell application "System Events"
            set processList to (name of every process)
        end tell
        if processList contains "Music" then
            tell application "Music"
                if player state is playing then
                    return (name of current track) & "|||" & (artist of current track)
                else
                    return "PAUSED"
                end if
            end tell
        else
            return "NOT_RUNNING"
        end if
    `;

    setInterval(() => {
        exec(`osascript -e '${appleScript}'`, (err, stdout) => {
            if (err) return;
            const response = stdout.trim();
            
            if (response === "NOT_RUNNING" || response === "PAUSED") {
                mainWindow.webContents.send('music-update', { playing: false });
            } else {
                const [title, artist] = response.split('|||');
                mainWindow.webContents.send('music-update', {
                    playing: true,
                    title: title || 'Неизвестный трек',
                    artist: artist || 'Неизвестный исполнитель'
                });
            }
        });
    }, 2000);  
}

app.whenReady().then(createNotchWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('trigger-haptic', () => {
    if (process.platform === 'darwin' && systemPreferences.vibrateHW) {
        systemPreferences.vibrateHW([0]); 
    }
});