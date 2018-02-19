const d3 = require('d3');
const fs = require('fs');
const JSONDatabase = require('./GitPipe/JSONDatabase');

function Treemap(container, width, height) {
    this.margin = 5;
    this.width = width - 2 * this.margin;
    this.height = height - 2 * this.margin;
    this.view = container.append('div')
        .style('position', 'relative')
        .style('width', width + 'px')
        .style('height', height + 'px')
        .style('left', this.margin)
        .style('top', this.margin)
        .classed('svg-content', true);
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
    this.tree = this.treemap(this.root);
    this.update();
};

Treemap.prototype.update = function () {
    //this.view.selectAll('.treemap-node').data(this.root).enter()
    //    .append('div')
    //        .style('position', 'absolute')
    //        .style('left', d => d.x + this.margin * d.depth)
    //        .style('top', d => d.y + this.margin * d.depth)
    //        .style('width', d => d.dx - 2 * this.margin * d.depth)
    //        .style('height', d => d.dy - 2 * this.margin * d.depth)
    //        .style('background', d => this.color(d.depth))
    //        .style('border', '1px solid gray')
    //        .text(d => d.data.name);
    this.node = this.view.datum(this.root).selectAll('.treemap-node')
        .data(this.tree.leaves())
      .enter().append('div')
        .classed('treemap-node', true)
        .style('left', d => d.x0 + 'px')
        .style('top', d => d.y0 + 'px')
        .style('width', d => Math.max(0, d.x1 - d.x0 - 1) + 'px')
        .style('height', d => Math.max(0, d.y1 - d.y0 - 1) + 'px')
        .style('background', d => this.color(d.parent.data.name))
        .on('click', d => console.log('clicked:', d))
        .text(d => d.data.name);
};

module.exports = Treemap;
