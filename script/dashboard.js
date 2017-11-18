const $ = require('jquery');
const d3 = require('d3');
const {dialog} = require('electron').remote;
const remote = require('electron').remote;
const main = remote.require('./main');
const globals = require('./globals');
// const CollapsibleTree = require('./CollapsibleTree');
const Graph = require('./Graph.js');
const fs = require('fs');

$(document).ready(() => {
    $('body').fadeIn('slow');

    let svgWidth = 500, svgHeight = 500;
    let container = d3.select('#view');
    let graph = new Graph(container, svgWidth, svgHeight);
    graph.load('script/test.json');
});
