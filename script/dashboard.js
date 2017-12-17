const $ = require('jquery');
const d3 = require('d3');
const {remote, ipcRenderer} = require('electron');
const main = remote.require('./main');
const globals = require('./globals');
const GitPipe = require('./GitPipe/GitPipe');
const Tree = require('./Tree');

var repoPath = null;
var svgWidth = 600, svgHeight = 600;
var container = null;
var tree = null;
var gitPipe = null;
var dbPath = null;

$(document).ready(() => {
    $('body').fadeIn('slow');
    let optionActive = false;
    $('#optionButton').click(event => {
        if (optionActive) {
            $(event.target).removeClass('active');
            $('.options').removeClass('active');
        } else {
            $(event.target).addClass('active');
            $('.options').addClass('active');
        }
        optionActive = !optionActive;
    });

    $('#openRepo').click(event => {
        globals.input('Abrir Repositório', 'Tem certeza que quer fechar o repositório atual para abrir um novo repositório?')
            .then(res => {
                if (res)
                    $('.background').fadeOut('slow', () => {
                        main.loadWelcome();
                    });
            });
    });

    ipcRenderer.on('getRepoPath-reply', (event, args) => {
        repoPath = args;
        console.log('repoPath:', repoPath);
        gitPipe = new GitPipe();
        gitPipe.openRepository(repoPath).then((_dbPath) => {
            dbPath = _dbPath;
            console.log('repository opened:', repoPath);
            console.log('database path:', dbPath);
            let repoRec = gitPipe.db.getRepository();
            $('#repoName').text(repoRec.name);
            return gitPipe.parseCommitsHistory();
        }).then(() => {
            console.log('commits parsed.');
            console.log('commit count:', gitPipe.db.repository.commitCount);
            //return gitPipe.diffCommitsHistory();
        })
        //.then(() => {
        //    console.log('commits diffs created.');
        //    return gitPipe.parseDiffs();
        //}).then(() => {
        //    console.log('diffs parsed.');
        //    return gitPipe.save();
        //}).then((saved) => {
        //    console.log('database saved=', saved);
        //    if (saved) {
        //        return gitPipe.getLastDiffTree();
        //    } else {
        //        return new Promise((resolve, reject) => resolve(null));
        //    }
        //}).then((diffDir) => {
        //    if (diffDir) {
        //        console.log('last diff tree got!');
        //        console.log('diffDir:', diffDir);
        //        container = d3.select('#view');
        //        tree = new Tree(container, svgWidth, svgHeight);
        //        tree.build(diffDir);
        //    } else {
        //        console.error('Error: diffDir is null.');
        //    }
        //})
        .catch(err => {
            if (err) console.error('[dashboard.js] ', err);
        });
    });
    ipcRenderer.send('getRepoPath');

});
