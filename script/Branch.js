const d3 = require('d3');

function Branch(container, width, height) {
    this.container = container;
    this.width = width;
    this.height = height;
    this.nodeRadius = 8;
    this.svg = this.container.append('svg')
        .attr('id', 'branchSvg')
        .attr('viewBox', '0 0 ' + this.width + ' ' + this.height)
        .on('wheel', this.scrolled.bind(this))
      .append('g');
    this.linkLayer = this.svg.append('g');
    this.nodeLayer = this.svg.append('g');
    this.gapX = 50; this.gapY = 80;
    this.dx = 0; this.dy = 0;
    this.minScrollX = 0; this.maxScrollX = 300;
    this.minScrollY = 0; this.maxScrollY = 999999;
    this.simulation = null;
    this.color = d3.scaleOrdinal(d3.schemeCategory20);
    this.data = null;
    this.link = null;
    this.node = null;
    this.clickCallback = null;
}

Branch.prototype.scrolled = function () {
    let newX = this.dx - 5 * d3.event.deltaX;
    let newY = this.dy - 5 * d3.event.deltaY;
    if (newY > -this.minScrollY || newY < -this.maxScrollY) {
        newY = this.dy;
    }
    if (newX > -this.minScrollX || newX < -this.maxScrollX) {
        newX = this.dx;
    }
    if (newX != this.dx || newY != this.dy) {
        this.dx = newX;
        this.dy = newY;
        this.svg.transition()
            .duration(50)
            .attr('transform', 'translate(' + this.dx + ',' + this.dy + ')');
    }
};

Branch.prototype.dragstarted = function (d) {
    if (!d3.event.active) this.simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
};

Branch.prototype.dragged = function (d) {
    d.fx = d3.event.x;
    d.fy = d3.event.y;
    this.link.attr('d', positionLink.bind(this));
};

Branch.prototype.dragended = function (d) {
    if (!d3.event.active) this.simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
};

Branch.prototype.click = function (d) {
    this.svg.select('.selected').classed('selected', false);
    d3.select(d3.event.target).classed('selected', true);
    if (this.clickCallback) {
        this.clickCallback(d);
    }
};

Branch.prototype.parseCommits = function (commitData) {
    let newData = {
        nodes: [],
        links: []
    };
    commitData.forEach(commit => {
        commit.parents.forEach(parId => {
            // create links
            newData.links.push({
                source: parId,
                target: commit.id
            });
        });
        // create node
        newData.nodes.push(commit);
    });
    return newData;
};

var positionLink = function (link) {
    let distX = link.target.x - link.source.x;
    if (distX < 0) distX = -distX;
    let radius = Math.min(30, distX);
    if (Math.round( link.source.x ) == Math.round( link.target.x )) {
        return 'M ' + link.source.x + ' ' + link.source.y + ' ' +
               'L ' + link.target.x + ' ' + link.target.y;
    } else if (link.source.x > link.target.x) {
        return 'M ' + link.source.x + ' ' + link.source.y + ' ' +
               'V ' + ( link.target.y + radius ) + ' ' +
               'Q ' + link.source.x + ' ' + link.target.y + ' ' +
               ( link.source.x - radius ) + ' ' + link.target.y + ' ' +
               'H ' + link.target.x;
    } else {
        return 'M ' + link.source.x + ' ' + link.source.y + ' ' +
               'H ' + ( link.target.x - radius ) + ' ' +
               'Q ' + link.target.x + ' ' + link.source.y + ' ' +
               link.target.x + ' ' + ( link.source.y - radius ) + ' ' +
               'V ' + link.target.y;
    }
};

Branch.prototype.ticked = function () {
    if (this.link) {
        this.link
    //    //.attr('x1', d => d.source.x)
    //    //.attr('y1', d => d.source.y)
    //    //.attr('x2', d => d.target.x)
    //    //.attr('y2', d => d.target.y);
            .attr('d', d => positionLink(d));
    }
    if (this.node) {
        this.node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
    }
};

Branch.prototype.select = function (commitId) {
    this.svg.select('.selected').classed('selected', false);
    this.svg.selectAll('.node')
        .filter(d => d.id === commitId)
        .select('circle')
            .classed('selected', true);
};

Branch.prototype.build = function (commitData) {
    this.data = this.parseCommits(commitData);
    this.simulation = d3.forceSimulation()
        .force('link', d3.forceLink().id(d => d.id).strength(0.001))
        .force('x', d3.forceX(d => 30 + d.pos[1] * this.gapX).strength(1))
        .force('y', d3.forceY(d => 30 + d.pos[0] * this.gapY).strength(1));
    this.maxScrollY = 30 + ( commitData.length - 1 ) * this.gapY;
    this.update();
};

Branch.prototype.update = function () {
    this.link = this.svg.selectAll('.link')
        .data(this.data.links)
        .enter().append('g')
            .classed('link', true)
        .append('path')
            .attr('d', d => {
                positionLink(d);
            });
    this.simulation.on('end', () => {
        this.link.attr('d', positionLink.bind(this));
    });
    
    this.node = this.svg.selectAll('.node')
        .data(this.data.nodes, d => d.id)
        .enter().append('g')
            .attr('id', d => d.id)
            .classed('node', true)
            .on('click', this.click.bind(this))
            .call(d3.drag()
                .on('start', this.dragstarted.bind(this))
                .on('drag', this.dragged.bind(this))
                .on('end', this.dragended.bind(this)));

    this.node.append('circle')
        .attr('r', 10);

    this.node.append('title')
        .text(d => d.id);

    this.node.append('foreignObject')
        .attr('width', (this.width - 30) + 'px')
        //.attr('dx', 20)
        //.attr('dy', 5)
        .style('border', '1px solid red')
      .append('xhtml:div')
      .append('div')
        .classed('commitText', true)
      .append('p')
        .html(d => d.message);

    this.simulation.nodes(this.data.nodes)
        .on('tick', this.ticked.bind(this));

    this.simulation.force('link')
        .links(this.data.links);
};

module.exports = Branch;
