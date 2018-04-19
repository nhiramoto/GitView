const d3 = require('d3');
const fs = require('fs');

function Tree(container, width, height) {
    this.container = container;
    this.width = width;
    this.height = height;
    this.nodeRadius = 8;
    this.svg = this.container.append('svg')
        .attr('id', 'treeSvg')
        .attr('preserveAspectRatio', 'xMinYMin meet')
        .attr('viewBox', '0 0 ' + this.width + ' ' + this.height)
        .classed('svg-content', true)
        .call(d3.zoom().scaleExtent([0.2, 40]).on("zoom", () => this.zoomed()));
    this.g = this.svg.append('g')
        .attr('class', 'svg-g');
        //.attr('transform', 'translate(' + this.width / 2 + ',' + this.height / 2 + ')');
    this.linkLayer = this.g.append('g');
    this.nodeLayer = this.g.append('g');
    this.simulation = d3.forceSimulation()
        .force('charge', d3.forceManyBody()
                .strength(-200)
                .distanceMax(400)
                .distanceMin(10)
        )
        //.force('center', d3.forceCenter(this.width / 2, this.height / 2))
        .force('center', d3.forceCenter(100, 100))
        .force('link', d3.forceLink()
            .strength(0.8))
        .force('collide', d3.forceCollide()
            .radius(d => this.radius(d) + 2))
        .on('tick', this.ticked.bind(this));
    this.links = null;
    this.linkSvg = null;
    this.linkEnter = null;
    this.nodes = null;
    this.nodeSvg = null;
    this.nodeEnter = null;
    this.root = null;
    this.radiusScale = d3.scalePow()
        .exponent(0.5)
        .domain([0, 100000])
        .range([3, 40])
        .clamp(true);

    // Text showing on node label
    this.labelAttribute = 'name';
    // Label show only on hover
    this.nodeHoverLabel = true;
    // Default depth to collapse nodes
    this.defaultDepth = 3;
    this.fillFileInfoFunction = null;
    this.data = null;
    this.path = null;
    this.tooltip = d3.select('body')
        .append('div')
        .attr('id', 'nodeTooltip')
        .classed('tooltip', true)
        .style('opacity', 0);
    this.tooltip.append('span').attr('id', 'tooltipHeader');
    this.tooltip.append('hr');
    this.tooltip.append('span').attr('id', 'added');
    this.tooltip.append('br');
    this.tooltip.append('span').attr('id', 'deleted');
    this.tooltip.append('br');
    this.tooltip.append('span').attr('id', 'modified');
}

