const {app, BrowserWindow} = require('electron');
const path = require('path');
const url = require('url');

var mainWindow = null;
global.sharedObject = {};

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
    mainWindow.webContents.openDevTools();
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
exports.loadDashboard = loadDashboard;
