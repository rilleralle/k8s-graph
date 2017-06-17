'use strict';

const express = require('express');
const http = require('http');
const PORT = 3000;

// App
const app = express();
app.get('/', function (req, res) {
    let getRes = res;
    http.get('http://127.0.0.1:8001/api/v1/namespaces/default/pods', (res) => {

        let error;
        if (res.statusCode !== 200) {
            error = new Error('Request Failed.\n' +
                `Status Code: ${statusCode}`);
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
                console.log(parsedData.items);
                console.log(parsedData);
                getRes.send(rawData);
            } catch (e) {
                console.error(e.message);
            }
        });
    }).on('error', (e) => {
        console.error(`Got error: ${e.message}`);
    });

});

app.listen(PORT);
console.log('Running on http://localhost:' + PORT);