const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

let mainWindow;
const coverPath = '/tmp/notch_cover.png';

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 180,
        height: 32,
        x: 0,
        y: 0,
        transparent: true,
        frame: false,
        resizable: false,
        hasShadow: false,
        alwaysOnTop: true,
        type: 'panel',
        enableLargerThanScreen: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    mainWindow.loadFile('index.html');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width } = primaryDisplay.bounds;
    const windowWidth = mainWindow.getBounds().width;
    const x = Math.floor((width - windowWidth) / 2);
    
    mainWindow.setPosition(x, 0);
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
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
                    set curPos to player position
                    set totalDur to duration of current track
                    
                    set hasArt to "false"
                    try
                        if (count of artworks of current track) > 0 then
                            set hasArt to "true"
                            set artData to raw data of artwork 1 of current track
                            set filePath to posix path of "${coverPath}"
                            
                            set fileRef to open for access filePath with write permission
                            set eof fileRef to 0
                            write artData to fileRef
                            close access fileRef
                        end if
                    on error
                        try
                            close access file "${coverPath}"
                        end try
                    end try
                    
                    set stateStr to "PLAYING"
                    if playerState is paused then set stateStr to "PAUSED"
                    return trackName & "|||" & trackArtist & "|||" & stateStr & "|||" & trackBPM & "|||" & trackGenre & "|||" & curPos & "|||" & totalDur & "|||" & hasArt
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
            const response = stdout.trim();
            
            if (response === "NOT_RUNNING" || response === "NOT_PLAYING" || response === "") {
                mainWindow.webContents.send('music-update', { playing: false, status: 'STOPPED' });
            } else {
                const parts = response.split('|||');
                mainWindow.webContents.send('music-update', {
                    playing: true,
                    title: parts[0] || 'Unknown Track',
                    artist: parts[1] || 'Unknown Artist',
                    status: parts[2] || 'PAUSED',
                    bpm: parseInt(parts[3]) || 0,
                    genre: parts[4] || 'Unknown',
                    position: parseFloat(parts[5]) || 0,
                    duration: parseFloat(parts[6]) || 0,
                    hasArt: parts[7] === "true"
                });
            }
        });
    }, 1000);
}

app.whenReady().then(() => {
    if (process.platform === 'darwin') {
        app.dock.hide();
    }
    createWindow();
    startMusicTicker();
});

ipcMain.on('resize-window', (event, width, height) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const primaryDisplay = screen.getPrimaryDisplay();
    const screenWidth = primaryDisplay.bounds.width;
    const x = Math.floor((screenWidth - width) / 2);
    
    mainWindow.setBounds({ x: x, y: 0, width: width, height: height });

    if (width > 180) {
        mainWindow.setIgnoreMouseEvents(false);
    } else {
        mainWindow.setIgnoreMouseEvents(true, { forward: true });
    }
});

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setIgnoreMouseEvents(ignore, options);
});

ipcMain.on('open-apple-music', () => { exec('open -a "Music"'); });

ipcMain.on('music-control', (event, action) => {
    let cmd = '';
    if (action === 'playpause') cmd = 'playpause';
    if (action === 'next') cmd = 'next track';
    if (action === 'prev') cmd = 'previous track';
    if (cmd) exec(`osascript -e 'tell application "Music" to ${cmd}'`);
});

ipcMain.on('music-control', (event, action) => {
    let cmd = '';
    if (action === 'playpause') cmd = 'playpause';
    if (action === 'next') cmd = 'next track';
    if (action === 'prev') cmd = 'previous track';
    if (cmd) exec(`osascript -e 'tell application "Music" to ${cmd}'`);
});

ipcMain.on('music-seek', (event, seekTime) => {
    exec(`osascript -e 'tell application "Music" to set player position to ${seekTime}'`);
});