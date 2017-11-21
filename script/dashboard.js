const $ = require('jquery');
const d3 = require('d3');
const fs = require('fs');
const {dialog} = require('electron').remote;
const remote = require('electron').remote;
const main = remote.require('./main');
const globals = require('./globals');
const Graph = require('./Graph');
const Tree = require('./Tree');

$(document).ready(() => {
    $('body').fadeIn('slow');

    let svgWidth = 500, svgHeight = 500;
    let container = d3.select('#view');
    let tree = new Tree(container, svgWidth, svgHeight);
    tree.load('script/datatree.json');
});
