const { app, BrowserWindow, screen } = require('electron');

let mainWindow

function createNotchWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width } = primaryDisplay.bounds;

    const notchWidth = 270;
    const notchHeight = 38;

    mainWindow = new BrowserWindow({
        width: notchWidth,
        height: notchHeight,
        x: Math.floor((width - notchWidth) / 2),
        y: 0,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        focusable: false,
        enableLargerThanScreen: true,
        type: 'panel',
        hiddenInMissionControl: true,
        titleBarStyle: 'customButtonsOnHover'
    });

    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    mainWindow.loadURL('data:text/html,<html><body style="background:black; margin:0;"></body></html>');
}

app.whenReady().then(createNotchWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});