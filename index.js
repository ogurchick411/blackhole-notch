const { app, BrowserWindow, ipcMain, screen, Tray, Menu } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

let mainWindow;
let tray;
const coverPath = '/tmp/notch_cover.png';
let lastSignature = '';

function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width } = primaryDisplay.bounds;

    mainWindow = new BrowserWindow({
        width: 180,
        height: 32,
        x: Math.floor((width - 180) / 2),
        y: 0,
        transparent: true,
        frame: false,
        resizable: false,
        hasShadow: false,
        alwaysOnTop: true,
        type: 'panel',
        show: true,
        enableLargerThanScreen: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    mainWindow.loadFile('index.html');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    mainWindow.setIgnoreMouseEvents(false);
}

function createTray() {
    let iconPath = path.join(__dirname, 'build', 'icon.png');
    if (!fs.existsSync(iconPath)) iconPath = path.join(__dirname, 'icon.png');
    if (!fs.existsSync(iconPath)) return;

    try {
        tray = new Tray(iconPath);
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Blackhole Notch v1.0', enabled: false },
            { type: 'separator' },
            { label: 'Reload Widget', click: () => { if (mainWindow) mainWindow.reload(); } },
            { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
        ]);
        tray.setToolTip('Blackhole Notch');
        tray.setContextMenu(contextMenu);
    } catch (e) {}
}

function startMusicTicker() {
    const getAppleScript = (fetchArt) => `
        tell application "System Events" to set procList to (name of every process)

        -- 1. Apple Music
        if procList contains "Music" then
            try
                tell application "Music"
                    if player state is playing or player state is paused then
                        set tName to name of current track
                        set tArtist to artist of current track
                        set curPos to player position
                        set totalDur to duration of current track
                        set pState to "PLAYING"
                        if player state is paused then set pState to "PAUSED"
                        
                        set hasArt to "false"
                        if ${fetchArt} is true then
                            try
                                if (count of artworks of current track) > 0 then
                                    set artData to raw data of artwork 1 of current track
                                    set filePath to posix path of "${coverPath}"
                                    do shell script "rm -f " & quoted form of filePath
                                    set fileRef to open for access filePath with write permission
                                    set eof fileRef to 0
                                    write artData to fileRef
                                    close access fileRef
                                    set hasArt to "true"
                                end if
                            end try
                        end if
                        
                        return tName & "|||" & tArtist & "|||" & pState & "|||0|||Music|||" & curPos & "|||" & totalDur & "|||" & hasArt & "|||Music"
                    end if
                end tell
            end try
        end if

        -- 2. Spotify
        if procList contains "Spotify" then
            try
                tell application "Spotify"
                    if player state is playing or player state is paused then
                        set tName to name of current track
                        set tArtist to artist of current track
                        set curPos to player position
                        set totalDur to (duration of current track) / 1000
                        set pState to "PLAYING"
                        if player state is paused then set pState to "PAUSED"
                        
                        set hasArt to "false"
                        if ${fetchArt} is true then
                            try
                                set artworkUrl to artwork url of current track
                                if artworkUrl is not "" then
                                    set filePath to posix path of "${coverPath}"
                                    do shell script "curl -s -o " & quoted form of filePath & " " & quoted form of artworkUrl
                                    set hasArt to "true"
                                end if
                            end try
                        end if
                        
                        return tName & "|||" & tArtist & "|||" & pState & "|||0|||Spotify|||" & curPos & "|||" & totalDur & "|||" & hasArt & "|||Spotify"
                    end if
                end tell
            end try
        end if

        return "NOT_RUNNING"
    `;

    setInterval(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;

        exec(`osascript -e '${getAppleScript(false)}'`, (err, stdout) => {
            if (err || !stdout) return;
            const response = stdout.trim();
            
            if (response === "NOT_RUNNING" || response === "" || response.includes("error")) {
                mainWindow.webContents.send('music-update', { playing: false, status: 'STOPPED' });
                lastSignature = '';
            } else {
                const parts = response.split('|||');
                const title = parts[0] || 'Unknown Track';
                const artist = parts[1] || 'Unknown Artist';
                const player = parts[8] || 'Music';

                const currentSignature = `${title}-${artist}-${player}`;

                if (currentSignature !== lastSignature) {
                    lastSignature = currentSignature;
                    mainWindow.webContents.send('music-track-changing');
                    
                    exec(`osascript -e '${getAppleScript(true)}'`, () => {
                        setTimeout(() => {
                            if (!mainWindow || mainWindow.isDestroyed()) return;
                            mainWindow.webContents.send('music-art-ready');
                        }, 80);
                    });
                }

                mainWindow.webContents.send('music-update', {
                    playing: true,
                    title: title,
                    artist: artist,
                    status: parts[2] || 'PLAYING',
                    bpm: 0,
                    genre: 'Music',
                    position: parseFloat(parts[5]) || 0,
                    duration: parseFloat(parts[6]) || 100,
                    player: player
                });
            }
        });
    }, 1000);
}

app.whenReady().then(() => {
    if (process.platform === 'darwin') app.dock.hide();
    createWindow();
    createTray();
    startMusicTicker();
});

ipcMain.on('resize-window', (event, width, height) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const primaryDisplay = screen.getPrimaryDisplay();
    const screenWidth = primaryDisplay.bounds.width;
    const x = Math.floor((screenWidth - width) / 2);
    
    mainWindow.setBounds({ x: x, y: 0, width: width, height: height });
});

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setIgnoreMouseEvents(ignore, options);
});

// Открывает то приложение, которое сейчас играет
ipcMain.on('open-apple-music', () => {
    const script = `
        tell application "System Events" to set processList to (name of every process)
        if processList contains "Spotify" then
            tell application "Spotify" to activate
        else if processList contains "Music" then
            tell application "Music" to activate
        end if
    `;
    exec(`osascript -e '${script}'`);
});

ipcMain.on('music-control', (event, action) => {
    let cmd = '';
    if (action === 'playpause') cmd = 'playpause';
    if (action === 'next') cmd = 'next track';
    if (action === 'prev') cmd = 'previous track';
    
    if (cmd) {
        const script = `
            tell application "System Events" to set processList to (name of every process)
            if processList contains "Spotify" then
                tell application "Spotify" to ${cmd}
            else if processList contains "Music" then
                tell application "Music" to ${cmd}
            end if
        `;
        exec(`osascript -e '${script}'`);
    }
});

ipcMain.on('music-seek', (event, seekTime) => {
    const script = `
        tell application "System Events" to set processList to (name of every process)
        if processList contains "Spotify" then
            tell application "Spotify" to set player position to ${seekTime}
        else if processList contains "Music" then
            tell application "Music" to set player position to ${seekTime}
        end if
    `;
    exec(`osascript -e '${script}'`);
});