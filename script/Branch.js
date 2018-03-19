const d3 = require('d3');
const fs = require('fs');

function Branch(container, width, height) {
    this.container = container;
    this.width = width;
    this.height = height;
    this.nodeRadius = 8;
    this.svg = this.container.append('svg')
        .attr('id', 'branchSvg')
        .classed('svg-content', true)
      .append('g');
    this.linkLayer = this.svg.append('g');
    this.nodeLayer = this.svg.append('g');
    this.gapX = 50; this.gapY = 80;
    this.dx = 0; this.dy = 0;
    this.minScrollY = 0; this.maxScrollY = 999999;
    this.simulation = d3.forceSimulation()
        .force('link', d3.forceLink().id(d => d.id).strength(0.1))
        .force('x', d3.forceX(d => 30 + d.pos[0] * gapX).strength(1))
        .force('y', d3.forceY(d => 30 + d.pos[1] * gapY).strength(1));
    this.selectionCircle = this.svg.append('circle')
        .attr('id', 'selectionCircle')
        .attr('r', '15px')
        .attr('transform', 'translate(-100, -100)');
    this.color = d3.scaleOrdinal(d3.schemeCategory20);
    this.data = null;
    this.link = null;
    this.node = null;
    this.clickCallback = null;
}

Branch.prototype.scrolled = function () {
    let newX = this.dx - 10 * d3.event.deltaX;
    let newY = this.dy - 10 * d3.event.deltaY;
    if (newY > -this.minScrollY || newY < -this.maxScrollY) {
        newY = this.dy;
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
};

Branch.prototype.dragended = function (d) {
    if (!d3.event.active) this.simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
};

Branch.prototype.click = function (d) {
    console.log('d:', d);
    this.selectionCircle.transition()
        .duration(500)
        .attr('transform', 'translate(' + d.x + ',' + d.y + ')');
    if (this.clickCallback) {
        this.clickCallback(d);
    }
};

Branch.prototype.parseCommmits = function (commitData) {
    let branch = {};
    let count = 1;
    let index = 0;
    let newData = {
        nodes: [],
        links: []
    };
    commitData.forEach(commit => {
        console.log('-');
        // pos [History Index, Branch Index]
        branch[commit.id] = branch[commit.id] != undefined ? branch[commit.id] : 0;
        commit.pos = [
            index++,
            branch[commit.id]
        ];
        let firstParentId = commit.parents[0];
        if (firstParentId) {
            if (branch[firstParentId] == undefined || branch[commit.id] <= branch[firstParentId]) {
                branch[firstParentId] = branch[commit.id];
            } else {
                count--;
            }
            // create links
            newData.links.push({
                source: firstParentId,
                target: commit.id
            });
        }
        commit.parents.splice(1).forEach(parId => {
            branch[parId] = count++;
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

Branch.prototype.positionLink = function (d) {
    let distX = d.target.x - d.source.x;
    if (distX < 0) distX = -distX;
    let radius = Math.min(30, distX);
    if (Math.round( d.source.x ) == Math.round( d.target.x )) {
        return 'M ' + d.source.x + ' ' + d.source.y + ' ' +
               'L ' + d.target.x + ' ' + d.target.y;
    } else if (d.source.x > d.target.x) {
        return 'M ' + d.source.x + ' ' + d.source.y + ' ' +
               'V ' + ( d.target.y + radius ) + ' ' +
               'Q ' + d.source.x + ' ' + d.target.y + ' ' +
               ( d.source.x - radius ) + ' ' + d.target.y + ' ' +
               'H ' + d.target.x;
    } else {
        return 'M ' + d.source.x + ' ' + d.source.y + ' ' +
               'H ' + ( d.target.x - radius ) + ' ' +
               'Q ' + d.target.x + ' ' + d.source.y + ' ' +
               d.target.x + ' ' + ( d.source.y - radius ) + ' ' +
               'V ' + d.target.y;
    }
};

Branch.prototype.ticked = function () {
    if (this.link) {
        this.link
        //.attr('x1', d => d.source.x)
        //.attr('y1', d => d.source.y)
        //.attr('x2', d => d.target.x)
        //.attr('y2', d => d.target.y);
            .attr('d', this.positionLink.bind(this));
    }
    if (this.node) {
        this.node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
    }
};

Branch.prototype.build = function (commitData) {
    this.data = this.parseCommits(commitData);
    this.link = this.svg.selectAll('.link')
        .data(this.data.links)
        .enter().append('g')
            .classed('link', true)
        .append('path')
            .attr('d', this.positionLink.bind(this));
    
    this.node = this.svg.selectAll('.node')
        .data(this.data.nodes, d => d.id)
        .enter().append('g')
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

    this.node.append('text')
        .attr('dx', 20)
        .attr('dy', 5)
        .text(d => d.message);

    this.simulation.nodes(this.data.nodes)
        .on('tick', this.ticked.bind(this));

    this.simulation.force('link')
        .links(this.data.links);
};

module.exports = Branch;
