const $ = require('jquery');
const d3 = require('d3');
const remote = require('electron').remote;
const main = remote.require('./main');
const globals = require('./globals');
const Tree = require('./Tree');
const ipc = require('electron').ipcRenderer;

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

    ipc.on('repoPath', repoPath => {
        console.log('repoPath:', repoPath);
    });

    let svgWidth = 500, svgHeight = 500;
    let container = d3.select('#view');
    let tree = new Tree(container, svgWidth, svgHeight);
    tree.load('data/test/testNHubDiff.json');
});
