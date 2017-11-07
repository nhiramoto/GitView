const $ = require('jquery');
const {dialog} = require('electron').remote;
const url = require('url');
const globals = require('./globals');
const remote = require('electron').remote;
const main = remote.require('./main');

$(document).ready(() => {
    $('input').on('invalid', (event) => {
        $(event.target).addClass('invalidInput');
    });
    $('input').on('change', (event) => {
        $(event.target).removeClass('invalidInput');
    });
    $('#openRepo').click((event) => {
        console.log('click!');
        var paths = dialog.showOpenDialog({properties: ['openDirectory']});
        var repoUrl = url.format({
            pathname: paths[0],
            protocol: 'file:',
            slashes: true
        });
        $('#repoPath').val(repoUrl);
    });
    $('#openRepositoryForm').submit((event) => {
        event.preventDefault();
        console.log('click!');
        var repoPath = $('#repoPath').val();
        console.log('repoPath:', repoPath);
        if (repoPath != null && repoPath.length == 0) {
            console.log('Empty path!!!');
            globals.showMessage('Abrir Repositório', 'Especifique o local do repositório.');
        } else {
            console.log('Opening repository...');
            globals.showMessage('Abrir Repositório', 'Abrindo repositório: ' + repoPath);
            setTimeout(() => {
                $('.background').fadeOut('slow', () => {
                    main.loadDashboard();
                });
            }, 2000);
        }
    });
});
