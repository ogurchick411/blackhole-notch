const { app, BrowserWindow, screen, ipcMain, systemPreferences } = require('electron');
const os = require('os');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow;
const coverPath = '/tmp/notch_cover.png';

function createNotchWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.bounds;

    // TODO: заебался уже. легче уже было 10 баксов заплатить за подписку чем эту челку руками двигать
    mainWindow = new BrowserWindow({
        width: 180,
        height: 32,
        x: Math.floor((screenWidth - 180) / 2),
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
                set playerState to player state
                if playerState is playing or playerState is paused then
                    set trackName to name of current track
                    set trackArtist to artist of current track
                    set trackBPM to bpm of current track
                    set trackGenre to genre of current track
                    set stateStr to "PLAYING"
                    if playerState is paused then set stateStr to "PAUSED"
                    
                    try
                        set someArtwork to raw data of artwork 1 of current track
                        set fileRef to (open for access POSIX file "${coverPath}" with write permission)
                        set eof fileRef to 0
                        write someArtwork to fileRef
                        close access fileRef
                        set hasArt to "true"
                    on error
                        set hasArt to "false"
                    end try
                    
                    return trackName & "|||" & trackArtist & "|||" & stateStr & "|||" & trackBPM & "|||" & trackGenre & "|||" & hasArt
                else
                    return "NOT_PLAYING"
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
            
            if (response === "NOT_RUNNING" || response === "NOT_PLAYING") {
                mainWindow.webContents.send('music-update', { playing: false, status: 'STOPPED' });
            } else {
                const parts = response.split('|||');
                const title = parts[0] || 'Unknown Track';
                const artist = parts[1] || 'Unknown Artist';
                const status = parts[2] || 'PAUSED';
                const bpm = parseInt(parts[3]) || 0;
                const genre = parts[4] || 'Unknown';
                const hasArt = parts[5] === 'true';
 
                mainWindow.webContents.send('music-update', {
                    playing: true,
                    status: status,
                    title: title,
                    artist: artist,
                    bpm: bpm,
                    genre: genre,
                    hasArt: hasArt
                });
            }
        });
    }, 1000);  
}

ipcMain.on('resize-window', (event, width, height) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.bounds;
    
    mainWindow.setBounds({
        width: width,
        height: height,
        x: Math.floor((screenWidth - width) / 2),
        y: 0
    });
});

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setIgnoreMouseEvents(ignore, options);
    }
});

ipcMain.on('open-apple-music', () => {
    const openScript = `
        tell application "Music"
            activate
        end tell
    `;
    exec(`osascript -e '${openScript}'`, (err) => {
        if (err) console.error("Failed to open Apple Music:", err);
    });
});

ipcMain.on('music-control', (event, action) => {
    let scriptCommand = '';
    if (action === 'playpause') scriptCommand = 'playpause';
    if (action === 'next') scriptCommand = 'next track';
    if (action === 'prev') scriptCommand = 'previous track';

    if (!scriptCommand) return;

    const controlScript = `
        tell application "Music"
            ${scriptCommand}
        end tell
    `;
    exec(`osascript -e '${controlScript}'`, (err) => {
        if (err) console.error(`Failed to execute music control (${action}):`, err);
    });
});

app.whenReady().then(createNotchWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('trigger-haptic', () => {
    if (process.platform === 'darwin' && systemPreferences.vibrateHW) {
        systemPreferences.vibrateHW([0]); 
    }
});