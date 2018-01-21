const {app, BrowserWindow, ipcMain} = require('electron');
const path = require('path');
const url = require('url');

var mainWindow = null;
var repoPath = null;

var initWindow = function () {
    mainWindow = new BrowserWindow({
        backgroundColor: '#fff',
        width: 800,
        minWidth: 20,
        height: 600,
        minHeight: 20,
        titleBarStyle: 'customButtonsOnHover',
        show: false
    });
    //mainWindow.webContents.openDevTools();
    mainWindow.on('ready-to-show', () => {
        mainWindow.show();
    });
};

var loadHtmlFile = function (filepath, params) {
    if (mainWindow != null) {
        mainWindow.loadURL(url.format({
            pathname: path.join(__dirname, filepath),
            protocol: 'file:',
            slashes: true
        }));
    } else {
        console.error('Error: mainWindow not set.');
    }
};

var loadWelcome = function (params) {
    loadHtmlFile('html/welcome.html', params)
};

var loadDashboard = function (params) {
    loadHtmlFile('html/dashboard.html', params);
};

ipcMain.on('setRepoPath', (event, arg) => {
    repoPath = arg;
});

ipcMain.on('getRepoPath', (event, arg) => {
    event.sender.send('getRepoPath-reply', repoPath);
});

app.on('ready', () => {
    initWindow();
    // loadHtmlFile('html/welcome.html');
    loadWelcome();
    // Testing dashboard
    //loadDashboard();
});

app.on('window-all-closed', () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

exports.loadHtmlFile = loadHtmlFile;
exports.loadWelcome = loadWelcome;
exports.loadDashboard = loadDashboard;
