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
var headCommit = null;

var fillFileInfo = function (fileData) {
    if (fileData != null) {
        $('#fileId').text(fileData.id);
        $('#fileName').text(fileData.name);
        $('#filePath').text(fileData.path);
        if (fileData.statistic != null) {
            $('#fileStAdded').text(fileData.statistic.added);
            $('#fileStDeleted').text(fileData.statistic.deleted);
            $('#fileStModified').text(fileData.statistic.modified);
        }
        $('#oldFileId').text(fileData.oldFileId);
        $('#fileIsBinary').text(fileData.isBinary ? 'Sim': 'Não');
        let fileStatus = null;
        $('.statisticRow').removeClass('disabled');
        if (fileData.isAdded()) {
            fileStatus = 'Adicionado';
        } else if (fileData.isDeleted()) {
            fileStatus = 'Deletado';
        } else if (fileData.isModified()) {
            fileStatus = 'Modificado';
        } else if (fileData.isUnmodified()) {
            fileStatus = 'Não Modificado';
            $('.statisticRow').addClass('disabled');
        } else {
            console.assert(fileData.isMoved(), '[dashboard#fileNodeClickHandler] Invalid file status.');
            fileStatus = 'Movido';
        }
        $('#fileStatus').text(fileStatus);
    }
};

var initViz = function (repoPath) {
    if (gitPipe != null) {
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
                headCommit = gitPipe.db.findCommit(headCommitId);
                let headCommitDate = headCommit.date;
                let formattedDate = dateFormat(headCommitDate, 'dd/mm/yyyy hh:MM TT');
                $('#repoInfoName').text(repoName);
                $('#repoPath').text(repoPath);
                $('#lastCommit').text(formattedDate);
                $('#commitCount').text(commitCount);

                let commitId = headCommit.id;
                let commitMsg = headCommit.message;
                let author = gitPipe.findAuthor(headCommit.authorEmail);
                let commitAuthor = author.name + ' <' + author.email + '>';
                let commitDate = dateFormat(headCommit.date, 'dd/mm/yyyy hh:MM TT');
                let commitSnapshotId = headCommit.snapshotId;
                let commitParents = '';
                headCommit.parents.forEach(parentId => {
                    commitParents += parentId + ',';
                });
                commitParents = commitParents.slice(0, -2);
                $('#commitId').text(commitId);
                $('#commitMessage').text(commitMsg);
                $('#commitAuthor').text(commitAuthor);
                $('#commitDate').text(commitDate);
                $('#commitSnapshotId').text(commitSnapshotId);
                $('#commitParents').text(commitParents);

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
                tree.fillFileInfoFunction = fillFileInfo;
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
                let commitId = commit.id;
                let commitMsg = null;
                if (commit.message.length >= 23) {
                    commitMsg = commit.message.substring(0, 23) + '...';
                } else {
                    commitMsg = commit.message;
                }
                $(title).addClass('title').text(commitMsg);
                $(content).addClass('content').text(commit.authorEmail);
                $(commitItem).addClass('commitItem').attr('id', commitId).append(title).append(content);
                $(commitItem).click(event => {
                    $('#commitBar .selected').removeClass('selected');
                    $(commitItem).addClass('selected');
                    let commitId = $(commitItem).attr('id');
                    console.log('commitId:', commitId);
                    diffCommit(commitId);
                });
                $('#commitBar').append(commitItem);
            });
            $('#commitBar #' + headCommit.id).addClass('selected');
        }).catch(err => {
            if (err) console.error(err);
        });
    }
};

