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
        });
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
    console.log('new width:', this.x(this.node.x1 - this.node.x0));
    console.log('new height:', this.y(this.node.y1 - this.node.y0));

    // let id = this.node.data.id.replace(/:/g, '\\:');
    d3.selectAll('.cell')
        .filter(d => d.data.id !== this.node.data.id)
        .remove();
    let selectedCell = d3.selectAll('.cell')
        .filter(d => d.data.id === this.node.data.id);
    selectedCell.transition()
        .duration(500)
        .attr('transform', 'translate(0, 0)')
      .select('rect').transition()
        .duration(500)
        .attr('width', (this.x(this.node.x1 - this.node.x0)) + 'px')
        .attr('height', (this.y(this.node.y1 - this.node.y0)) + 'px');
    selectedCell.transition()
        .duration(300)
        .delay(1000)
        .style('opacity', 0)
        .remove();

    this.update();
};

Treemap.prototype.update = function () {

    if (this.node.parent) {
        this.grandparent
            .datum(this.node.parent);
            //.on('click', d => this.unzoom(d));
    }

    let cellData = this.treemapContent.selectAll('.cell')
        .data(descendantsNoRoot(this.node), d => d.data.id);
    cellData
        .transition()
            .duration(300)
            .attr('transform', d => 'translate(' + this.x(d.x0) + ',' + this.y(d.y0) + ')');

    this.cellEnter = cellData.enter().append('g')
        .classed('cell', true)
        .attr('id', d => d.data.id)
        .attr('transform', d => 'translate(' + this.x(d.x0) + ',' + this.y(d.y0) + ')');

    this.cellEnter.append('rect')
        .attr('width', d => this.x(d.x1 - d.x0) + 'px')
        .attr('height', d => this.y(d.y1 - d.y0) + 'px')
        .attr('fill', d => {
            if (d.depth === 1 && d.data) {
                return this.color(d.data.id);
            } else if (d.depth > 1 && d.parent) {
                return this.color(d.parent.data.id);
            } else {
                return this.color(d.data.id);
            }
        })
        .attr('stroke', d => {
            if (d._children) {
                return 'magenta';
            } else {
                return 'white';
            }
        })
        .style('opacity', d => {
            if (d.children) {
                return '0.2';
            } else {
                return '1';
            }
        })
        .on('click', d => {
            if (d.children) {
                this.lastNode = this.node;
                this.node = d;
                this.zoom();
            } else {
                console.log('clicked:', d);
            }
        });

    this.cellEnter.append('svg:text')
        .attr('x', d => this.x((d.x1 - d.x0) / 2) + 'px')
        .attr('y', d => this.y((d.y1 - d.y0) / 2) + 'px')
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
