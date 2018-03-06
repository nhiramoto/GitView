const d3 = require('d3');
const fs = require('fs');
//const JSONDatabase = require('./GitPipe/JSONDatabase');

function Treemap(container, width, height) {
    this.container = container;
    this.margin = { top: 10, right: 10, bottom: 10, left: 10 };
    this.treemapLegendHeight = 20;
    this.width = width - this.margin.left - this.margin.right;
    this.height = height - 2 * this.margin.top - this.margin.bottom - this.treemapLegendHeight;
    this.x = d3.scaleLinear().domain([0, this.width]).range([0, this.width]);
    this.y = d3.scaleLinear().domain([0, this.height]).range([0, this.height]);
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
        .size([this.width, this.height])
        // .tile(d3.treemapResquarify);
        // .round(false)
        // .paddingOuter(0);
    this.root = null;
    this.node = null;
    this.lastNode = null;
    this.color = d3.scaleOrdinal().range(d3.schemeCategory20c);
    this.padding = d3.scaleOrdinal().domain([0, 2]);
    this.fillFileInfoFunction = null;
    this.data = null;
}

function name(d) {
    return d.parent ? name(d.parent) + ' / ' + d.data.name : '<Root>';
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

function descendantsNoRoot(node) {
    let id = node.data.id;
    let ind = null;
    let d = node.descendants().slice(0);
    for (ind = 0; ind < d.length; ind++) {
        if (d[ind].data.id === id) break;
    }
    if (ind < d.length) d.splice(ind, 1);
    return d;
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
    this.data = data || [];
    this.lastNode = null;
    this.x.domain([0, this.width]);
    this.y.domain([0, this.height]);

    this.root = d3.hierarchy(this.data, d => d.entries);
    this.root
        .sum(d => {
            if (d.statistic && !d.isUnmodified()) {
                return (5 + d.statistic.added + d.statistic.deleted + d.statistic.modified);
            } else {
                return 1;
            }
        });
    // this.padding.domain([0, this.root.height]);
    // this.treemap.paddingInner(d => this.padding(d.depth));
    console.log('this.root:', this.root);
    this.node = this.root;
    this.treemap(this.node);
    this.update();
};

Treemap.prototype.zoom = function () {

    console.log('clicked: ' + this.node.data.name + ', depth:' + this.node.depth);

    this.x.domain([this.node.x0, this.node.x1]);
    this.y.domain([this.node.y0, this.node.y1]);

	console.log("new x: "+ this.x(this.node.x0) + "~" + this.x(this.node.x1) );
	console.log("new y: "+ this.y(this.node.y0) + "~" + this.y(this.node.y1) );

    d3.selectAll('.cell')
        .filter(d => d.data.id !== this.node.data.id)
        .transition()
            .duration(300)
            .style('opacity', 0)
            .remove();
    let selectedCell = d3.selectAll('.cell')
        .filter(d => d.data.id === this.node.data.id);
    selectedCell.transition()
        .duration(500)
        .attr('transform', 'translate(0, 0)')
    selectedCell.select('text').transition()
        .duration(500)
        .attr('x', d => Math.max(0, this.x(this.node.x1) - this.x(this.node.x0)) / 2 + 'px')
        .attr('y', d => Math.max(0, this.y(this.node.y1) - this.y(this.node.y0)) / 2 + 'px');
    selectedCell.select('rect').transition()
        .duration(500)
        .attr('width', Math.max(0, this.x(this.node.x1) - this.x(this.node.x0)) + 'px')
        .attr('height', Math.max(0, this.y(this.node.y1) - this.y(this.node.y0)) + 'px');
    selectedCell.transition()
        .duration(300)
        .delay(500)
        .style('opacity', 0)
        .remove();
    if (selectedCell.size() > 0) {
        setTimeout(this.update.bind(this), 800);
    } else {
        setTimeout(this.update.bind(this), 300);
    }
};

Treemap.prototype.stylize = function (d, i) {
    let node = d3.select(this);
    node.classed('cell-added', false);
    node.classed('cell-deleted', false);
    node.classed('cell-modified', false);
    node.classed('cell-moved', false);
    node.classed('cell-unmodified', false);
    if (d.data && d.data.status != null) {
        if (d.data.isAdded()) {
            node.classed('cell-added');
        } else if (d.data.isDeleted()) {
            node.classed('cell-deleted', true);
        } else if (d.data.isModified()) {
            node.classed('cell-modified', true);
        } else if (d.data.isMoved()) {
            node.classed('cell-moved', true);
        } else {
            node.classed('cell-unmodified', true);
        }
    }
};

Treemap.prototype.opacity = function (d) {
    let op = 1;
    if (d.data != null && d.data.isUnmodified != null && d.data.isUnmodified()) {
        op = 0.3;
    }
    return op;
};

Treemap.prototype.update = function () {

    if (this.node.parent) {
        console.log('p:', this.node.parent);
        this.grandparent
            .datum(this.node.parent)
            .on('click', d => {
                this.lastNode = this.node;
                this.node = d;
                this.zoom();
            });
    } else {
        this.grandparent
            .datum(null)
            .on('click', null);
    }

    let cellData = this.treemapContent.selectAll('.cell')
        .data(this.node.children, d => d.data.id);

    // Enter
    this.cellEnter = cellData.enter().append('g')
        .classed('cell', true)
        .attr('id', d => d.data.id)
        .attr('transform', d => 'translate(' + this.x(d.x0) + ',' + this.y(d.y0) + ')')
        .each(this.stylize)
        .style('opacity', this.opacity);

    this.cellEnter.append('rect')
        .attr('width', d => Math.max(0, this.x(d.x1) - this.x(d.x0)) + 'px')
        .attr('height', d => Math.max(0, this.y(d.y1) - this.y(d.y0)) + 'px')
        .on('click', d => {
            if (d.children) {
                this.lastNode = this.node;
                this.node = d;
                this.zoom();
            } else {
                console.log('clicked:', d);
                if (this.fillFileInfoFunction != null) {
                    this.fillFileInfoFunction(d.data);
                }
            }
        });

    this.cellEnter.append('svg:text')
        .attr('x', d => Math.max(0, this.x(d.x1) - this.x(d.x0)) / 2 + 'px')
        .attr('y', d => Math.max(0, this.y(d.y1) - this.y(d.y0)) / 2 + 'px')
        .attr('text-anchor', 'middle')
        .text(d => d.data.name);

    // Update
    cellData.transition()
        .duration(500)
        .attr('transform', d => 'translate(' + this.x(d.x0) + ',' + this.y(d.y0) + ')')
        .each(this.stylize)
        .style('opacity', this.opacity);
    cellData.select('rect').transition()
        .duration(500)
        .attr('width', d => Math.max(0, this.x(d.x1) - this.x(d.x0)) + 'px')
        .attr('height', d => Math.max(0, this.y(d.y1) - this.y(d.y0)) + 'px');
    cellData.select('text').transition()
        .duration(500)
            .attr('x', d => Math.max(0, this.x(d.x1) - this.x(d.x0)) / 2 + 'px')
            .attr('y', d => Math.max(0, this.y(d.y1) - this.y(d.y0)) / 2 + 'px');

    // Exit
    cellData.exit().transition()
        .duration(500)
        .style('opacity', 0)
        .remove();

    // Update legend
    this.grandparent.select('text')
        .text(name(this.node));
        //.style('fill', this.color(0));
};

module.exports = Treemap;
