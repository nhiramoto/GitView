const d3 = require('d3');

function Branch(container, width, height) {
    this.container = container;
    this.width = width;
    this.height = height;
    this.nodeRadius = 8;
    this.svg = this.container.append('svg')
        .attr('id', 'branchSvg')
        .attr('viewBox', '0 0 ' + this.width + ' ' + this.height)
        .on('wheel', this.scrolled.bind(this), {passive:true})
      .append('g');
    this.linkLayer = this.svg.append('g');
    this.nodeLayer = this.svg.append('g');
    this.gapX = 50; this.gapY = 80;
    this.scrollX = 0; this.scrollY = 0;
    this.minScrollX = 0; this.maxScrollX = 999999;
    this.minScrollY = 0; this.maxScrollY = 999999;
    this.simulation = null;
    this.color = d3.scaleOrdinal(d3.schemeCategory20);
    this.data = null;
    this.newData = {};
    this.link = null;
    this.linkEnter = null;
    this.node = null;
    this.nodeEnter = null;
    this.clickCallback = null;
    this.selected = null;
}

Branch.prototype.scrolled = function () {
    let newX = this.scrollX - 5 * d3.event.deltaX;
    let newY = this.scrollY - 5 * d3.event.deltaY;
    if (newY > -this.minScrollY || newY < -this.maxScrollY) {
        newY = this.scrollY;
    }
    if (newX > -this.minScrollX || newX < -this.maxScrollX) {
        newX = this.scrollX;
    }
    if (newX != this.scrollX || newY != this.scrollY) {
        this.scrollX = newX;
        this.scrollY = newY;
        this.svg.transition()
            .duration(50)
            .attr('transform', 'translate(' + this.scrollX + ',' + this.scrollY + ')');
        this.newData.nodes = this.data.nodes.filter(n => n.y >= -this.scrollY && n.y <= -this.scrollY + this.height);
        //this.newData.links = this.data.links.filter(l => l.source.y >= -this.scrollY || l.target.y <= -this.scrollY + this.height);
        this.newData.links = this.data.links.filter(l => this.newData.nodes.includes(l.source) || this.newData.nodes.includes(l.target));
        this.update();
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
    this.linkEnter.attr('d', positionLink.bind(this));
};

Branch.prototype.dragended = function (d) {
    if (!d3.event.active) this.simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
};

Branch.prototype.select = function (commitId) {
    this.selected = commitId;
    this.svg.select('.selected').classed('selected', false);
    this.svg.selectAll('.node')
        .filter(d => d.id === commitId)
        .select('circle')
            .classed('selected', true);
};

Branch.prototype.click = function (d) {
    console.log('clicked:', d);
    this.select(d.id);
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
        commit.x = 30 + commit.pos[1] * this.gapX;
        commit.y = 30 + commit.pos[0] * this.gapY;
        commit.parents.forEach(parId => {
            let par = commitData.find(c => c.id === parId);
            // create links
            newData.links.push({
                source: par,
                target: commit
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
    if (this.linkEnter) {
        this.linkEnter
    //    //.attr('x1', d => d.source.x)
    //    //.attr('y1', d => d.source.y)
    //    //.attr('x2', d => d.target.x)
    //    //.attr('y2', d => d.target.y);
            .attr('d', d => positionLink(d));
    }
    if (this.nodeEnter) {
        this.nodeEnter.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
    }
};

Branch.prototype.build = function (commitData) {
    this.data = this.parseCommits(commitData);
    this.newData.nodes = this.data.nodes.filter(n => n.y >= -this.scrollY && n.y <= -this.scrollY + this.height);
    this.newData.links = this.data.links.filter(l => this.newData.nodes.includes(l.source) || this.newData.nodes.includes(l.target));
    //this.simulation = d3.forceSimulation()
    //    .force('link', d3.forceLink().id(d => d.id).strength(0.001))
    //    .force('x', d3.forceX(d => 30 + d.pos[1] * this.gapX).strength(1))
    //    .force('y', d3.forceY(d => 30 + d.pos[0] * this.gapY).strength(1));
    this.maxScrollY = 30 + ( commitData.length - 1 ) * this.gapY;
    this.update();
};

Branch.prototype.update = function () {

    this.node = this.nodeLayer.selectAll('.node')
        .data(this.newData.nodes, d => d.id);
    this.node.transition()
        .duration(300)
        .attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
    
    this.nodeEnter = this.node.enter().append('g');
    this.nodeEnter.attr('id', d => d.id)
            .classed('node', true)
            .attr('transform', d => 'translate(' + d.x + ',' + d.y + ')')
            .on('click', this.click.bind(this))
            .style('opacity', 0)
            .transition()
                //.delay(d => 0.3 * ( d.y + this.scrollY ))
                .duration(10)
                .style('opacity', 1);
            //.call(d3.drag()
            //    .on('start', this.dragstarted.bind(this))
            //    .on('drag', this.dragged.bind(this))
            //    .on('end', this.dragended.bind(this)));

    this.nodeEnter.append('circle')
        .classed('selected', d => d.id === this.selected)
        .attr('r', 10);

    this.nodeEnter.append('title')
        .text(d => d.id);

    this.nodeEnter.append('foreignObject')
        .attr('width', (this.width - 30) + 'px')
        .attr('height', (this.gapY - 10) + 'px')
        .style('pointer-events', 'none')
      .append('xhtml:div')
        .style('pointer-events', 'none')
      .append('div')
        .style('pointer-events', 'none')
        .classed('commitText', true)
      .append('p')
        .style('pointer-events', 'none')
        .html(d => d.message);

    this.node.exit()
        .remove();

    this.link = this.linkLayer.selectAll('.link')
        .data(this.newData.links, d => d.target.id);
    this.link.transition()
        .duration(300)
        .attr('d', d => positionLink(d));

    this.linkEnter = this.link.enter().append('g')
            .classed('link', true)
        .append('path')
            .attr('d', d => positionLink(d))
            .style('opacity', 0)
            .transition()
                .duration(300)
                .style('opacity', 1);

    this.link.exit()
        .remove();

    //this.simulation.nodes(this.data.nodes)
    //    .on('tick', this.ticked.bind(this));
    //
    //this.simulation.force('link')
    //    .links(this.data.links);
};

module.exports = Branch;
