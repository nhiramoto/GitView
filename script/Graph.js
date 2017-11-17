const d3 = require('d3');

function Graph(svg, width, height) {
    this.svg = svg;
    this.width = width;
    this.height = height;
    this.color = d3.scaleOrdinal(d3.schemeCategory20);
    this.simulation = null;
    this.link = null;
    this.node = null;
}

Graph.prototype.init = function (data) {
    this.simulation = d3.forceSimulation()
        .force('link', d3.forceLink().id((d) => d.id))
        .force('charge', d3.forceManyBody)
        .force('center', d3.forceCenter(this.width / 2, this.height / 2));

    this.link = this.svg.append('g')
        .attr('class', 'links')
        .selectAll('line')
        .data(data.links)
        .enter().append('line')
        .attr('stroke-width', (d) => Math.sqrt(d.value));

    this.node = this.svg.append('g')
        .attr('class', 'nodes')
        .selectAll('circle')
        .data(data.nodes)
        .enter().append('circle')
            .attr('r', 5)
            .attr('fill', (d) => this.color(d.group))
            .call(d3.drag()
                .on('start', this.dragstarted))
                .on('drag', this.dragged)
                .on('end', this.dragended);

    this.node.append('title')
        .text((d) => d.id);

    this.simulation
        .nodes(data.nodes)
        .on('tick', ticked);

    this.simulation.force('link')
        .links(data.links);

    function ticked() {
        link
            .attr("x1", function(d) { return d.source.x; })
            .attr("y1", function(d) { return d.source.y; })
            .attr("x2", function(d) { return d.target.x; })
            .attr("y2", function(d) { return d.target.y; });

        node
            .attr("cx", function(d) { return d.x; })
            .attr("cy", function(d) { return d.y; });
    }
};

var dragstarted = function (d) {
  if (!d3.event.active) this.simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

var dragged = function (d) {
  d.fx = d3.event.x;
  d.fy = d3.event.y;
}

var dragended = function (d) {
  if (!d3.event.active) this.simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}

module.exports = Graph;
