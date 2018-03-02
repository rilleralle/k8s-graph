'use strict';

module.exports = class K8sApiFetcher {

    constructor(name, url) {
        this.http = require('http');
        this.name = name;
        this.url = url;
    }

    setUrl(url) {
        this.url = url;
    }

    fetch() {
        return new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;

            this.http.get(this.url, this.handleApiResponse.bind(this)).on('error', (e) => {
                reject(`Request to k8s failed.\nError message: ${e.message}`);
            });
        });
    }

    handleApiResponse(res) {
        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', (chunk) => {
            rawData += chunk;
        });
        res.on('end', () => {
            try {
                this.resolve(JSON.parse(rawData));
            } catch (e) {
                this.reject(`Unable to fetch '${this.name}' from k8s response.\n`
                    + `Error message: ${e.message}\n`
                    + `--- response from k8s API call ---\n`
                    + `${rawData}\n`
                    + `--- response end ---\n`);
            }
        });
    }
};