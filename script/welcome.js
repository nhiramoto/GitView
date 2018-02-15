const $ = require('jquery');
const {remote, ipcRenderer} = require('electron');
const {dialog} = require('electron').remote;
const url = require('url');
const fs = require('fs');
const globals = require('./globals');
const main = remote.require('./main');

// Expressão Regular para caminho válido no Windows ou Linux
var regex = new RegExp('(^(/[^/\000\n]*)+/?$)|(^[a-zA-Z]:(\\\\[^<>:"/\\\\\|\?\*\n]+)+\\\\?$)');

$(document).ready(() => {
    $('input').on('invalid', (event) => {
        $(event.target).addClass('invalidInput');
    });
    $('input').on('change', (event) => {
        $(event.target).removeClass('invalidInput');
    });
    $('#repoPath').keyup((event) => {
        let path = $('#repoPath').val();
        if (regex.test(path)) {
            $('#repoPath').removeClass('invalidInput');
        } else {
            $('#repoPath').addClass('invalidInput');
        }
    });
    $('#openRepo').click((event) => {
        let paths = dialog.showOpenDialog({properties: ['openDirectory']});
        if (paths != null && paths.length >= 1) {
            let path = paths[0];
//        var repoUrl = url.format({
//            pathname: paths[0],
//            protocol: 'file:',
//            slashes: true
//        });
            $('#repoPath').val(path);
            if (regex.test(path)) {
                $('#repoPath').removeClass('invalidInput');
            } else {
                $('#repoPath').addClass('invalidInput');
            }
        }
    });
    $('#openRepositoryForm').submit((event) => {
        event.preventDefault();
        var repoPath = $('#repoPath').val();
        console.log('repoPath:', repoPath);
        if (repoPath != null && repoPath.length == 0) {
            console.error('Empty path!!!');
            globals.showError('Error', 'Please, specify the repository path.');
        } else if (!regex.test(repoPath)) {
            $('#repoPath').addClass('invalidInput');
            console.log('Invalid path!!!')
            globals.showError('Error', 'Invalid path.');
        } else {
            let gitpath = repoPath + '/.git';
            console.log('gitpath:', gitpath);
            fs.stat(gitpath, (err, stats) => {
                if (err || !stats.isDirectory()) {
                    console.log('stat:', stats)
                    console.error('Folder is not a git repository.');
                    globals.showError('Error', 'The specified path is not a git repository.')
                } else {
                    console.log('Opening repository...');
                    globals.showMessage('Open repository', 'Opening repository: ' + repoPath);
                    ipcRenderer.send('setRepoPath', repoPath);
                    $('.background').fadeOut('slow', () => {
                        main.loadDashboard();
                    });
                }
            });
        }
    });
});
