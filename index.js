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
                    return (name of current track) & "|||" & (artist of current track) & "|||PLAYING"
                else
                    return (name of current track) & "|||" & (artist of current track) & "|||PAUSED"
                end if
            end tell
        else
            return "NOT_RUNNING"
        end if
    `;

    setInterval(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;

        exec(`osascript -e '${appleScript}'`, (err, stdout) => {
            if (err) return;
            if (!mainWindow || mainWindow.isDestroyed()) return;
            
            const response = stdout.trim();
            
            if (response === "NOT_RUNNING") {
                mainWindow.webContents.send('music-update', { playing: false, status: 'STOPPED' });
            } else {
                const parts = response.split('|||');
                const title = parts[0] || 'Unknown Track';
                const artist = parts[1] || 'Unknown Artist';
                const status = parts[2] || 'PAUSED';

                if (status === 'PAUSED') {
                    mainWindow.webContents.send('music-update', {
                        playing: true,
                        status: 'PAUSED',
                        title: title,
                        artist: artist
                    });
                } else {
                    mainWindow.webContents.send('music-update', {
                        playing: true,
                        status: 'PLAYING',
                        title: title,
                        artist: artist
                    });
                }
            }
        });
    }, 1000);  
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