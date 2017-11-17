const {app, BrowserWindow} = require('electron');
const path = require('path');
const url = require('url');

let mainWindow = null;

console.log('app:', app);
console.log('BrowserWindow:', BrowserWindow);

var loadHtmlFile = function (filepath) {
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

var loadDashboard = function () {
    loadHtmlFile('html/dashboard.html');
};

var loadWelcome = function () {
    loadHtmlFile('html/welcome.html')
};

app.on('ready', () => {
    mainWindow = new BrowserWindow({
        backgroundColor: '#fff',
        width: 800,
        minWidth: 20,
        height: 600,
        minHeight: 20,
        titleBarStyle: 'customButtonsOnHover',
        show: false
    });
    // loadHtmlFile('html/welcome.html');
    //loadWelcome();
    // Testing dashboard
    loadDashboard();
    // mainWindow.webContents.openDevTools();
    mainWindow.on('ready-to-show', () => {
        mainWindow.show();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

exports.loadHtmlFile = loadHtmlFile;
exports.loadDashboard = loadDashboard;
