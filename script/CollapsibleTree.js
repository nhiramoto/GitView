const d3 = require('d3');

function CollapsibleTree(svg, width, height) {
    this.svg = svg;
    this.width = width;
    this.height = height;
    this.force = d3.layout.force()
                    .size([this.width, this.height])
                    .on('tick', tick);
    this.link = this.svg.selectAll('.link');
    this.node = this.svg.selectAll('.node');
    this.root = null;
}

CollapsibleTree.prototype.tick = function () {
    this.link
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);

    this.node
        .attr('cx', (d) => d.x)
        .attr('cy', (d) => d.y);
};

// Color leaf nodes orange, and packages white or blue.
CollapsibleTree.prototype.color = function (d) {
    return d._children ? "#3182bd" : d.children ? "#c6dbef" : "#fd8d3c";
};

// Toggle children on click
CollapsibleTree.prototype.click = function (d) {
    if (!d3.event.defaultPrevented) {
        if (d.children) {
            d._children = d.children;
            d.children = null;
        } else {
            d.children = d._children;
            d._children = null;
        }
        this.update();
    }
};

// Returns a list of all nodes under the root.
CollapsibleTree.prototype.flatten = function (root) {
    let nodes = [], i = 0;
    function recurse(node) {
        if (node.children) node.children.forEach(recurse);
        if (!node.id) node.id = ++i;
        nodes.push(node);
    }
    recurse(root);
    return nodes;
};

CollapsibleTree.prototype.update = function () {
    let nodes = this.flatten(root),
        links = d3.layout.tree().links(nodes);

    // Restart force layout
    this.force
        .nodes(nodes)
        .links(links)
        .start();

    // Update links
    this.link = this.link.data(links, (d) => d.target.id);

    // Exit any old links
    this.link.exit().remove();

    // Enter any new links
    this.link.enter().insert('line', '.node')
        .attr('class', 'link')
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);

    // Update the nodes
    this.node = this.node.data(nodes, (d) => d.id).style('fill', color);

    // Exit any old nodes
    this.node.exit().remove();

    // Enter any new nodes
    this.node.enter().append('circle')
        .attr('class', 'node')
        .attr('cx', (d) => d.x)
        .attr('cy', (d) => d.y)
        .attr('r', (d) => (Math.sqrt(d.size) / 10) || 4.5)
        .style('fill', this.color)
        .on('click', this.click)
        .call(this.force.drag);
};
