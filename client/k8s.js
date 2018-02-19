"use strict";

let runSimulation = true;
let stickyObjects = false;
let textVisibility = true;
// if true pod stroke with will be increased by number of restarts
let isRestartStroke = false;

const svg = d3.select("svg"),
    width = "100%",
    height = "100%",
    color = d3.scaleOrdinal(d3.schemeCategory10),
    nodes = [],
    links = [],
    div = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0),
    simulation = d3.forceSimulation()
        .force("center", d3.forceCenter(100, 300))
        .force("charge", d3.forceManyBody(-1000))
        .force("collide", d3.forceCollide((d) => d.size * 2))
        .force("link", d3.forceLink(links).id((d) => d.id).distance((d) => d.length))
        .alphaTarget(.01)
        .on("tick", ticked);

svg.append("rect")
    .attr("width", width)
    .attr("height", height)
    .style("fill", "none")
    .style("pointer-events", "all")
    .call(d3.zoom()
        .on("zoom", zoomed));
let g = svg.append("g"),
    link = g.append("g").attr("class", "link").attr("stroke", "#000").selectAll(".link"),
    node = g.append("g").attr("class", "node").attr("stroke", "#000").selectAll(".node"),
    text = g.append("g").attr("class", "text").selectAll(".text");
restart();

function restart() {
    // Nodes
    node = node.data(nodes, d => d.id + d.restarts);
    node.exit().remove();
    node = node.enter().append("path").merge(node);
    node.attr("d", d3.symbol()
        .size(function (d) {
            return d.size * 100
        })
        .type(function (d) {
            if (d.type === "Node") {
                return d3.symbolSquare;
            } else if (d.type === "Master") {
                return d3.symbolStar;
            } else {
                return d3.symbolCircle;
            }
        }))
        .attr("fill", function (d) {
            return color(d.color);
        })
        .attr("class", "node")
        .attr("stroke-width", function (d) {
            let size = d.size * 0.15;
            let restartWidth = d.restarts && isRestartStroke ? d.restarts : 0;
            return size + restartWidth;
        })

        .on("mouseover", function (d) {
            div.transition()
                .duration(500)
                .style("opacity", .8);
            let html = `Type: ${d.type}<br>Name: ${d.text}`;
            if (d.type === "Pod") {
                html += `<ul>`;
                d.containers.forEach((container) => {
                    html += `<li>Image: ${container.image}, Restarts: ${container.restartCount}</li>`;
                });
                html += `</ul>`;
                html += `Status: ${d.status}`
            }
            div.html(html)
                .style("left", (d3.event.pageX + 30) + "px")
                .style("top", (d3.event.pageY) + "px");
        })
        .on("mouseout", function () {
            div.transition()
                .duration(0)
                .style("opacity", 0);
        })
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));

    node.classed("start", function (d) {return d.status == "start"});
    node.classed("delete", function (d) {return d.status == "delete"});
    node.classed("pulse", function (d) {return d.status == "pulse"});
    node.classed("notReady", function (d) {return d.status == "notReady"});

    // Links
    link = link.data(links, d => d.source.id + d.target.id);
    link.exit().remove();
    link = link.enter()
        .append("line")
        .attr("class", "line")
        .attr("stroke-width", 2)
        .style("stroke-dasharray", function (d) {
            return d.dotted ? ("3, 3") : ("1, 0")
        })
        .merge(link);

    // Text
    text = text.data(nodes, d => d.id);
    text.exit().remove();
    text = text.enter().append("text").merge(text);
    text.attr("class", "text")
        .attr("font-size", function (d) { return d.size })
        .text(function (d) {
            let text = d.text;
            if (d.type === "Pod") {
                text = text + `, Restarts: ${d.restarts}`;
            }
            return text;
        });

    // Update simulation
    simulation.nodes(nodes);
    simulation.force("link").links(links);
}

function ticked() {
    svg.selectAll("path")
        .attr("transform", function (d) {
            return "translate(" + d.x + "," + d.y + ")";
        });

    node.attr("cx", function (d) { return d.x; })
        .attr("cy", function (d) { return d.y; });

    link.attr("x1", function (d) { return d.source.x; })
        .attr("y1", function (d) { return d.source.y; })
        .attr("x2", function (d) { return d.target.x; })
        .attr("y2", function (d) { return d.target.y; });

    text.attr("x", function (d) { return d.x + d.size * 1.8; })
        .attr("y", function (d) { return d.y; })
        .attr("dy", "0.35em");
}

function dragstarted(d) {
    if (!d3.event.active) {
        simulation.alphaTarget(0.3).restart();
    }

    d.fx = d.x;
    d.fy = d.y;
}

function dragged(d) {
    d.fx = d3.event.x;
    d.fy = d3.event.y;
}

function dragended(d) {
    if (!d3.event.active) {
        simulation.alphaTarget(0);
    }
    if (!stickyObjects) {
        d.fx = null;
        d.fy = null;
    }
}

function zoomed() {
    g.attr("transform", d3.event.transform);
}

// Socket connection to server
let socket = io();
// Handle updates
socket.on('update', function(msg) {
    function updateNodes(nodesFromServer) {
        // Delete
        nodes.forEach((node, index, array) => {
            if (nodesFromServer.find(item => item.id === node.id) === undefined) {
                array.splice(index, 1);
                simulation.alpha(.01).restart();
            }
        });

        nodesFromServer.forEach(node => {
            const findNode = nodes.find(item => item.id === node.id);
            // Insert
            if (findNode === undefined) {
                nodes.push(node);
                // Update metadata
            } else if (findNode.status !== node.status || findNode.restarts != node.restarts) {
                findNode.status = node.status;
                findNode.restarts = node.restarts;
                findNode.containers = node.containers;
                simulation.alpha(.01).restart();
            }
        });
    }

    function updateLinks(linksFromServer) {
        let i = 0;
        // Delete
        links.forEach(link => {
            if (linksFromServer.find(item => item.source === link.source.id && item.target === link.target.id) === undefined) {
                links.splice(i, 1);
                simulation.alpha(.01).restart();
            }
            i++;
        });

        // Insert
        linksFromServer.forEach(link => {
            if (links.find(item => item.source.id === link.source && item.target.id === link.target) === undefined) {
                links.push(link);
                simulation.alpha(.01).restart();
            }
        });
    }

    if (runSimulation) {
        updateNodes(msg.nodes);
        updateLinks(msg.links);
        restart();
    }
}).on('error', function(error) {
    console.error("Error from server: " + error);
});

function toggleStickyObjects() {
    stickyObjects = !stickyObjects;
}

function toggleTextVisibility() {
    textVisibility = !textVisibility;
    text.attr("visibility", textVisibility ? "visible" : "hidden");
}

function changeNamespace(namespace) {
    socket.emit("changeNamespace", namespace);
}