Tree.prototype.zoomed = function () {
    this.g.attr('transform', d3.event.transform);
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
            .attr('transform', d => 'translate(' + d.x + ', ' + d.y + ')');
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

Tree.prototype.calculateValue = function (node) {
    if (node && node.data) {
        node.value = 0;
        if (node.data.statistic) {
            node.value = node.data.statistic.added + node.data.statistic.deleted + node.data.statistic.modified;
        }
        if (node.children) {
            node.children.forEach(c => this.calculateValue(c));
        } else if (node._children) {
            node._children.forEach(_c => this.calculateValue(_c));
        }
    }
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

Tree.prototype.revealNodes = function () {
    if (this.root) {
        let currentPath = this.path.replace(/\/+$/, '');
        if (currentPath !== '.' && currentPath !== this.root.data.path && this.root.children) {
            let names = currentPath.split('/');
            let node = this.root;
            names.forEach(name => {
                let found = null;
                if (node._children && node.children == null) {
                    node.children = node._children;
                    node._children = null;
                }
                if (node.children) {
                    node.children.forEach(c => {
                        if (c.data.name === name) {
                            found = c;
                        }
                    });
                }
                if (found) {
                    node = found;
                } else {
                    return;
                }
            });
            if (node._children && node.children == null) {
                node.children = node._children;
                node._children = null;
            }
        }
    }
};

Tree.prototype.maxLeafValue = function (node) {
    if (node) {
        let max = 0;
        if (node.leaves) {
            let lv = node.leaves();
            lv.forEach(n => {
                if (n.value > max) {
                    max = n.value;
                }
            });
        }
        return max;
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
        if (this.fillFileInfoFunction != null) {
            this.fillFileInfoFunction(d.data);
        }
    }
    if (d.data && d.data.path) {
        this.path = d.data.path;
    }
    //this.simulation.restart();
    this.update();
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
    let tooltip = d3.select('#nodeTooltip');
    let tooltipStatus = null;
    let tooltipClass = null;
    let addedLabel = 'Added: 0';
    let deletedLabel = 'Deleted: 0';
    let modifiedLabel = 'Modified: 0';
    if (d.data && d.data.status != null) {
        if (d.data.isAdded()) {
            tooltipStatus = 'Added';
            tooltipClass = 'added';
        } else if (d.data.isDeleted()) {
            tooltipStatus = 'Deleted';
            tooltipClass = 'deleted';
        } else if (d.data.isUnmodified()) {
            tooltipStatus = 'Unmodified';
            tooltipClass = 'unmodified';
        } else if (d.data.isMoved()) {
            tooltipStatus = 'Moved';
            tooltipClass = 'moved';
        } else {
            tooltipStatus = 'Modified';
            tooltipClass = 'modified';
        }
        if (d.data.isFile() && !d.data.isBinary && d.data.statistic != null) {
            addedLabel = 'Added Lines: ' + d.data.statistic.added;
            deletedLabel = 'Deleted Lines: ' + d.data.statistic.deleted;
            modifiedLabel = 'Modified Lines: ' + d.data.statistic.modified;
        } else if (d.data.isDirectory() && d.data.statistic != null) {
            addedLabel = 'Added Files: ' + d.data.statistic.added;
            deletedLabel = 'Deleted Files: ' + d.data.statistic.deleted;
            modifiedLabel = 'Modified Files: ' + d.data.statistic.modified;
        } else {
            addedLabel = null;
            deletedLabel = null;
            modifiedLabel = null;
        }
    }
    let tooltipHeader = tooltip.select('#tooltipHeader');
    tooltipHeader.classed('added', false);
    tooltipHeader.classed('deleted', false);
    tooltipHeader.classed('unmodified', false);
    tooltipHeader.classed('moved', false);
    tooltipHeader.classed('modified', false);
    if (tooltipStatus != null) {
        tooltipHeader
            .classed(tooltipClass, true)
            .text(tooltipStatus);
    } else {
        tooltip.select('#tooltipHeader').style('display', 'none');
        tooltip.select('hr').style('display', 'none');
    }
    if (addedLabel != null && deletedLabel != null && modifiedLabel != null && tooltipClass !== 'unmodified') {
        tooltip.select('hr').style('display', 'block');
        tooltip.select('#added').style('display', 'inline');
        tooltip.select('#deleted').style('display', 'inline');
        tooltip.select('#modified').style('display', 'inline');
        tooltip.select('#added').text(addedLabel);
        tooltip.select('#deleted').text(deletedLabel);
        tooltip.select('#modified').text(modifiedLabel);
    } else {
        tooltip.select('hr').style('display', 'none');
        tooltip.select('#added').style('display', 'none');
        tooltip.select('#deleted').style('display', 'none');
        tooltip.select('#modified').style('display', 'none');
    }
    tooltip.transition()
        .duration(300)
        .style('opacity', 1);
};

Tree.prototype.handleMouseMove = function (d, i) {
    let x = d3.event.pageX + 20;
    let y = d3.event.pageY + 20;
    d3.select('#nodeTooltip')
        .style('left', x + 'px')
        .style('top', y + 'px');
};

Tree.prototype.handleMouseOut = function (d, i) {
    d3.select(this).classed('focused', false);
    d3.select('#nodeTooltip').transition()
        .duration(300)
        .style('opacity', 0);
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
    d3.select(this).classed('node-moved', false);
    d3.select(this).classed('node-unmodified', false);
    if (d.parent == null) { // Root node
        if (d.children != null) {
            d3.select(this).classed('node-root', true);
        } else if (d._children) {
            d3.select(this).classed('node-rootCollapsed', true);
        }
    } else if (d._children != null) { // Collapsed node
        d3.select(this).classed('node-collapsed', true);
    } else if (d.children != null) { // Inner node
        d3.select(this).classed('node-inner', true);
    } else if (d.data && d.data.status != null) { // Leaf node
        if (d.data.isAdded()) {
            d3.select(this).classed('node-added', true);
        } else if (d.data.isDeleted()) {
            d3.select(this).classed('node-deleted', true);
        } else if (d.data.isUnmodified()) {
            d3.select(this).classed('node-unmodified', true);
        } else if (d.data.isMoved()) {
            d3.select(this).classed('node-moved', true);
        } else {
            d3.select(this).classed('node-modified', true);
        }
    }
};

Tree.prototype.radius = function (d) {
    return this.radiusScale(d.value);
};

Tree.prototype.opacity = function (d) {
    let op = 1;
    if (d.data != null && d.data.isUnmodified != null && d.data.isUnmodified()) {
        op = 0.3;
    }
    return op;
};

//=============== Attributes ===============

/**
 * Carrega os dados do arquivo.
 * @param {String} dataPath Caminho para o arquivo de dados.
 */
Tree.prototype.load = function (dataPath) {
    console.log('loading data from file:', dataPath);
    //d3.json(dataPath, (err, data) => {
    fs.readFile(dataPath, (err, contentBuffer) => {
        if (err) console.error(err);
        let data = JSON.parse(contentBuffer.toString());
        this.build(data);
    });
};

/**
 * Contrói a árvore baseado nos dados.
 * @param data Dados a serem representados na visualização.
 */
Tree.prototype.build = function (data) {
    console.log('building data tree..');
    this.data = data || [];
    console.log('  -> data:', this.data);
    this.root = d3.hierarchy(this.data, d => d.entries);
    this.calculateValue(this.root);
    let mdv = this.root.value;
    let mfv = this.maxLeafValue(this.root);
    let max = mfv > mdv ? mfv : mdv;
    //this.radiusScale.domain([0, max]);
    console.log('max:', max);
    this.moveChildren(this.root);
    if (this.path) {
        this.revealNodes();
    }
    //this.simulation.restart();
    this.update();
};

Tree.prototype.update = function () {
    var drag = d3.drag()
        .on('start', this.dragstarted.bind(this))
        .on('drag', this.dragged.bind(this))
        .on('end', this.dragended.bind(this));

    this.nodes = this.flatten(this.root);
    this.links = this.root.links();

    this.linkSvg = this.linkLayer.selectAll('.link')
        .data(this.links, d => d.target.data.path);
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
        .data(this.nodes, d => d.data.path);
    this.nodeSvg
        .each(this.stylize)
        .transition()
            .duration(300)
            .style('opacity', this.opacity.bind(this))
      .select('circle').transition()
        .duration(300)
        .attr('r', d => this.radius(d));
    this.nodeSvg.exit()
        .transition()
            .duration(300)
            .style('opacity', 0)
            .remove();

    this.nodeEnter = this.nodeSvg.enter()
        .append('g')
            .classed('node', true)
            .on('click', this.click.bind(this))
            .on('mouseover', this.handleMouseOver)
            .on('mousemove', this.handleMouseMove)
            .on('mouseout', this.handleMouseOut)
            .call(drag);
    this.nodeEnter
        .each(this.stylize)
        .style('opacity', 0)
        .transition()
            .duration(300)
            .style('opacity', d => this.opacity(d));
    this.nodeEnter.append('text')
        .attr('class', 'node-label')
        .text(d => {
            if (d.parent != null) {
                return d.data.name;
            } else {
                return '<root>';
            }
        })
        .attr('dx', d => 0)
        .attr('dy', d => -this.radius(d) - 5);
    this.nodeEnter.append('circle')
        .attr('r', 0)
        .transition()
            .duration(500)
            .attr('r', d => this.radius(d));

    this.nodeSvg = this.nodeEnter.merge(this.nodeSvg);

    this.simulation
        .nodes(this.nodes)
        .force('link')
        .links(this.links);
    this.simulation.alpha(0.3).restart();
};

module.exports = Tree;
