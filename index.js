const { app, BrowserWindow, ipcMain, screen, Tray, Menu, Notification } = require('electron');
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

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    mainWindow.setIgnoreMouseEvents(false);

  //  mainWindow.webContents.openDevTools({ mode: 'detach' });
}

function updateTrayMenu(statusText = 'Ready') {
    if (!tray) return;

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Blackhole Notch v1.0.0', enabled: false },
        { label: `Status: ${statusText}`, enabled: false },
        { type: 'separator' },
        { 
            label: 'Themes', 
            submenu: [
                { label: 'Spotify Green', click: () => mainWindow && mainWindow.webContents.send('change-theme', 'spotify-green') },
                { label: 'Cyber Violet', click: () => mainWindow && mainWindow.webContents.send('change-theme', 'cyber-violet') },
                { label: 'Vampire Blood', click: () => mainWindow && mainWindow.webContents.send('change-theme', 'vampire-blood') },
                { label: 'Monochrome Noir', click: () => mainWindow && mainWindow.webContents.send('change-theme', 'monochrome-noir') },
                { label: 'Aurora Borealis', click: () => mainWindow && mainWindow.webContents.send('change-theme', 'aurora-borealis') }
            ]
        },
        { 
            label: 'Launch at Login', 
            type: 'checkbox', 
            checked: app.getLoginItemSettings().openAtLogin,
            click: (item) => {
                app.setLoginItemSettings({ openAtLogin: item.checked });
            }
        },
        { type: 'separator' },
        { label: 'Reload Widget', click: () => { if (mainWindow) mainWindow.reload(); } },
        { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
    ]);

    tray.setContextMenu(contextMenu);
}

function createTray() {
    try {
        let iconPath = path.join(__dirname, 'icon.png');
        if (!fs.existsSync(iconPath) && process.resourcesPath) {
            iconPath = path.join(process.resourcesPath, 'icon.png');
        }

        if (fs.existsSync(iconPath)) {
            tray = new Tray(iconPath);
            tray.setToolTip('Blackhole Notch - Active');
            updateTrayMenu('Waiting for music...');
        }
    } catch (e) {}
}

function showStartNotification() {
    if (Notification.isSupported()) {
        new Notification({
            title: 'Blackhole Notch',
            body: 'Widget is active under your notch!'
        }).show();
    }
}

function getAppleScript(fetchArt) {
    return `
        if application "Music" is running then
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

        if application "Spotify" is running then
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
}

function startMusicTicker() {
    setInterval(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;

        exec(`osascript -e '${getAppleScript(false)}'`, { timeout: 800, killSignal: 'SIGKILL' }, (err, stdout) => {
            if (err || !stdout) return;
            const response = stdout.trim();
            
            if (response === "NOT_RUNNING" || response === "" || response.includes("error")) {
                mainWindow.webContents.send('music-update', { playing: false, status: 'STOPPED' });
                updateTrayMenu('No music playing');
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
                    updateTrayMenu(`Playing: ${title}`);
                    
                    exec(`osascript -e '${getAppleScript(true)}'`, { timeout: 1000, killSignal: 'SIGKILL' }, () => {
                        setTimeout(() => {
                            if (!mainWindow || mainWindow.isDestroyed()) return;
                            mainWindow.webContents.send('music-art-ready');
                        }, 80);
                    });
                }

                mainWindow.webContents.send('music-update', {
                    playing: parts[2] === 'PLAYING',
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
    showStartNotification();
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

ipcMain.on('open-apple-music', () => {
    const script = `
        if application "Spotify" is running then
            tell application "Spotify" to activate
        else if application "Music" is running then
            tell application "Music" to activate
        end if
    `;
    exec(`osascript -e '${script}'`, { timeout: 800, killSignal: 'SIGKILL' });
});

ipcMain.on('music-control', (event, action) => {
    let cmd = '';
    if (action === 'playpause') cmd = 'playpause';
    if (action === 'next') cmd = 'next track';
    if (action === 'prev') cmd = 'previous track';
    
    if (cmd) {
        const script = `
            if application "Spotify" is running then
                tell application "Spotify" to ${cmd}
            else if application "Music" is running then
                tell application "Music" to ${cmd}
            end if
        `;
        exec(`osascript -e '${script}'`, { timeout: 800, killSignal: 'SIGKILL' });
    }
});

ipcMain.on('music-seek', (event, seekTime) => {
    const script = `
        if application "Spotify" is running then
            tell application "Spotify" to set player position to ${seekTime}
        else if application "Music" is running then
            tell application "Music" to set player position to ${seekTime}
        end if
    `;
    exec(`osascript -e '${script}'`, { timeout: 800, killSignal: 'SIGKILL' });
});