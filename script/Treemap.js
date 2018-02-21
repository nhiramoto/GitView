const d3 = require('d3');
const fs = require('fs');
const JSONDatabase = require('./GitPipe/JSONDatabase');

function Treemap(container, width, height) {
    this.container = container;
    this.margin = { top: 10, right: 10, bottom: 10, left: 10 };
    this.treemapLegendHeight = 20;
    this.width = width - this.margin.left - this.margin.right;
    this.height = height - 2 * this.margin.top - this.margin.bottom - this.treemapLegendHeight;
    this.svg = this.container.append('svg')
        .classed('treemap-svg', true)
        .attr('viewBox', '0 0 ' + width + ' ' + height)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('width', '100%')
        .style('height', '100%');
    this.treemapLegend = this.svg.append('g')
        .classed('treemap-legend', true)
        .attr('transform', 'translate(' + this.margin.left + ',' + this.margin.top + ')');
    this.treemapLegend
      .append('rect')
        .attr('width', this.width + 'px')
        .attr('height', this.treemapLegendHeight + 'px')
        .attr('fill', '#9ECAFF');
    this.treemapLegend
      .append('svg:text')
        .attr('x', '10px')
        .attr('y', (this.treemapLegendHeight - 5) + 'px')
        .attr('text-anchor', 'left-top')
        .text('Treemap Legend');
    this.treemapContent = this.svg.append('g')
        .classed('treemap-content', true)
        .attr('width', this.width + 'px')
        .attr('height', this.height + 'px')
        .attr('transform', 'translate(' + this.margin.left + ',' + (2 * this.margin.top + this.treemapLegendHeight + ')'));
    this.treemap = d3.treemap().size([this.width, this.height]);
    this.root = null;
    this.tree = null;
    this.node = null;
    this.color = d3.scaleOrdinal().range(d3.schemeCategory20c);
    this.fillFileInfoFunction = null;
    this.foldLevel = 2;
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
    this.root.each(d => {
        if (d.depth === this.foldLevel && d.children) {
            d._children = d.children;
        }
    });
    this.node = this.root;
    this.update();
};

Treemap.prototype.update = function () {
    this.tree = this.treemap(this.node);

    this.cell = this.treemapContent.selectAll('.cell')
        .data(this.tree.leaves(), d => d.data.id)
      .enter().append('g')
        .classed('cell', true)
        .attr('transform', d => 'translate(' + d.x0 + ',' + d.y0 + ')');

    this.cell.append('rect')
        .attr('width', d => Math.max(0, d.x1 - d.x0 - 1) + 'px')
        .attr('height', d => Math.max(0, d.y1 - d.y0 - 1) + 'px')
        .attr('fill', d => this.color(d.parent.data.id));

    this.cell.append('svg:text')
        .attr('x', d => (d.x1 - d.x0) / 2)
        .attr('y', d => (d.y1 - d.y0) / 2)
        .attr('text-anchor', 'middle')
        .text(d => d.data.name);

    this.treemapLegend.select('rect')
        .text(this.node.data.path);
        //.style('fill', this.color(0));
    console.log('path:', this.root.path(this.node));
};

module.exports = Treemap;
