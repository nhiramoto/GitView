const $ = require('jquery');
const d3 = require('d3');
const {remote, ipcRenderer} = require('electron');
const main = remote.require('./main');
const globals = require('./globals');
const GitPipe = require('./GitPipe/GitPipe');
const Tree = require('./Tree');

var repoPath = null;
var svgWidth = '100%', svgHeight = 600;
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

    ipcRenderer.on('getRepoPath-reply', (event, args) => {
        repoPath = args;
        console.log('repoPath:', repoPath);
        gitPipe = new GitPipe();
        gitPipe.openRepository(repoPath).then((_dbPath) => {
            dbPath = _dbPath;
            console.log('repository opened:', repoPath);
            console.log('database path:', dbPath);
            return gitPipe.parseCommitsHistory();
        }).then(() => {
            console.log('commits parsed.');
            return gitPipe.diffCommitsHistory();
        }).then(() => {
            console.log('commits diffs created.');
            return gitPipe.parseDiffs();
        }).then(() => {
            console.log('diffs parsed.');
            return gitPipe.save();
        }).then((saved) => {
            console.log('database saved=', saved);
            if (saved) {
                return gitPipe.getLastDiffTree();
            } else {
                return new Promise((resolve, reject) => resolve(null));
            }
        }).then((diffDir) => {
            if (diffDir) {
                console.log('last diff tree recovered!');
                container = d3.select('#view');
                tree = new Tree(container, svgWidth, svgHeight);
                tree.build(diffDir);
            } else {
                console.error('Error: diffDir is null.');
            }
        });
    });
    ipcRenderer.send('getRepoPath');

});
