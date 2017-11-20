const d3 = require('d3');
const fs = require('fs');

function Tree(container, width, height) {
    this.width = width;
    this.height = height;
    this.svg = container.append('svg')
        .attr('width', this.width)
        .attr('height', this.height)
        .attr('class', 'viewSvg')
        .append('g')
        .attr('transform', 'translate(' + this.width / 2 + ',' + this.height / 2 + ')');
    this.simulation = null;
    this.link = null;
    this.node = null;
}

Tree.prototype.load = function (dataPath) {
    //d3.json(dataPath, (err, data) => {
    fs.readFile(dataPath, (err, contentBuffer) => {
        if (err) throw err;
        console.log('d3:', d3)

        var data = JSON.parse(contentBuffer.toString());
        
        var radius = 5;

        var color = (d) => d._children ? "#3182bd" : d.children ? "#c6dbef" : "#fd8d3c";

        var ticked = () => {
            this.link
                .attr("x1", function(d) { return d.source.x; })
                .attr("y1", function(d) { return d.source.y; })
                .attr("x2", function(d) { return d.target.x; })
                .attr("y2", function(d) { return d.target.y; });

            this.node
                .attr("cx", function(d) { return d.x; })
                .attr("cy", function(d) { return d.y; });
        };

        var click = (d) => {
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

        var dragstarted = (d) => {
          if (!d3.event.active) this.simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        };

        var dragged = (d) => {
          d.fx = d3.event.x;
          d.fy = d3.event.y;
        };

        var dragended = (d) => {
          if (!d3.event.active) this.simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        };

        var drag = d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended);

        this.simulation = d3.forceSimulation()
            .force('charge', d3.forceManyBody())
            .force('center', d3.forceCenter())
            //.force('x', d3.forceX().strength(0.05))
            //.force('y', d3.forceY().strength(0.05))
            .force('link', d3.forceLink().id((d) => d.id))
            .force('collide', d3.forceCollide(radius + 1))
            ;

        this.link = this.svg.append('g')
            .attr('class', 'links')
            .selectAll('line')
            .data(data.links)
            .enter().append('line')
            //.attr('stroke-width', 2)
            .attr('stroke', '#ACACAC')
            .attr('stroke-width', (d) => Math.sqrt(d.value))
            ;

        this.node = this.svg.append('g')
            .attr('class', 'nodes')
            .selectAll('circle')
            .data(data.nodes)
            .enter().append('circle')
                .attr('r', radius)
                .attr('fill', (d) => this.color(d.group))
                .on('click', (d) => console.log(d.id))
                .call(drag);

        this.node.append('title')
            .text((d) => d.id);

        this.simulation
            .nodes(data.nodes)
            .on('tick', ticked);

        this.simulation.force('link')
            .links(data.links);

    });
};

module.exports = Tree;
