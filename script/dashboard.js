const $ = require('jquery');
const d3 = require('d3');
const {dialog} = require('electron').remote;
const remote = require('electron').remote;
const main = remote.require('./main');
const globals = require('./globals');
const CollapsibleTree = require('./CollapsibleTree');

$(document).ready(() => {
    $('body').fadeIn('slow');

    let svgWidth = 400, svgHeight = 400;
    let svg = d3.select('#sidebar').append('svg')
        .attr('width', svgWidth)
        .attr('height', svgHeight);
    let ctree = new CollapsibleTree(svg, svgWidth, svgHeight);
    d3.json('test.json', (err, json) => {
        if (err) console.error(err);
        ctree.root = json;
        ctree.update();
    });
});
