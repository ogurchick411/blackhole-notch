const { app, BrowserWindow, screen } = require('electron');

let mainWindow

function createNotchWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width } = primaryDisplay.bounds;

    const notchWidth = 500;
    const notchHeight = 120;

    mainWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        x: Math.floor((width - windowWidth) / 2),
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
    mainWindow.setIgnoreMouseEvents(true, { forward: true });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(createNotchWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});