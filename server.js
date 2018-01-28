'use strict';

const express = require('express');
const http = require('http');
const app = express();
const server = http.createServer(app);
const io = require('socket.io').listen(server);

const port = 3000;

const masterSize = getEnvVar('masterSize', 30);
const minionSize = getEnvVar('minionSize', 30);
const podSize = getEnvVar('podSize', 15);
const linkSizePodToMinion = getEnvVar('linkSizePodToMinion', 800);
const linkSizeMinionToMaster = getEnvVar('linkSizeMinionToMaster', 1000);
const dummyNodes = getEnvVar('dummyNodes', 0);
const podsApiUrl = getEnvVar('podsApiUrl', 'http://127.0.0.1:8001/api/v1/namespaces/default/pods');
const pollingIntervalInSeconds = getEnvVar('pollingIntervalInSeconds', 1);

function getEnvVar(envVar, defaultValue) {
    const value = process.env[envVar];
    return value === undefined ? defaultValue : value;
}

function extractInformation(parsedData) {
    //Minions, the nodes of the k8s cluster
    let minions = parsedData.items.map(function(item) {
        return item.spec.nodeName;
    });
    minions = [...new Set(minions)];
    minions = minions.map(function(item) {
        return {id: item, size: minionSize, text: item, color: item, type: "Node"};
    });

    //Dummy nodes
    let i = 0;
    while (minions.length < dummyNodes) {
        minions.push({id: 'dummy'+i++, size: minionSize, color: 'dummy', type: "Node"})
    }

    //Pods
    const pods = parsedData.items.map(function(item) {
        return {
            id: item.metadata.name,
            text: item.metadata.name,
            size: podSize,
            color: item.metadata.labels.app === undefined ? item.metadata.labels.run : item.metadata.labels.app,
            type: "Pod"
        };
    });
    //Kubernetes master
    const k8sMaster = [{id: 'Master', size: masterSize, text: 'Master', type: "Master"}];
    //
    const nodes = k8sMaster.concat(minions).concat(pods);

    //Links
    //Pod to minion
    const links = parsedData.items.map(function(item) {
        return {source: item.metadata.name, target: item.spec.nodeName, length: linkSizePodToMinion, dotted: true};
    });
    //Minion to master
    minions.forEach(function(item) {
        links.push({source: item.id, target: 'Master', length: linkSizeMinionToMaster, dotted: false});
    });

    return {links: links, nodes: nodes};
}

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/k8s.html');
});

io.on('connection', function(){
    poll();
});

function poll() {
    http.get(podsApiUrl, (res) => {
        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
            try {
                const result = extractInformation(JSON.parse(rawData));
                io.emit('update', result);
            } catch (e) {
                handleError('Unable to parse and extract information from k8s response.\n'
                    + `Error message: ${e.message}\n`
                    + `--- response from k8s API call ---\n`
                    + `${rawData}\n`
                    + `--- response end ---\n`);
            }
        });
    }).on('error', (e) => {
        handleError(`Request to k8s failed.\nError message: ${e.message}`);
    });
}

function handleError(errorMessage) {
    console.error(errorMessage);
    io.emit('error', errorMessage);
}

setInterval(poll, 1000);

server.listen(port);
console.log('Running on http://localhost:' + port);