const d3 = require('d3');
const fs = require('fs');
const JSONDatabase = require('./GitPipe/JSONDatabase');

function Treemap(container, width, height) {
    this.width = width;
    this.height = height;
    this.view = container.append('div')
        .style('width', width)
        .style('height', height)
        .style('position', 'relative')
        .classed('svg-content', true);
    this.treemap = d3.layout.treemap().size([width, height]);
    this.nodes = null;
    this.margin = 5;
    this.color = d3.scale.category20c();
}

Treemap.prototype.load = function (dataPath) {
    console.log('loading data from file:', dataPath);
    fs.readFile(dataPath, (err, contentBuffer) => {
        if (err) console.error(err);
        let data = JSON.parse(contentBuffer.toString());
        this.build(data);
    });
};

Treemap.prototype.build = function (data) {
    console.log('building data treemap...');
    data = data || [];
    this.nodes = d3.hierarchy(data, d => d.entries);
    this.update();
};

Treemap.prototype.update = function () {
    this.view.selectAll('.node').data(this.nodes).enter()
        .append('div')
            .style('position', 'absolute')
            .style('left', d => d.x + this.margin * d.depth)
            .style('top', d => d.y + this.margin * d.depth)
            .style('width', d => d.dx - 2 * this.margin * d.depth)
            .style('height', d => d.dy - 2 * this.margin * d.depth)
            .style('background', d => this.color(d.depth))
            .style('border', '1px solid gray')
            .text(d => d.data.name);
};
