const d3 = require('d3');
const fs = require('fs');
const JSONDatabase = require('./GitPipe/JSONDatabase');

function Tree(container, width, height) {
    this.width = width;
    this.height = height;
    this.nodeRadius = 8;
    this.svg = container.append('svg')
        //.attr('width', this.width)
        //.attr('height', this.height)
        .attr('preserveAspectRatio', 'xMinYMin meet')
        .attr('viewBox', '0 0 300 300')
        .classed('svg-content', true)
        .call(d3.zoom().scaleExtent([0.2, 40]).on("zoom", () => this.zoomed()))
      .append('g')
        .attr('class', 'svg-g');
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
    this.tooltip = d3.select('body')
        .append('div')
        .attr('id', 'nodeTooltip')
        .style('opacity', 0);
    this.tooltip.append('span').attr('id', 'tooltipHeader');
    this.tooltip.append('hr');
    this.tooltip.append('span').attr('id', 'added');
    this.tooltip.append('br');
    this.tooltip.append('span').attr('id', 'deleted');
    this.tooltip.append('br');
    this.tooltip.append('span').attr('id', 'modified');
    //this.radius = null;
    // Default radius scale
    this.radiusScale = n => {
        if (n) {
            return Math.sqrt(n) * 3 + 5;
        } else {
            return 5;
        }
    };

    // Text showing on node label
    this.labelAttribute = 'name';

    // Label show only on hover
    this.nodeHoverLabel = true;

    // Default depth to collapse nodes
    this.defaultDepth = 3;

    this.fillFileInfoFunction = null;
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

Tree.prototype.moveChildren = function (node) {
    if (node.children) {
        node.children.forEach(c => this.moveChildren(c));
        if (node.depth >= this.defaultDepth) {
            node._children = node.children;
            node.children = null;
        }
    }
};

Tree.prototype.biggerNode = function (root) {
    let bigger = null;
    let biggerWeight = 0;
    function searchBigger (node) {
        if (node.data && node.data.statistic) {
            let nodeWeight = node.data.statistic.added
                + node.data.statistic.deleted
                + node.data.statistic.modified;
            if ((bigger != null && nodeWeight > biggerWeight)
                || bigger == null) {
                bigger = node;
                biggerWeight = nodeWeight;
            }
            if (node.children) {
                node.children.forEach(searchBigger);
            } else if (node._children) {
                node._children.forEach(searchBigger);
            }
        }
    }
    searchBigger(root);
    return bigger;
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
    console.log('d.data:', d.data);
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
    if (d.data.statistic != null) {
        d3.select('#nodeTooltip')
            .transition()
                .duration(300)
                .style('opacity', 1);
    }
    if (d.data != null && d.data.isFile()) {
        d3.select('#nodeTooltip').select('#tooltipHeader').style('display', 'inline');
        d3.select('#nodeTooltip').select('hr').style('display', 'block');
    } else {
        d3.select('#nodeTooltip').select('#tooltipHeader').style('display', 'none');
        d3.select('#nodeTooltip').select('hr').style('display', 'none');
    }
};

Tree.prototype.handleMouseMove = function (d, i) {
    let fileStatus = null;
    let fileClass = null;
    let addedLabel = 'Adicionado: 0';
    let deletedLabel = 'Deletado: 0';
    let modifiedLabel = 'Modificado: 0';
    if (d.data != null) {
        if (d.data.isFile()) {
            if (d.data.isAdded()) {
                fileStatus = 'Adicionado';
                fileClass = 'added';
            } else if (d.data.isDeleted()) {
                fileStatus = 'Deletado';
                fileClass = 'deleted';
            } else if (d.data.isModified()) {
                fileStatus = 'Modificado';
                fileClass = 'modified';
            } else if (d.data.isUnmodified()) {
                fileStatus = 'Não modificado';
                fileClass = 'unmodified';
            } else {
                console.assert(d.data.isMoved(), '[Tree#handleMouseMove] Error: Invalid file status.');
                fileStatus = 'Movido';
                fileClass = 'moved';
            }
            if (d.data.statistic != null) {
                addedLabel = 'Linhas adicionadas: ' + d.data.statistic.added;
                deletedLabel = 'Linhas deletadas: ' + d.data.statistic.deleted;
                modifiedLabel = 'Linhas modificadas: ' + d.data.statistic.modified;
            }
        } else {
            if (d.data.statistic != null) {
                addedLabel = 'Arquivos adicionados: ' + d.data.statistic.added;
                deletedLabel = 'Arquivos deletados: ' + d.data.statistic.deleted;
                modifiedLabel = 'Arquivos modificados: ' + d.data.statistic.modified;
            }
        }
    }
    let x = d3.event.pageX + 20;
    let y = d3.event.pageY + 20;
    let tooltip = d3.select('#nodeTooltip')
        .style('left', x + 'px')
        .style('top', y + 'px');
    let tooltipHeader = tooltip.select('#tooltipHeader');
    tooltipHeader.classed('added', false);
    tooltipHeader.classed('deleted', false);
    tooltipHeader.classed('modified', false);
    tooltipHeader.classed('unmodified', false);
    tooltipHeader.classed('moved', false);
    if (fileStatus != null) {
        tooltip.select('#tooltipHeader')
            .classed(fileClass, true)
            .text(fileStatus);
    } else {
        tooltip.select('#tooltipHeader').style('display', 'none');
        tooltip.select('hr').style('display', 'none');
    }
    tooltip.select('#added').text(addedLabel);
    tooltip.select('#deleted').text(deletedLabel);
    tooltip.select('#modified').text(modifiedLabel);
};

Tree.prototype.handleMouseOut = function (d, i) {
    d3.select(this).classed('focused', false)
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
        if (d.data.isAdded()) {
            d3.select(this).classed('node-added', true);
        } else if (d.data.isDeleted()) {
            d3.select(this).classed('node-deleted', true);
        } else if (d.data.isModified()) {
            d3.select(this).classed('node-modified', true);
        } else if (d.data.isMoved()) {
            d3.select(this).classed('node-moved', true);
        } else {
            console.assert(d.data.isUnmodified(), '[Tree#stylize] Invalid file status.');
            d3.select(this).classed('node-unmodified', true);
        }
    }
};

