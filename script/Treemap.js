const d3 = require('d3');
const fs = require('fs');
//const JSONDatabase = require('./GitPipe/JSONDatabase');

function Treemap(container, width, height) {
    this.container = container;
    this.margin = { top: 10, right: 10, bottom: 10, left: 10 };
    this.treemapLegendHeight = 20;
    this.width = width - this.margin.left - this.margin.right;
    this.height = height - 2 * this.margin.top - this.margin.bottom - this.treemapLegendHeight;
    this.x = d3.scaleLinear().domain([0, this.width]).range([0, 100]);
    this.y = d3.scaleLinear().domain([0, this.height]).range([0, 100]);
    this.svg = this.container.append('svg')
        .attr('id', 'treemapSvg')
        .classed('treemap-svg', true)
        .attr('viewBox', '0 0 ' + width + ' ' + height)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('width', '100%')
        .style('height', '100%');
    this.grandparent = this.svg.append('g')
        .classed('grandparent', true);
    this.grandparent
      .append('rect')
        .attr('x', this.margin.left)
        .attr('y', this.margin.top)
        .attr('width', this.width)
        .attr('height', this.treemapLegendHeight)
        .attr('fill', '#9ECAFF');
    this.grandparent
      .append('svg:text')
        .attr('x', (this.margin.left + 10) + 'px')
        .attr('y', (this.margin.top + this.treemapLegendHeight - 5) + 'px')
        .attr('font-size', '11px')
        .text('Treemap Legend');
    this.treemapContent = this.svg.append('g')
        .classed('treemap-content', true)
        .attr('width', this.width + 'px')
        .attr('height', this.height + 'px')
        .attr('transform', 'translate(' + this.margin.left + ',' + (2 * this.margin.top + this.treemapLegendHeight + ')'));
    this.treemap = d3.treemap()
        .size([this.width, this.height]);
        //.tile(d3.treemapResquarify)
        //.round(true)
    this.root = null;
    this.node = null;
    this.lastNode = null;
    this.color = d3.scaleOrdinal().range(d3.schemeCategory20c);
    this.fillFileInfoFunction = null;
    this.foldLevel = 2;
    this.data = null;
}

function name(d) {
    return d.parent ? name(d.parent) + ' / ' + d.name : '<Root>';
}

function fold(root, level) {
    if (root.children && root.depth <= level) {
        if (root.depth === level) {
            root._children = root.children;
            root.children = null;
        } else {
            root.children.forEach(c => {
                fold(c, level);
            });
        }
    }
}

Treemap.prototype.layout = function (d) {
    if (d.children) {
        this.treemap.nodes({children: d.children});
        d.children.forEach(c => {
            c.x = d.x + c.x * d.dx;
            c.y = d.y + c.y * d.dy;
            c.dx *= d.dx;
            c.dy *= d.dy;
            c.parent = d;
            this.layout(c);
        });
    }
};

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
    this.data = data || [];

    this.root = d3.hierarchy(this.data, d => d.entries)
        .sum(d => {
            if (d.statistic && !d.isUnmodified()) {
                return 5 + d.statistic.added + d.statistic.deleted + d.statistic.modified;
            } else {
                return 1;
            }
            //if (d.depth === this.foldLevel) {
            //    if (d.statistic) {
            //        return 5 + d.statistic.added + d.statistic.deleted + d.statistic.modified;
            //    } else {
            //        return 5;
            //    }
            //} else {
            //    return 0;
            //}
        });
    this.node = this.root;
    this.treemap(this.node);
    this.update();
};

Treemap.prototype.zoom = function () {
    console.log('clicked: ' + this.node.data.name + ', depth:' + this.node.depth);

    let id = this.node.data.id.replace(/\:/g, '\\:');
    d3.selectAll('.cell')
        .filter(d => d.data.id !== id)
        .remove();
    let selectedCell = d3.select('#' + id);
    selectedCell.transition()
        .duration(500)
        .attr('transform', 'translate(0, 0)')
      .select('rect').transition()
        .duration(500)
        .attr('width', '100%')
        .attr('height', '100%');
    selectedCell.transition()
        .duration(300)
        .delay(1000)
        .style('opacity', 0)
        .remove();

    this.x.domain([d.x0, d.x1]);
    this.y.domain([d.y0, d.y1]);

	console.log("new x: "+ this.x(d.x0) + "-" + this.x(d.x1) );
	console.log("new y: "+ this.y(d.y0) + "-" + this.y(d.y1) );

    this.cellEnter.transition()
        .duration(800)
        .style('transform', 'translate(' + this.x(d.x0) + '%,' + this.y(d.y0) + '%)')
        .select('rect')
            .transition()
            .duration(800)
                .attr('width', d => this.x(Math.max(0, d.x1 - d.x0 - 1)) + '%')
                .attr('height', d => this.y(Math.max(0, d.y1 - d.y0 - 1)) + '%');
};

Treemap.prototype.update = function () {

    if (this.node.parent) {
        this.grandparent
            .datum(this.node.parent);
            //.on('click', d => this.unzoom(d));
    }

    let cellData = this.treemapContent.selectAll('.cell')
        .data(this.node.descendants(), d => d.data.id);
    cellData
        .transition()
            .duration(300)
            .attr('transform', d => 'translate(' + this.x(d.x0) + 'vw,' + this.y(d.y0) + 'vh)');

    this.cellEnter = cellData.enter().append('g')
        .classed('cell', true)
        .attr('id', d => d.data.id)
        .attr('transform', d => 'translate(' + this.x(d.x0) + 'vw,' + this.y(d.y0) + 'vh)');

    this.cellEnter.append('rect')
        .attr('width', d => this.x(Math.max(0, d.x1 - d.x0 - 1)) + 'vw')
        .attr('height', d => this.y(Math.max(0, d.y1 - d.y0 - 1)) + 'vh')
        .attr('fill', d => this.color(d.parent.data.id))
        .attr('stroke', d => {
            if (d._children) {
                return 'magenta';
            } else {
                return 'white';
            }
        })
        .style('opacity', d => {
            if (d.data != null && d.data.isUnmodified()) {
                return '0.3';
            } else {
                return '1';
            }
        })
        .on('click', d => {
            if (d._children) {
                this.lastNode = this.node;
                this.node = d;
                this.zoom();
            } else {
                console.log('clicked:', d);
            }
        });

    this.cellEnter.append('svg:text')
        .attr('x', d => (d.x1 - d.x0) / 2)
        .attr('y', d => (d.y1 - d.y0) / 2)
        .attr('text-anchor', 'middle')
        .text(d => d.data.name);

    cellData.exit().transition()
        .duration(500)
        .style('opacity', 0)
        .remove();

    this.grandparent.select('text')
        .text(name(this.node));
        //.style('fill', this.color(0));
};

module.exports = Treemap;
