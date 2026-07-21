const { app, BrowserWindow, ipcMain, screen, Tray, Menu } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

let mainWindow;
let tray;
const coverPath = '/tmp/notch_cover.png';
let lastSignature = '';

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

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width } = primaryDisplay.bounds;
    const windowWidth = mainWindow.getBounds().width;
    const x = Math.floor((width - windowWidth) / 2);
    
    mainWindow.setPosition(x, 0);
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
}

function createTray() {
    let iconPath = path.join(__dirname, 'build', 'icon.png');
    if (!fs.existsSync(iconPath)) {
        iconPath = path.join(__dirname, 'icon.png');
    }

    if (!fs.existsSync(iconPath)) return;

    try {
        tray = new Tray(iconPath);
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Blackhole Notch v1.0', enabled: false },
            { type: 'separator' },
            { 
                label: 'Launch at Login', 
                type: 'checkbox', 
                checked: app.getLoginItemSettings().openAtLogin,
                click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked })
            },
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
        tell application "System Events"
            set processList to (name of every process)
        end tell
        
        set activeApp to ""
        if processList contains "Music" then
            tell application "Music"
                try
                    if player state is playing or player state is paused then set activeApp to "Music"
                end try
            end tell
        end if
        
        if activeApp is "" and processList contains "Spotify" then
            tell application "Spotify"
                try
                    if player state is playing or player state is paused then set activeApp to "Spotify"
                end try
            end tell
        end if

        if activeApp is "Music" then
            tell application "Music"
                set playerState to player state
                set trackName to name of current track
                set trackArtist to artist of current track
                set trackBPM to bpm of current track
                set trackGenre to genre of current track
                set curPos to player position
                set totalDur to duration of current track
                
                set hasArt to "false"
                if ${fetchArt} is true then
                    try
                        if (count of artworks of current track) > 0 then
                            set hasArt to "true"
                            set artData to raw data of artwork 1 of current track
                            set filePath to posix path of "${coverPath}"
                            do shell script "rm -f " & quoted form of filePath
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
                end if
                
                set stateStr to "PLAYING"
                if playerState is paused then set stateStr to "PAUSED"
                return trackName & "|||" & trackArtist & "|||" & stateStr & "|||" & trackBPM & "|||" & trackGenre & "|||" & curPos & "|||" & totalDur & "|||" & hasArt & "|||Music"
            end tell
        else if activeApp is "Spotify" then
            tell application "Spotify"
                set playerState to player state
                set trackName to name of current track
                set trackArtist to artist of current track
                set trackBPM to 0
                set trackGenre to "Unknown"
                set curPos to player position
                set totalDur to (duration of current track) / 1000
                
                set hasArt to "false"
                if ${fetchArt} is true then
                    try
                        set artworkUrl to artwork url of current track
                        if artworkUrl is not "" then
                            set hasArt to "true"
                            set filePath to posix path of "${coverPath}"
                            do shell script "curl -s -o " & quoted form of filePath & " " & quoted form of artworkUrl
                        end if
                    end try
                end if
                
                set stateStr to "PLAYING"
                if playerState is paused then set stateStr to "PAUSED"
                return trackName & "|||" & trackArtist & "|||" & stateStr & "|||" & trackBPM & "|||" & trackGenre & "|||" & curPos & "|||" & totalDur & "|||" & hasArt & "|||Spotify"
            end tell
        else
            return "NOT_RUNNING"
        end if
    `;

    setInterval(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;

        exec(`osascript -e '${getAppleScript(false)}'`, (err, stdout) => {
            if (err || !stdout) return;
            const response = stdout.trim();
            
            if (response === "NOT_RUNNING" || response === "NOT_PLAYING" || response === "") {
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
                        }, 50);
                    });
                }

                mainWindow.webContents.send('music-update', {
                    playing: true,
                    title: title,
                    artist: artist,
                    status: parts[2] || 'PAUSED',
                    bpm: parseInt(parts[3]) || 0,
                    genre: parts[4] || 'Unknown',
                    position: parseFloat(parts[5]) || 0,
                    duration: parseFloat(parts[6]) || 0,
                    player: player
                });
            }
        });
    }, 1000);
}

app.whenReady().then(() => {
    app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: false
    });

    if (process.platform === 'darwin') {
        app.dock.hide();
    }
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