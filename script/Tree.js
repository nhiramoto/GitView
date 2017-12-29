const d3 = require('d3');
const fs = require('fs');
const JSONDatabase = require('./GitPipe/JSONDatabase');

function Tree(container, width, height) {
    this.width = width;
    this.height = height;
    this.nodeRadius = 8;
    this.svg = container.append('svg')
        .attr('width', this.width)
        .attr('height', this.height)
        .attr('class', 'viewSvg')
        .call(d3.zoom().scaleExtent([1 / 2, 8]).on("zoom", () => this.zoomed()))
      .append('g')
        .attr('class', 'viewG');
        //.attr('transform', 'translate(' + this.width / 2 + ',' + this.height / 2 + ')');
    this.linkLayer = this.svg.append('g');
    this.nodeLayer = this.svg.append('g');
    this.simulation = d3.forceSimulation();
    this.links = null;
    this.linkSvg = null;
    this.linkEnter = null;
    this.nodes = null;
    this.nodeSvg = null;
    this.nodeEnter = null;
    this.root = null;

    // Text showing on node label
    this.labelAttribute = 'name';

    // Label show only on hover
    this.nodeHoverLabel = true;

    // Default depth to collapse nodes
    this.defaultDepth = 3;
}

Tree.prototype.zoomed = function () {
    this.svg.attr('transform', d3.event.transform);
};

Tree.prototype.ticked = function () {
    if (this.linkSvg != null) {
        this.linkSvg
            .attr("x1", function(d) { return d.source.x; })
            .attr("y1", function(d) { return d.source.y; })
            .attr("x2", function(d) { return d.target.x; })
            .attr("y2", function(d) { return d.target.y; });
    }
    if (this.nodeSvg != null) {
        this.nodeSvg
            .attr('transform', (d) => 'translate(' + d.x + ', ' + d.y + ')');
    }
};

Tree.prototype.flatten = function (root) {
    let nodes = [], i = 0;
    function recurse(node) {
        if (node.children) {
            node.children.forEach(recurse);
        }
        if (!node.id) node.id = ++i;
        else ++i;
        nodes.push(node);
    }
    recurse(root);
    return nodes;
};

Tree.prototype.moveChildren = function (node) {
    if (node.children) {
        node.children.forEach(c => this.moveChildren(c));
        if (node.depth >= this.defaultDepth) {
            node._children = node.children;
            node.children = null;
        }
    }
};

//================ Event Handlers ================
Tree.prototype.click = function (d) {
    if (d.children) {
        // Fold children
        d._children = d.children;
        d.children = null;
    } else if (d._children) {
        // Unfold children
        d.children = d._children;
        d._children = null;
    } else {
    }
    console.log('d:', d);
    this.update();
    this.simulation.restart();
};

Tree.prototype.dragstarted = function (d) {
    if (!d3.event.active) this.simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
};

Tree.prototype.dragged = function (d) {
    d.fx = d3.event.x;
    d.fy = d3.event.y;
};

Tree.prototype.dragended = function (d) {
    if (!d3.event.active) this.simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
};

Tree.prototype.handleMouseOver = function (d, i) {
    d3.select(this).classed('focused', true);
};

Tree.prototype.handleMouseOut = function (d, i) {
    d3.select(this).classed('focused', false)
};
//================ Event Handlers ================

//=============== Attributes ===============
Tree.prototype.stylize = function (d, i) {
    d3.select(this).classed('node-root', false);
    d3.select(this).classed('node-rootCollapsed', false);
    d3.select(this).classed('node-collapsed', false);
    d3.select(this).classed('node-inner', false);
    d3.select(this).classed('node-added', false);
    d3.select(this).classed('node-deleted', false);
    d3.select(this).classed('node-modified', false);
    d3.select(this).classed('node-unmodified', false);
    if (d.parent == null) { // Root node
        if (d.children != null) {
            d3.select(this).classed('node-root', true).style('fill', '#555');
        } else if (d._children) {
            d3.select(this).classed('node-rootCollapsed', true).style('fill', 'red');
        }
    } else if (d._children != null) { // Collapsed node
        d3.select(this).classed('node-collapsed', true);
    } else if (d.children != null) { // Inner node
        d3.select(this).classed('node-inner', true);
    } else { // Leaf node
        if (d.data.status == JSONDatabase.STATUS.ADDED) {
            d3.select(this).classed('node-added', true);
        } else if (d.data.status == JSONDatabase.STATUS.DELETED) {
            d3.select(this).classed('node-deleted', true);
        } else if (d.data.status == JSONDatabase.STATUS.MODIFIED) {
            d3.select(this).classed('node-modified', true);
        } else {
            d3.select(this).classed('node-unmodified', true);
        }
    }
};

