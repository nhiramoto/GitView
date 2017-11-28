const $ = require('jquery');
const d3 = require('d3');
const remote = require('electron').remote;
const main = remote.require('./main');
const globals = require('./globals');
const Tree = require('./Tree');

$(document).ready(() => {
    $('body').fadeIn('slow');

    let svgWidth = 500, svgHeight = 500;
    let container = d3.select('#view');
    let tree = new Tree(container, svgWidth, svgHeight);
    tree.load('data/testNHubDiff.json');
});
