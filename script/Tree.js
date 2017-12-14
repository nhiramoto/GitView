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
    this.linkLayer = this.svg.append('g').attr('class', 'linkLayer');
    this.nodeLayer = this.svg.append('g').attr('class', 'nodeLayer');
    this.simulation = d3.forceSimulation();
    this.links = null;
    this.linkSvg = null;
    this.linkEnter = null;
    this.nodes = null;
    this.nodeSvg = null;
    this.nodeEnter = null;
    this.root = null;
}

Tree.prototype.zoomed = function () {
    this.svg.attr('transform', d3.event.transform);
};

Tree.prototype.color = function (d) {
    if (d.parent == null) { // Root node
        if (d.children != null) {
            return "#808080";
        } else if (d._children) {
            return "#505050"
        }
    } else if (d._children != null) { // Collapsed node
        return "#3182bd";
    } else if (d.children != null) { // Inner node
        return "white";
    } else { // Leaf node
        if (d.data.status == JSONDatabase.FILESTATUS.ADDED) {
            return "#2fe2a1";
        } else if (d.data.status == JSONDatabase.FILESTATUS.DELETED) {
            return "#d15375";
        } else if (d.data.status == JSONDatabase.FILESTATUS.MODIFIED) {
            return "#dbd825";
        } else {
            return "#7f58d3";
        }
    }
};

Tree.prototype.radius = function (d) {
    //return Math.sqrt(d.data.size) / 10 || 4.5;
    if (d.children != null || d._children != null) {
        return Math.sqrt(d.data.entries.length) * 5 + 5;
    } else {
        return Math.sqrt(d.data.lines.length) * 5 + 5;
    }
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
    console.log('name:', d.data.name);
    console.log('path:', d.data.path);
    this.update();
    this.simulation.restart();
};

Tree.prototype.flatten = function (root) {
    let nodes = [], i = 0;
    function recurse(node) {
        if (node.children) node.children.forEach(recurse);
        if (!node.id) node.id = ++i;
        else ++i;
        nodes.push(node);
    }
    recurse(root);
    return nodes;
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

/**
 * Carrega os dados do arquivo.
 * @param {String} dataPath - Caminho para o arquivo de dados.
 */
Tree.prototype.load = function (dataPath) {
    //d3.json(dataPath, (err, data) => {
    fs.readFile(dataPath, (err, contentBuffer) => {
        if (err) console.error('Error:', err);
        let data = JSON.parse(contentBuffer.toString());
        this.create(data);
    });
};

/**
 * Contrói a árvore basedo nos dados.
 * @param data - Dados a serem representados na visualização.
 */
Tree.prototype.build = function (data) {
    this.root = d3.hierarchy(data, d => d.entries);
    this.simulation
        .force('link', d3.forceLink().strength(0.8).id((d) => d.id))
        .force('charge', d3.forceManyBody().strength(-400).distanceMax(300).distanceMin(30))
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
    this.linkSvg.exit()
        .transition()
            .duration(100)
            .style('opacity', 0)
            .remove();

    this.linkEnter = this.linkSvg.enter()
        .append('line')
        .attr('class', 'link');
    this.linkEnter
        .style('opacity', 0)
        .transition()
            .duration(100)
            .style('opacity', 1);

    this.linkSvg = this.linkEnter.merge(this.linkSvg);

    this.nodeSvg = this.nodeLayer.selectAll('.node')
        .data(this.nodes, (d) => d.id);
    this.nodeSvg.selectAll('circle')
        .style('fill', (d) => this.color(d));
    this.nodeSvg.exit()
        .transition()
            .duration(100)
            .style('opacity', 0)
            .remove();

    this.nodeEnter = this.nodeSvg.enter()
        .append('g')
            .attr('class', 'node')
            .on('click', (d) => this.click(d))
            .call(drag);
    this.nodeEnter.append('circle')
        .attr('r', (d) => this.radius(d))
        //.attr('r', this.nodeRadius)
        .style('fill', (d) => this.color(d))
        .style('opacity', 0)
        .transition()
            .duration(100)
            .style('opacity', 1);
    
    this.nodeSvg = this.nodeEnter.merge(this.nodeSvg);
};

module.exports = Tree;