Tree.prototype.opacity = function (d) {
    let stat = d.data.statistic.added + d.data.statistic.deleted + d.data.statistic.modified;
    if (stat === 0) {
        return 0.3;
    } else {
        return 1;
    }
};

Tree.prototype.radius = function (d) {
    // By child count
    //if (d.parent == null) {
    //    return 10;
    //} else if (d.children != null || d._children != null) {
    //    return Math.sqrt(d.data.entries.length) * 5 + 5;
    //} else {
    //    return Math.sqrt(d.data.blocks.length) * 5 + 5;
    //}
    // By Statistic
    let stat = d.data.statistic.added + d.data.statistic.deleted + d.data.statistic.modified;
    return Math.sqrt(stat) + 5;
};

//=============== Attributes ===============

/**
 * Carrega os dados do arquivo.
 * @param {String} dataPath - Caminho para o arquivo de dados.
 */
Tree.prototype.load = function (dataPath) {
    console.log('loading data from file:', dataPath);
    //d3.json(dataPath, (err, data) => {
    fs.readFile(dataPath, (err, contentBuffer) => {
        if (err) console.error('Error:', err);
        let data = JSON.parse(contentBuffer.toString());
        this.build(data);
    });
};

/**
 * Contrói a árvore basedo nos dados.
 * @param data - Dados a serem representados na visualização.
 */
Tree.prototype.build = function (data) {
    console.log('building data tree..');
    this.root = d3.hierarchy(data, d => d.entries);
    this.moveChildren(this.root);
    this.simulation
        .force('link', d3.forceLink().strength(0.8).id(d => d.id))
        .force('charge', d3.forceManyBody().strength(-200).distanceMax(200).distanceMin(10))
        .force('center', d3.forceCenter(this.width / 2, this.height / 2))
        .force('collide', d3.forceCollide().radius((d) => this.radius(d) - 2))
        .on('tick', () => this.ticked());
    this.update();
};

Tree.prototype.update = function () {
    var drag = d3.drag()
        .on('start', (d) => this.dragstarted(d))
        .on('drag', (d) => this.dragged(d))
        .on('end', (d) => this.dragended(d));

    this.nodes = this.flatten(this.root);
    this.links = this.root.links();

    this.simulation
        .nodes(this.nodes);

    this.simulation.force('link')
        .links(this.links);

    this.linkSvg = this.linkLayer.selectAll('.link')
        .data(this.links, (d) => d.target.id);
    this.linkSvg
        .style('stroke-opacity', d => this.opacity(d.target));
    this.linkSvg.exit()
        .transition()
            .duration(100)
            .style('opacity', 0)
            .remove();

    this.linkEnter = this.linkSvg.enter()
        .append('line')
        .attr('class', 'link');
    this.linkEnter
        .style('stroke-opacity', 0)
        .transition()
            .duration(100)
            .style('stroke-opacity', d => this.opacity(d.target));

    this.linkSvg = this.linkEnter.merge(this.linkSvg);

    this.nodeSvg = this.nodeLayer.selectAll('.node')
        .data(this.nodes, d => d.data.id);
    this.nodeSvg
        .each(this.stylize)
        .transition()
            .duration(100)
            .style('opacity', d => this.opacity(d));
    this.nodeSvg.exit()
        .transition()
            .duration(100)
            .style('opacity', 0)
            .remove();

    this.nodeEnter = this.nodeSvg.enter()
        .append('g')
            .attr('class', 'node')
            .on('click', d => this.click(d))
            .on('mouseover', this.handleMouseOver)
            .on('mouseout', this.handleMouseOut)
            .call(drag);
    this.nodeEnter
        .each(this.stylize)
        .style('opacity', 0)
        .transition()
            .duration(100)
            .style('opacity', d => this.opacity(d));
    this.nodeEnter.append('text')
        .attr('class', 'node-label')
        .text(d => d.data.name)
        .attr('dx', d => this.radius(d) + 5)
        .attr('dy', d => this.radius(d) + 5);
    this.nodeEnter.append('circle')
        .attr('r', d => this.radius(d));
    
    this.nodeSvg = this.nodeEnter.merge(this.nodeSvg);
};

module.exports = Tree;
