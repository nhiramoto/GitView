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
    this.treemap = d3.treemap()
        .size([this.width, this.height])
        //.tile(d3.treemapResquarify)
        .round(true);
    this.root = null;
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
        .eachBefore(d => {
            if (d.depth === this.foldLevel && d.children) {
                d._children = d.children;
                d.children = null;
            }
        })
        .eachAfter(d => {
            if (d.children == null && d._children) {
                d._value = d.value;
                d.value = null;
            }
        })
        .sum(d => {
            if (d.statistic) {
                return 5 + d.statistic.added + d.statistic.deleted + d.statistic.modified;
            } else {
                return 5;
            }
        });
    this.update(this.root);
};

Treemap.prototype.zoom = function (node) {
    console.log('zooming...:', node);
    let newFoldLevel = node.depth + this.foldLevel;
    function foldNodes(root, level) {
        if (root.children) {
            if (root.depth === level - 1) {
                root._children = root.children;
                root.children = null;
                if (root.value) {
                    root._value = root.value;
                    root.value = null;
                }
            } else {
                root.children.forEach(c => {
                    foldNodes(c, level);
                });
            }
        }
    }

    if (node.children == null && node._children) {
        node.children = node._children;
        node._children = null;
        if (node.value == null && node._value) {
            node.value = node._value;
            node._value = null;
        }

        foldNodes(node, newFoldLevel);

        this.update(node);
    }
};

Treemap.prototype.update = function (node) {
    /**
     * Return de all internal or leaf nodes with maxlevel from the tree.
     */
    //function levelNodes (treeRoot, level) {
    //    if (treeRoot.depth <= level) {
    //        if (treeRoot.depth == level) {
    //            return [treeRoot];
    //        } else if (treeRoot.depth === level - 1) {
    //            if (treeRoot.children) {
    //                return treeRoot.children;
    //            } else {
    //                return [treeRoot];
    //            }
    //        } else {
    //            if (treeRoot.children) {
    //                let nodes = [];
    //                treeRoot.children.forEach(c => {
    //                    let res = levelNodes(c, level);
    //                    if (res.length > 0) {
    //                        nodes.concat(res);
    //                    }
    //                });
    //                return nodes;
    //            } else {
    //                return [treeRoot];
    //            }
    //        }
    //    } else {
    //        return [];
    //    }
    //}

    let tree = this.treemap(node);
    console.log('tree:', tree);

    this.cell = this.treemapContent.selectAll('.cell')
        .data(tree.leaves(), d => d.data.id)
      .enter().append('g')
        .classed('cell', true)
        .attr('id', d => d.data.id)
        .attr('transform', d => 'translate(' + d.x0 + ',' + d.y0 + ')');

    this.cell.append('rect')
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
        .on('click', e => {
            let id = e.data.id.replace(':', '\\:');
            let selectedCell = d3.select('#' + id).transition(2000)
                .attr('transform', 'translate(0, 0)');
            selectedCell.select('rect').transition(2000)
                    .attr('width', this.width + 'px')
                    .attr('height', this.height + 'px');
            //this.zoom(d);
        });

    this.cell.append('svg:text')
        .attr('x', d => (d.x1 - d.x0) / 2)
        .attr('y', d => (d.y1 - d.y0) / 2)
        .attr('text-anchor', 'middle')
        .text(d => d.data.name);

    this.treemapLegend.select('rect')
        .text(node.data.path);
        //.style('fill', this.color(0));
    console.log('path:', this.root.path(node));
};

module.exports = Treemap;
