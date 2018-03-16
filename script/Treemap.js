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
        .tile(d3.treemapSquarify)
        .round(false)
        .padding(1)
        .paddingTop(10);
        // .paddingOuter(0);
    this.root = null;
    this.node = null;
    this.lastNode = null;
    this.color = d3.scaleOrdinal().range(d3.schemeCategory20c);
    this.padding = d3.scaleOrdinal().domain([0, 2]);
    this.fillFileInfoFunction = null;
    this.data = null;
    this.path = null;
    this.fileScale = d3.scalePow()
        .exponent(0.5)
        .clamp(true)
        .range([5, 50]);
}

function name(d) {
    return d.parent ? name(d.parent) + ' / ' + d.data.name : '<Root>';
}

function searchNode(root, path) {
    if (root && path) {
        path = path.replace(/\/+$/, '');
        if (path === '.' || root.data.path === path) return root;
        else if (root.children) {
            let names = path.split('/');
            names.forEach(name => {
                let found = null;
                if (root.children) {
                    root.children.forEach(c => {
                        if (c.data.name === name) {
                            found = c;
                        }
                    });
                }
                if (found) {
                    root = found;
                } else {
                    return null;
                }
            });
            return root;
        } else {
            return null;
        }
    } else {
        return null;
    }
}

function maxValue(node) {
    if (node && node.data) {
        if (node.data.isDirectory()) {
            console.assert(node.children != null, '[Treemap#maxValue] Empty directory.');
            let max = 0;
            node.children.forEach(c => {
                max += maxValue(c);
            });
            return max;
        } else if (node.data.statistic) {
            return 1 + node.data.statistic.added + node.data.statistic.deleted + node.data.statistic.modified;
        } else {
            return 1;
        }
    } else {
        return null;
    }
}

function calculateValue(node, scale) {
    if (node && node.data) {
        if (node.children) {
            node.value = 0;
            node.children.forEach(c => calculateValue(c, scale));
        } else if (node.data.statistic) {
            node.value = scale(1 + node.data.statistic.added + node.data.statistic.deleted + node.data.statistic.modified);
        } else {
            node.value = scale(1);
        }
    }
}