var diffCommit = function (commitId) {
    let selected = null;
    if (gitPipe != null) {
        return gitPipe.selectCommit(commitId).then(res => {
            selected = res;
            console.log('selected:', selected);
            return gitPipe.getSelectedCommit();
        }).then(selectedCommit => {
            if (selected) {
                console.log('selectedCommit:', selectedCommit);
                if (selectedCommit != null) {
                    let commitId = selectedCommit.id;
                    let commitMsg = selectedCommit.message;
                    let author = gitPipe.findAuthor(selectedCommit.authorEmail);
                    let commitAuthor = author.name + ' <' + author.email + '>';
                    let commitDate = dateFormat(selectedCommit.date, 'dd/mm/yyyy hh:MM TT');
                    let commitSnapshotId = selectedCommit.snapshotId;
                    let commitParents = '';
                    selectedCommit.parents.forEach(parentId => {
                        commitParents += parentId + ',';
                    });
                    commitParents = commitParents.slice(0, -2);
                    $('#commitId').text(commitId);
                    $('#commitMessage').text(commitMsg);
                    $('#commitAuthor').text(commitAuthor);
                    $('#commitDate').text(commitDate);
                    $('#commitSnapshotId').text(commitSnapshotId);
                    $('#commitParents').text(commitParents);
                } else {
                    Promise.reject('selectedCommit is null.');
                }
            }
        }).then(() => {
            if (selected) {
                console.log('selected commit recovered.');
                return gitPipe.registerSelectedCommitDiff();
            }
        }).then(() => {
            if (selected) {
                console.log('Selected commit diff registered.');
                return gitPipe.parseDiffs();
            }
        }).then(() => {
            if (selected) {
                console.log('Diffs parsed!');
                return gitPipe.save();
            }
        }).then(saved => {
            if (selected) {
                if (saved) {
                    console.log('Database saved.');
                } else {
                    console.error('Database not saved.');
                }
                return gitPipe.getSelectedCommitDiffTree();
            }
        }).then(diffDir => {
            console.log('Selected commit diff tree got!');
            console.log('diffDir:', diffDir);
            tree.build(diffDir);
        }).catch(err => {
            if (err) console.error(err);
        });
    }
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

    let isRepoInfoHide = false;
    $('#repoInfoTitle').click(event => {
        if (isRepoInfoHide) {
            $('#repoInfoBody').addClass('visible');
            $('#repoInfoBody').slideDown();
            $('#repoInfoArrow .fa')
                .removeClass('fa-chevron-up')
                .addClass('fa-chevron-down');
        } else {
            $('#repoInfoBody').removeClass('visible');
            $('#repoInfoBody').slideUp();
            $('#repoInfoArrow .fa')
                .removeClass('fa-chevron-down')
                .addClass('fa-chevron-up');
        }
        isRepoInfoHide = !isRepoInfoHide;
    });

    let isCommitInfoHide = false;
    $('#commitInfoTitle').click(event => {
        if (isCommitInfoHide) {
            $('#commitInfoBody').addClass('visible');
            $('#commitInfoBody').slideDown();
            $('#commitInfoArrow .fa')
                .removeClass('fa-chevron-up')
                .addClass('fa-chevron-down');
        } else {
            $('#commitInfoBody').removeClass('visible');
            $('#commitInfoBody').slideUp();
            $('#commitInfoArrow .fa')
                .removeClass('fa-chevron-down')
                .addClass('fa-chevron-up');
        }
        isCommitInfoHide = !isCommitInfoHide;
    });

    let isFileInfoHide = false;
    $('#fileInfoTitle').click(event => {
        if (isFileInfoHide) {
            $('#fileInfoBody').addClass('visible');
            $('#fileInfoBody').slideDown();
            $('#fileInfoArrow .fa')
                .removeClass('fa-chevron-up')
                .addClass('fa-chevron-down');
        } else {
            $('#fileInfoBody').removeClass('visible');
            $('#fileInfoBody').slideUp();
            $('#fileInfoArrow .fa')
                .removeClass('fa-chevron-down')
                .addClass('fa-chevron-up');
        }
        isFileInfoHide = !isFileInfoHide;
    });

    ipcRenderer.on('getRepoPath-reply', (event, args) => {
        repoPath = args;
        console.log('repoPath:', repoPath);
        gitPipe = new GitPipe();
        initViz(repoPath);
    });
    ipcRenderer.send('getRepoPath');

});