Tree.prototype.radius = function (d) {
    if (d.data && d.data.statistic) {
        let weight = d.data.statistic.added
            + d.data.statistic.deleted
            + d.data.statistic.modified;
        return this.radiusScale(weight);
    } else {
        return this.radiusScale(0);
    }
};

Tree.prototype.opacity = function (d) {
    let stat = 0;
    if (d.data != null) {
        if (d.data.isDirectory()) {
            if (d.data.statistic != null) {
                stat = d.data.statistic.added + d.data.statistic.deleted + d.data.statistic.modified;
            }
        } else if (!d.data.isUnmodified()) {
            stat = 1;
        }
    }
    if (stat === 0) {
        return 0.3;
    } else {
        return 1;
    }
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
        if (err) console.error('Error:', err);
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
    data = data || [];
    console.log('  -> data:', data);
    this.root = d3.hierarchy(data, d => d.entries);
    this.moveChildren(this.root);
    this.radiusScale = d3.scalePow().exponent(0.5)
        .domain([0, 30])
        .range([3, 10]);
    this.simulation
        .force('link', d3.forceLink()
                .distance(d => this.radius(d.source) + this.radius(d.target))
                .strength(0.8).id(d => d.id))
        .force('charge', d3.forceManyBody()
                .strength(-200)
                .distanceMax(400)
                .distanceMin(10))
        //.force('center', d3.forceCenter(this.width / 2, this.height / 2))
        .force('center', d3.forceCenter(100, 100))
        .force('collide', d3.forceCollide()
                .radius(d => this.radius(d) + 2))
        .on('tick', () => this.ticked());
    this.update();
    this.simulation.restart();
};

Tree.prototype.update = function () {
    var drag = d3.drag()
        .on('start', d => this.dragstarted(d))
        .on('drag', d => this.dragged(d))
        .on('end', d => this.dragended(d));

    this.nodes = this.flatten(this.root);
    this.links = this.root.links();

    this.simulation
        .nodes(this.nodes);

    this.simulation.force('link')
        .links(this.links);

    this.linkSvg = this.linkLayer.selectAll('.link')
        .data(this.links, d => d.target.data.id);
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
    //this.nodeSvg
    //    .select('circle')
    //        .attr('r', 0)
    //        .transition()
    //            .duration(300)
    //            .attr('r', d => this.radius(d));
    this.nodeSvg.exit()
        .style('opacity', 0)
        //.transition()
        //    .duration(300)
        //    .attr('r', 0)
            .remove();

    this.nodeEnter = this.nodeSvg.enter()
        .append('g')
            .classed('node', true)
            .on('click', d => this.click(d))
            .on('mouseover', this.handleMouseOver)
            .on('mousemove', this.handleMouseMove)
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
};

module.exports = Tree;
