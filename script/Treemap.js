const d3 = require('d3');
const fs = require('fs');
//const JSONDatabase = require('./GitPipe/JSONDatabase');

function Treemap(container, width, height) {
    this.container = container;
    this.margin = { top: 10, right: 10, bottom: 10, left: 10 };
    this.treemapLegendHeight = 20;
    this.width = width - this.margin.left - this.margin.right;
    this.height = height - 2 * this.margin.top - this.margin.bottom - this.treemapLegendHeight;
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

    this.root = d3.hierarchy(this.data, d => d.entries);
        // .eachBefore(d => {
        //     if (d.depth === 1 && d.children) {
        //         d._children = d.children;
        //         d.children = null;
        //     }
        // })
    fold(this.root, 1);
    this.root.sum(d => {
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
    console.log('zooming...:', this.node);
    let newFoldLevel = this.node.depth + this.foldLevel;

    if (this.node.children == null && this.node._children) {
        this.node.children = this.node._children;
        this.node._children = null;
    }

    fold(this.node, newFoldLevel);
    this.node
        .sum(d => {
            if (d.statistic && !d.isUnmodified()) {
                return 5 + d.statistic.added + d.statistic.deleted + d.statistic.modified;
            } else {
                return 1;
            }
        });
    this.treemap(this.node);
    this.update();
};

Treemap.prototype.update = function () {

    if (this.node.parent) {
        this.grandparent
            .datum(this.node.parent);
            //.on('click', d => this.unzoom(d));
    }

    let cellData = this.treemapContent.selectAll('.cell')
        .data(this.node.children, d => d.data.id);
    cellData
        .transition()
            .duration(300)
            .attr('transform', d => 'translate(' + d.x0 + ',' + d.y0 + ')');

    let cell = cellData.enter().append('g')
        .classed('cell', true)
        .attr('id', d => d.data.id)
        .attr('transform', d => 'translate(' + d.x0 + ',' + d.y0 + ')');

    cell.append('rect')
        .attr('width', d => Math.max(0, d.x1 - d.x0 - 1) + 'px')
        .attr('height', d => Math.max(0, d.y1 - d.y0 - 1) + 'px')
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
                console.log('id:', d.data.id);
                let id = d.data.id.replace(/\:/g, '\\:');
                d3.selectAll('.cell')
                    .filter(d => d.data.id !== id)
                    .remove();
                let selectedCell = d3.select('#' + id);
                selectedCell.transition()
                    .duration(500)
                    .attr('transform', 'translate(0, 0)')
                  .select('rect').transition()
                    .duration(500)
                    .attr('width', this.width + 'px')
                    .attr('height', this.height + 'px');
                selectedCell.transition()
                    .duration(300)
                    .delay(1000)
                    .style('opacity', 0)
                    .remove();
                this.lastNode = this.node;
                this.node = d;
                this.zoom();
            } else {
                console.log('clicked:', d);
            }
        });

    cell.append('svg:text')
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
