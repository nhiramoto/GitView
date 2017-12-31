const $ = require('jquery');
const d3 = require('d3');
const {remote, ipcRenderer} = require('electron');
const main = remote.require('./main');
const globals = require('./globals');
const GitPipe = require('./GitPipe/GitPipe');
const Tree = require('./Tree');
const dateFormat = require('dateformat');

var repoPath = null;
var svgWidth = 800, svgHeight = 600;
var container = null;
var tree = null;
var gitPipe = null;
var dbPath = null;
var repoRec = null;
var commits = null;

var initViz = function (repoPath) {
    if (gitPipe == null) {
        gitPipe = new GitPipe();
    }
    return gitPipe.openRepository(repoPath).then(_dbPath => {
        dbPath = _dbPath;
        console.log('-> repository opened:', repoPath);
        repoRec = gitPipe.db.getRepository();
        $('#repoName').text(repoRec.name);
        return gitPipe.parseCommitsHistory();
    }).then(() => {
        console.log('-> commits parsed.');
        return gitPipe.registerHeadCommitDiff();
    }).then(() => {
        console.log('-> Head commit diff registered.');
        return gitPipe.parseDiffs();
    }).then(() => {
        console.log('-> diffs parsed.');
        return gitPipe.save();
    }).then(saved => {
        console.log('-> database saved=', saved);
        if (saved) {
            let repoName = repoRec.name;
            let repoPath = repoRec.path;
            let commitCount = repoRec.commitCount;
            let headCommitId = repoRec.head;
            let headCommit = gitPipe.db.findCommit(headCommitId);
            let headCommitDate = headCommit.date;
            let formattedDate = dateFormat(headCommitDate, 'dd/mm/yyyy hh:MM TT');
            $('#repoName').text(repoName);
            $('#repoPath').text(repoPath);
            $('#lastCommit').text(formattedDate);
            $('#commitCount').text(commitCount);
            return gitPipe.getHeadDiffTree();
        } else {
            console.error('Database not saved.');
            return new Promise(resolve => resolve(null));
        }
    }).then(diffDir => {
        if (diffDir) {
            console.log('-> last diff tree got!');
            console.log('-> diffDir:', diffDir);
            container = d3.select('#view');
            tree = new Tree(container);
            tree.build(diffDir);
        } else {
            console.error('diffDir is null.');
        }
    }).then(() => {
        // Limpa lista de commits
        $('#commitBar').children('.commitItem').remove();
        // Adiciona lista de commits na commitBar
        commits = gitPipe.getCommits();
        commits.forEach(commit => {
            let commitItem = document.createElement('div');
            let title = document.createElement('span');
            let content = document.createElement('span');
            let commitId = commit.id.substring(0, 8);
            let commitMsg = null;
            if (commit.message.length >= 23) {
                commitMsg = commit.message.substring(0, 23) + '...';
            } else {
                commitMsg = commit.message;
            }
            $(title).addClass('title').text(commitMsg);
            $(content).addClass('content').text(commit.authorEmail);
            $(commitItem).addClass('commitItem').append(title).append(content);
            $('#commitBar').append(commitItem);
        });
    }).catch(err => {
        if (err) console.error('[dashboard.js] ', err);
    });
};

$(document).ready(() => {
    $('body').fadeIn('slow');
    let optionActive = false;
    $('#optionButton').click(event => {
        if (optionActive) {
            $('#optionButton').removeClass('active');
            $('#options').removeClass('active');
        } else {
            $('#optionButton').addClass('active');
            $('#options').addClass('active');
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

    let isInfoPaneHide = false;
    $('#infoButton').click(event => {
        if (isInfoPaneHide) {
            $('#infoBar').addClass('visible');
            $('#infoButton .fa')
                .removeClass('fa-plus-square-o')
                .addClass('fa-minus-square-o');
        } else {
            $('#infoBar').removeClass('visible');
            $('#infoButton .fa')
                .removeClass('fa-minus-square-o')
                .addClass('fa-plus-square-o');
        }
        isInfoPaneHide = !isInfoPaneHide;
    });

    ipcRenderer.on('getRepoPath-reply', (event, args) => {
        repoPath = args;
        console.log('repoPath:', repoPath);
        gitPipe = new GitPipe();
        initViz(repoPath);
    });
    ipcRenderer.send('getRepoPath');

});
