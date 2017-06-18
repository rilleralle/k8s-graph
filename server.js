'use strict';

var express = require('express')
var http = require('http');
var app = express();
var server = http.createServer(app);
var io = require('socket.io').listen(server);

const PORT = 3000;

function extractInformation(parsedData) {
    //Circles
    var minions = parsedData.items.map(function(item) {
        return item.spec.nodeName;
    });
    minions = [...new Set(minions)];
    var minions = minions.map(function(item) {
        return {id: item, size: 30, text: item, color: item};
    });
    while (minions.length < 4) {
        minions.push({id: 'dummy'+minions.length, size: 30, color: 'dummy'})
    }
    const pods = parsedData.items.map(function(item) {
        return {
            id: item.metadata.name,
            text: item.metadata.name,
            size: 15,
            color: item.metadata.labels.app};
    });
    const nodes = [{id: 'Master', size: 30, text: 'Master'}].concat(minions).concat(pods);

    //Links
    const links = parsedData.items.map(function(item) {
        return {source: item.metadata.name, target: item.spec.nodeName, length: 300};
    });
    minions.forEach(function(item) {
        links.push({source: item.id, target: 'Master', length: 600});
    });

    return {links: links, nodes: nodes};
}

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/k8s.html');
});

io.on('connection', function(socket){
    console.log('a user connected');
    poll();
});

function poll() {
    http.get('http://127.0.0.1:8001/api/v1/namespaces/default/pods', (res) => {

        let error;
        if (res.statusCode !== 200) {
            error = new Error('Request Failed.\n' +
                'Status Code: ${statusCode}');
        }
        if (error) {
            console.error(error.message);
            // consume response data to free up memory
            res.resume();
            return;
        }

        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
            try {
                const parsedData = JSON.parse(rawData);
                const result = extractInformation(parsedData);
                io.emit('update', result);
            } catch (e) {
                io.emit('error', e.message);
                console.error(e.message);
            }
        });
    }).on('error', (e) => {
        io.emit('error', e.message);
        console.error('Got error: ${e.message}');
    });
}
setInterval(poll, 1000);

server.listen(PORT);
console.log('Running on http://localhost:' + PORT);