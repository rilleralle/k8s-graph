'use strict';

module.exports = class Server {

    constructor() {
        this.express = require('express');
        this.hbs = require('express-hbs');
        this.http = require('http');
        this.app = this.express();
        this.server = this.http.createServer(this.app);
        this.io = require('socket.io').listen(this.server);

        this.port = 3000;

        this.masterSize = this.getEnvVar('masterSize', 15);
        this.minionSize = this.getEnvVar('minionSize', 15);
        this.podSize = this.getEnvVar('podSize', 15);
        this.linkSizePodToMinion = this.getEnvVar('linkSizePodToMinion', 150);
        this.linkSizeMinionToMaster = this.getEnvVar('linkSizeMinionToMaster', 250);
        this.dummyNodes = this.getEnvVar('dummyNodes', 0);
        this.namespacesUrl = this.getEnvVar('namespacesUrl', 'http://127.0.0.1:8001/api/v1/namespaces/');
        this.nodesUrl = this.getEnvVar('nodesApiUrl', 'http://127.0.0.1:8001/api/v1/nodes/');
        this.pollingIntervalInSeconds = this.getEnvVar('pollingIntervalInSeconds', 1);

        this.namespace = "default";
        this.podsResult;
        this.nodesResult;
        this.namespaces;

        let K8sApiFetcher = require('./k8sApiFetcher');
        this.namespaceFetcher = new K8sApiFetcher('namespace', this.namespacesUrl);
        this.nodesFetcher = new K8sApiFetcher('nodes', this.nodesUrl);
        this.podsFetcher = new K8sApiFetcher('pods', this.getPodsUrl());

        this.app.use(this.express.static(__dirname + '/../client'));
        this.app.engine('hbs', this.hbs.express4({}));
        this.app.set('view engine', 'hbs');
        this.app.set('views', __dirname + '/../client');

        this.io.on('connection', (socket) => {
            socket.on('changeNamespace', (newNamespace) => {
                this.namespace = newNamespace;
                this.podsFetcher.setUrl(this.getPodsUrl());
            });
        });

        console.log('Running on http://localhost:' + this.port);
    }

    /**
     * Get the pods url for a selected namespace.
     * @returns {string}
     */
    getPodsUrl() {
        return `${this.namespacesUrl}${this.namespace}/pods`;
    }

    getEnvVar(envVar, defaultValue) {
        const value = process.env[envVar];
        return value === undefined ? defaultValue : value;
    }

    extractInformation() {
        //Extract master and minions nodes
        let {master, minions} = this.extractNodes();

        //Pods
        const pods = this.extractPods();

        //Merge minions (also the master node) and pods
        const nodes = minions.concat(pods);

        //Links
        const links = this.extractLinks(master, minions);

        return {links: links, nodes: nodes};
    }

    extractLinks(master, minions) {
        //Pod to minion
        const links = this.podsResult.items.map(function (item) {
            return {
                source: item.metadata.name,
                target: item.spec.nodeName,
                length: this.linkSizePodToMinion,
                dotted: true
            };
        }, this);
        //Minion to master
        if (master) {
            minions.forEach(function (item) {
                links.push({source: item.id, target: master, length: this.linkSizeMinionToMaster, dotted: false});
            }, this);
        }
        return links;
    }

    extractPods() {
        return this.podsResult.items.map(function (item) {
            let status = "";
            if (item.metadata.deletionTimestamp) {
                status = "delete";
            } else if (item.status.phase === "Pending") {
                status = "start";
            } else if (item.status.conditions.find((item) => {
                    return item.type === "Ready" && item.status === "False"
                })) {
                status = "notReady";
            } else {
                status = "ready"
            }

            const restartCount = item.status.containerStatuses
                .map((item) => item.restartCount)
                .reduce((sum, value) => sum + value);

            return {
                id: item.metadata.name,
                text: item.metadata.name,
                size: this.podSize,
                color: item.metadata.labels.app === undefined ? item.metadata.labels.run : item.metadata.labels.app,
                status: status,
                type: "Pod",
                restarts: restartCount,
                containers: item.status.containerStatuses
            };
        }, this);
    }

    extractNodes() {
        let master;
        let minions = this.nodesResult.items.map(function (item) {
            const conditions = item.status.conditions.find((item) => {
                return item.type === "Ready"
            });
            let node = {
                id: item.metadata.name,
                size: this.minionSize,
                text: item.metadata.name,
                color: item.metadata.name,
                type: "Node",
                status: conditions.status !== "True" ? "pulse" : ""
            };

            // Looks like this is how we can identify the master
            const isMaster = item.spec.taints;
            // Set master relevant configuration
            if (isMaster) {
                master = item.metadata.name;
                node.type = "Master";
                node.size = this.masterSize;
            }

            return node;
        }, this);

        if (!master) {
            console.log("Could not identify master node. Please check if k8s update was a breaking change.");
        }

        //Dummy nodes
        let i = 0;
        while (minions.length < this.dummyNodes) {
            minions.push({id: 'dummy' + i++, size: this.minionSize, color: 'dummy', type: "Node"})
        }
        return {master, minions};
    }

    /**
     * Start the express server.
     */
    start() {
        this.fetchNamespaces();
        this.app.get('/', (request, response) => {
            this.fetchNamespaces();
            response.render('k8s',
                {
                    namespaces: this.namespaces
                });
        });
        this.server.listen(this.port);
    }

    stop() {
        this.server.close();
    }

    /**
     * Fetch available namespace from K8S api.
     */
    fetchNamespaces() {
        this.namespaceFetcher.fetch().then(result => {
            this.namespaces = result.items.map((item) => item.metadata.name);
        }).catch(error => {
            this.handleError(error);
        });
    }

    /**
     * Fetch information from K8S to build the graph
     * and notify socket.io clients.
     */
    fetch() {
        return new Promise((resolve, reject) => {
            this.podsFetcher.fetch().then(result => {
                this.podsResult = result;
                return this.nodesFetcher.fetch();
            }).then(result => {
                this.nodesResult = result;
                const k8sResult = this.extractInformation();
                this.io.emit('update', k8sResult);
                resolve(k8sResult);
            }).catch(error => {
                this.handleError(error);
                reject(error);
            });
        });
    }

    /**
     * Log error and notify socket.io clients.
     *
     * @param errorMessage
     */
    handleError(errorMessage) {
        console.error(errorMessage);
        this.io.emit('error', errorMessage);
    }
};