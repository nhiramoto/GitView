const $ = require('jquery');
const {remote, ipcRenderer} = require('electron');
const {dialog} = require('electron').remote;
const url = require('url');
const fs = require('fs');
const globals = require('./globals');
const main = remote.require('./main');

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
                $('#repoPath').addClass('invalidInput');
            } else {
                $('#repoPath').removeClass('invalidInput');
            }
        }
    });
    $('#openRepositoryForm').submit((event) => {
        event.preventDefault();
        var repoPath = $('#repoPath').val();
        console.log('repoPath:', repoPath);
        if (repoPath != null && repoPath.length == 0) {
            console.log('Empty path!!!');
            globals.showMessage('Erro', 'Especifique o local do repositório.');
        } else if (!regex.test(repoPath)) {
            $('#repoPath').addClass('invalidInput');
            console.log('Invalid path!!!')
            globals.showMessage('Erro', 'O caminho especificado não é um caminho válido.');
        } else {
            let gitpath = repoPath + '/.git';
            console.log('gitpath:', gitpath);
            fs.stat(gitpath, (err, stats) => {
                if (err || !stats.isDirectory()) {
                    console.log('stat:', stats)
                    console.error('Error: Folder is not a git repository.');
                    globals.showMessage('Erro', 'O diretório especificado não é um repositório git.')
                } else {
                    console.log('Opening repository...');
                    globals.showMessage('Abrir Repositório', 'Abrindo repositório: ' + repoPath);
                    ipcRenderer.send('setRepoPath', repoPath);
                    setTimeout(() => {
                        $('.background').fadeOut('slow', () => {
                            main.loadDashboard();
                        });
                    }, 2000);
                }
            });
        }
    });
});
