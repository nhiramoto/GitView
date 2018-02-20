const d3 = require('d3');
const fs = require('fs');
const JSONDatabase = require('./GitPipe/JSONDatabase');

function Treemap(container, width, height) {
    this.container = container;
    this.margin = { top: 10, right: 10, bottom: 10, left: 10 };
    this.treemapLegendHeight = 30;
    this.width = width - this.margin.left - this.margin.right;
    this.height = height - this.margin.top - this.margin.bottom;
    this.view = this.container.append('svg')
        .attr('viewBox', '0 0 ' + this.width + ' ' + this.height)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('width', '100%')
        .style('height', '100%')
        .classed('treemap-view', true)
      .append('g')
        .attr('transform', 'translate(' + this.margin.left + ',' + this.margin.top + ')');
    this.treemap = d3.treemap().size([this.width, this.height]);
    this.root = null;
    this.tree = null;
    this.node = null;
    this.color = d3.scaleOrdinal().range(d3.schemeCategory20c);
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
    this.root = d3.hierarchy(data, d => d.entries)
        .sum(d => {
            if (d.isDirectory()) {
                return 0;
            } else {
                if (d.statistic == null) {
                    return 5;
                } else {
                    return 5 + d.statistic.added + d.statistic.deleted + d.statistic.modified;
                }
            }
            //if (d.depth === 3) {
            //    return 5 + d.statistic.added + d.statistic.deleted + d.statistic.modified;
            //} else {
            //    return 0;
            //}
        });
    this.node = this.root;
    this.tree = this.treemap(this.root);
    this.update();
};

Treemap.prototype.update = function () {
    this.cell = this.view.selectAll('.cell')
        .data(this.tree.leaves())
      .enter().append('g')
        .classed('cell', true)
        .attr('transform', d => 'translate(' + d.x0 + ',' + d.y0 + ')');

    this.cell.append('rect')
        .attr('id', d => d.data.id)
        .attr('width', d => Math.max(0, d.x1 - d.x0 - 1) + 'px')
        .attr('height', d => Math.max(0, d.y1 - d.y0 - 1) + 'px')
        .attr('fill', d => this.color(d.parent.data.id));

    this.cell.append('svg:text')
        .attr('x', d => (d.x1 - d.x0) / 2)
        .attr('y', d => (d.y1 - d.y0) / 2)
        .attr('text-anchor', 'middle')
        .text(d => d.data.name);
};

module.exports = Treemap;
