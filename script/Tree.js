const d3 = require('d3');
const fs = require('fs');

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
        .attr('transform', 'translate(' + this.width / 2 + ',' + this.height / 2 + ')');
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
    return d._children ? "#3182bd" : d.children ? "#c6dbef" : "#fd8d3c";
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
        d._children = d.children;
        d.children = null;
    } else {
        d.children = d._children;
        d._children = null;
    }
    this.update();
    // this.simulation.restart();
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

Tree.prototype.load = function (dataPath) {
    //d3.json(dataPath, (err, data) => {
    fs.readFile(dataPath, (err, contentBuffer) => {
        if (err) throw err;
        console.log('d3:', d3)
        console.log('this:', this);

        this.root = JSON.parse(contentBuffer.toString());

        this.root = d3.hierarchy(this.root);

        this.simulation
            .force('link', d3.forceLink().id((d) => d.id))
            .force('charge', d3.forceManyBody())
            .force('center', d3.forceCenter())
            .on('tick', () => this.ticked());
        
        this.update();

    });
};

Tree.prototype.update = function () {
    var drag = d3.drag()
        .on('start', (d) => this.dragstarted(d))
        .on('drag', (d) => this.dragged(d))
        .on('end', (d) => this.dragended(d));

    this.nodes = this.flatten(this.root);
    this.links = this.root.links();

    this.linkSvg = this.svg.selectAll('.link')
        .data(this.links, (d) => d.target.id);
    this.linkSvg.exit().remove();

    this.linkEnter = this.linkSvg.enter()
        .append('line')
        .attr('class', 'link');
    this.linkSvg = this.linkEnter.merge(this.linkSvg);

    this.nodeSvg = this.svg.selectAll('.node')
        .data(this.nodes, (d) => d.id);
    this.nodeSvg.exit().remove();

    this.nodeEnter = this.nodeSvg.enter()
        .append('g')
            .attr('class', 'node')
            .on('click', (d) => this.click(d))
            .call(drag);
    this.nodeEnter.append('circle')
        .attr('r', (d) => (Math.sqrt(d.size) / 10 || 4.5))
        .attr('fill', (d) => this.color(d));
    
    this.nodeSvg = this.nodeEnter.merge(this.nodeSvg);

    this.simulation
        .nodes(this.nodes);

    this.simulation.force('link')
        .links(this.links)
};

module.exports = Tree;
