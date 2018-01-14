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
var pulseInfoButton = () => {};

$(document).ready(() => {
    $('body').fadeIn('slow');

    pulseInfoButton = function () {
        // Pulse when info bar is hidden
        if (!$('#infoBar').hasClass('visible')) {
            $('#infoButton').addClass('pulsing');
            setTimeout(() => {
                $('#infoButton').removeClass('pulsing');
            }, 1000);
        }
    };
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

    let isInfoBarHide = $('#infoBar').hasClass('visible');
    $('#infoButton').click(event => {
        if (isInfoBarHide) {
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
        isInfoBarHide = !isInfoBarHide;
    });

    let isRepoInfoHide = $('#repoInfoBody').hasClass('visible');
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

    let isCommitInfoHide = $('#commitInfoBody').hasClass('visible');
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

    let isFileInfoHide = $('#fileInfoBody').hasClass('visible');
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

    initLegend();

    let isLegendHide = $('#legend').hasClass('visible');
    $('#legendButton').click(event => {
        if (isLegendHide) {
            $('#legend').addClass('visible');
        } else {
            $('#legend').removeClass('visible');
        }
        isLegendHide = !isLegendHide;
    });
    $('#legendCloseBtn').click(event => {
        isLegendHide = true;
        $('#legend').removeClass('visible');
    });

    ipcRenderer.on('getRepoPath-reply', (event, args) => {
        repoPath = args;
        console.log('repoPath:', repoPath);
        gitPipe = new GitPipe();
        initViz(repoPath);
    });
    ipcRenderer.send('getRepoPath');

});

var showLoadingScreen = function() {
    $('#commitBar').removeClass('disabled');
    $('#commitBar').addClass('disabled');
    $('#loadingScreen').fadeIn();
};

var hideLoadingScreen = function () {
    $('#loadingScreen').fadeOut(1000);
    setTimeout(() => {
        $('#commitBar').removeClass('disabled');
    }, 1000);
};

var fillFileInfo = function (data) {
    if (data != null) {
        if (data.isFile()) {
            $('#fileInfoTitle .infoTitle').text('Arquivo');
            $('#fileIsBinary').closest('tr').css('display', '');
            $('#fileIsBinary').text(data.isBinary ? 'Sim': 'Não');
            if (data.statistic != null) {
                $('.statisticRow').css('display', '');
                $('#fileStAdded').text(data.statistic.added);
                $('#fileStDeleted').text(data.statistic.deleted);
                $('#fileStModified').text(data.statistic.modified);
            } else {
                $('.statisticRow').css('display', 'none');
            }
        } else if (data.isSubmodule()) {
            $('#fileInfoTitle .infoTitle').text('Submódulo');
            $('#fileIsBinary').closest('tr').css('display', 'none');
            $('.statisticRow').css('display', 'none');
        }
        $('#fileId').text(data.id);
        $('#fileName').text(data.getName());
        $('#filePath').text(data.getPath());
        $('#oldFileId').text(data.oldId);
        let fileStatus = null;
        $('.statisticRow').removeClass('disabled');
        if (data.isAdded()) {
            fileStatus = 'Adicionado';
        } else if (data.isDeleted()) {
            fileStatus = 'Deletado';
        } else if (data.isMoved()) {
            fileStatus = 'Movido';
        } else if (data.isUnmodified()) {
            fileStatus = 'Não Modificado';
            $('.statisticRow').addClass('disabled');
        } else {
            fileStatus = 'Modificado';
        }
        $('#fileStatus').text(fileStatus);
        pulseInfoButton();
    }
};

var initViz = function (repoPath) {
    showLoadingScreen();
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

                pulseInfoButton();

                return gitPipe.getHeadDiffTree();
            } else {
                console.error('Database not saved.');
                return new Promise(resolve => resolve(null));
            }
        }).then(diffDir => {
            console.log('-> last diff tree got!');
            console.log('-> diffDir:', diffDir);
            container = d3.select('#view');
            tree = new Tree(container);
            tree.fillFileInfoFunction = fillFileInfo;
            tree.build(diffDir);
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
        }).then(() => {
            hideLoadingScreen();
        }).catch(err => {
            if (err) console.error(err);
        });
    }
};