Treemap.prototype.stylize = function (d, i) {
    let node = d3.select(this);
    node.classed('cell-dir-added', false);
    node.classed('cell-dir-deleted', false);
    node.classed('cell-dir-modified', false);
    node.classed('cell-dir-moved', false);
    node.classed('cell-dir-unmodified', false);
    node.classed('cell-added', false);
    node.classed('cell-deleted', false);
    node.classed('cell-modified', false);
    node.classed('cell-moved', false);
    node.classed('cell-unmodified', false);
    if (d.data && d.data.status != null) {
        if (d.children) {
            if (d.data.isAdded()) {
                node.classed('cell-dir-added', true);
            } else if (d.data.isDeleted()) {
                node.classed('cell-dir-deleted', true);
            } else if (d.data.isModified()) {
                node.classed('cell-dir-modified', true);
            } else if (d.data.isMoved()) {
                node.classed('cell-dir-moved', true);
            } else {
                node.classed('cell-dir-unmodified', true);
            }
        } else {
            if (d.data.isAdded()) {
                node.classed('cell-added', true);
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
    }
};

Treemap.prototype.opacity = function (d) {
    let op = 1;
    if (d.data != null && d.data.isUnmodified != null && d.data.isUnmodified()) {
        op = 0.3;
    }
    return op;
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
    this.lastNode = null;
    this.x.domain([0, this.width]);
    this.y.domain([0, this.height]);

    this.root = d3.hierarchy(this.data, d => d.entries);
    let max = maxValue(this.root);
    console.log('max:', max);
    this.fileScale.domain([0, max]);
    calculateValue(this.root, this.fileScale);
    this.root.sum(d => {
            // if (d.children) {
            //     return 0;
            // } else if (d.statistic) {
            //     return this.fileScale(1 + d.statistic.added + d.statistic.deleted + d.statistic.modified);
            // } else {
            //     return this.fileScale(1);
            // }
            return d.children ? 0 : 1;
        })
        .sort((a, b) => {
            if (a.statistic && b.statistic) {
                let as = a.statistic.added + a.statistic.deleted + a.statistic.modified;
                let bs = b.statistic.added + b.statistic.deleted + b.statistic.modified;
                return bs - as;
            } else if (a.statistic) {
                return -1;
            } else if (b.statistic) {
                return 1;
            } else {
                return 0;
            }
        });

    this.treemap(this.root);
    this.node = this.root;
    // Restore previous visualization selected folder
    if (this.path != null) {
        this.revealNodes();
    } else {
        this.update();
    }
};

Treemap.prototype.revealNodes = function () {
    if (this.path != null) {
        this.node = searchNode(this.root, this.path);
        console.log('searchNode:', this.node);
        this.zoom();
    }
};

Treemap.prototype.zoom = function () {

    console.log('clicked: ' + this.node.data.name + ', depth:' + this.node.depth);

    if (this.node.children == null) { // If node is leaf, select parent node.
        this.node = this.node.parent;
    }

    this.x.domain([this.node.x0, this.node.x1]);
    this.y.domain([this.node.y0, this.node.y1]);

    console.log("new x: "+ this.x(this.node.x0) + "~" + this.x(this.node.x1) );
    console.log("new y: "+ this.y(this.node.y0) + "~" + this.y(this.node.y1) );

    let selectedCell = d3.selectAll('.cell')
        .filter(d => {
            if (d && d.data && this.node && this.node.data) {
                return d.data.id === this.node.data.id;
            } else {
                return false;
            }
        });

    if (selectedCell.size() > 0) {
        setTimeout(this.update.bind(this), 800);
    } else {
        setTimeout(this.update.bind(this), 300);
    }
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
        .data(this.node.descendants(), d => d.data.id);

    // Enter
    this.cellEnter = cellData.enter().append('g')
        .classed('cell', true)
        .attr('id', d => d.data.id)
        .attr('transform', d => 'translate(' + this.x(d.x0) + ',' + this.y(d.y0) + ')')
        .each(this.stylize)
        .style('opacity', this.opacity);

    this.cellEnter.append('rect')
        .attr('width', d => (this.x(d.x1) - this.x(d.x0)) + 'px')
        .attr('height', d => (this.y(d.y1) - this.y(d.y0)) + 'px')
        .on('click', newNode => {
            if (newNode.children) {
                this.node = newNode;
                this.treemapContent.selectAll('.cell')
                    .filter(d => {
                        console.log('d:', d);
                        console.log('this.node:', this.node);
                        if (d && d.data && this.node && this.node.data) {
                            return d.data.id !== this.node.data.id;
                        } else {
                            return true;
                        }
                    })
                    .transition()
                        .duration(300)
                        .style('opacity', 0)
                        .remove();
                let selectedCell = this.treemapContent.selectAll('.cell')
                    .filter(d1 => {
                        if (d1 && d1.data && this.node && this.node.data) {
                            return d1.data.id === this.node.data.id;
                        } else {
                            return false;
                        }
                    });
                selectedCell.transition()
                    .duration(500)
                    .attr('transform', 'translate(0, 0)');
                selectedCell.select('text').transition()
                    .duration(500)
                    .attr('x', d => (this.width / 2) + 'px')
                    .attr('y', d => (this.height / 2) + 'px');
                selectedCell.select('rect').transition()
                    .duration(500)
                    .attr('width', this.width + 'px')
                    .attr('height', this.height + 'px');
                selectedCell.transition()
                    .duration(300)
                    .delay(500)
                    .style('opacity', 0)
                    .remove();
                this.zoom();
            } else {
                console.log('clicked:', newNode);
                if (this.fillFileInfoFunction != null) {
                    this.fillFileInfoFunction(newNode.data);
                }
            }
        });

    this.cellEnter.append('svg:text')
        .attr('x', d => Math.max(0, this.x(d.x1) - this.x(d.x0)) / 2 + 'px')
        //.attr('y', d => Math.max(0, this.y(d.y1) - this.y(d.y0)) / 2 + 'px')
        .attr('y', 10)
        .attr('text-anchor', 'middle')
        .style('opacity', d => (d.children ? 1 : 0))
        .text(d => d.data.name);

    // Update
    cellData.transition()
        .duration(500)
        .attr('transform', d => 'translate(' + this.x(d.x0) + ',' + this.y(d.y0) + ')')
        .each(this.stylize)
        .style('opacity', this.opacity);
    cellData.select('rect').transition()
        .duration(500)
        .attr('width', d => (this.x(d.x1) - this.x(d.x0)) + 'px')
        .attr('height', d => (this.y(d.y1) - this.y(d.y0)) + 'px');
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

    // Update current path
    if (this.node.data) {
        if (this.node.data.path === '.') {
            this.path = null;
        } else {
            this.path = this.node.data.path;
        }
    }
};

module.exports = Treemap;