var diffCommit = function (commitId) {
    let selected = null;
    showLoadingScreen();
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

                    pulseInfoButton();
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
            if (selected) {
                console.log('Selected commit diff tree got!');
                console.log('diffDir:', diffDir);
                tree.build(diffDir);
            }
        }).then(() => {
            hideLoadingScreen();
        }).catch(err => {
            if (err) console.error(err);
        });
    }
};

var initLegend = function () {
    console.log('initializing legend...');
    console.log('d3 selection:', d3.select('#legendBody'));
    let lsvg = d3.select('#legendBody').append('svg')
            .attr('width', '400px')
            .attr('height', '372px')
        .append('g')
            .classed('legend-elem', true);
    console.log('lsvg:', lsvg);
    let nodeRoot = lsvg.append('g')
        .classed('node', true)
        .classed('node-root', true)
        .style('transform', 'translate(30px, 30px)');
    nodeRoot.append('circle')
        .attr('r', '8px');
    nodeRoot.append('text')
        .classed('legend-node-label', true)
        .text('Raíz do projeto')
        .attr('dx', '15px')
        .attr('dy', '5px');
    let nodeRootCollapsed = lsvg.append('g')
        .classed('node', true)
        .classed('node-rootCollapsed', true)
        .style('transform', 'translate(30px, 60px)');
    nodeRootCollapsed.append('circle')
        .attr('r', '8px');
    nodeRootCollapsed.append('text')
        .classed('legend-node-label', true)
        .text('Raíz do projeto recolhido')
        .attr('dx', '15px')
        .attr('dy', '5px');
    let nodeInner= lsvg.append('g')
        .classed('node', true)
        .classed('node-inner', true)
        .style('transform', 'translate(30px, 90px)');
    nodeInner.append('circle')
        .attr('r', '8px');
    nodeInner.append('text')
        .classed('legend-node-label', true)
        .text('Diretório')
        .attr('dx', '15px')
        .attr('dy', '5px');
    let nodeCollapsed = lsvg.append('g')
        .classed('node', true)
        .classed('node-collapsed', true)
        .style('transform', 'translate(30px, 120px)');
    nodeCollapsed.append('circle')
        .attr('r', '8px');
    nodeCollapsed.append('text')
        .classed('legend-node-label', true)
        .text('Diretório recolhido')
        .attr('dx', '15px')
        .attr('dy', '5px');
    let nodeAdded = lsvg.append('g')
        .classed('node', true)
        .classed('node-added', true)
        .style('transform', 'translate(30px, 150px)');
    nodeAdded.append('circle')
        .attr('r', '8px');
    nodeAdded.append('text')
        .classed('legend-node-label', true)
        .text('Arquivo adicionado')
        .attr('dx', '15px')
        .attr('dy', '5px');
    let nodeDeleted = lsvg.append('g')
        .classed('node', true)
        .classed('node-deleted', true)
        .style('transform', 'translate(30px, 180px)');
    nodeDeleted.append('circle')
        .attr('r', '8px');
    nodeDeleted.append('text')
        .classed('legend-node-label', true)
        .text('Arquivo deletado')
        .attr('dx', '15px')
        .attr('dy', '5px');
    let nodeMoved = lsvg.append('g')
         .classed('node', true)
         .classed('node-moved', true)
         .style('transform', 'translate(30px, 210px)');
     nodeMoved.append('circle')
         .attr('r', '8px');
     nodeMoved.append('text')
         .classed('legend-node-label', true)
         .text('Arquivo movido')
         .attr('dx', '15px')
         .attr('dy', '5px');
    let nodeModified = lsvg.append('g')
        .classed('node', true)
        .classed('node-modified', true)
        .style('transform', 'translate(30px, 240px)');
    nodeModified.append('circle')
        .attr('r', '8px');
    nodeModified.append('text')
        .classed('legend-node-label', true)
        .text('Arquivo modificado')
        .attr('dx', '15px')
        .attr('dy', '5px');
    let nodeUnmodified = lsvg.append('g')
        .classed('node', true)
        .classed('node-unmodified', true)
        .style('transform', 'translate(30px, 270px)');
    nodeUnmodified.append('circle')
        .style('opacity', '0.3')
        .attr('r', '8px');
    nodeUnmodified.append('text')
        .classed('legend-node-label', true)
        .text('Arquivo não modificado')
        .attr('dx', '15px')
        .attr('dy', '5px');
};
