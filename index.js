let Server = require('./src');
let server = new Server();
server.start();

// Start polling information
const fetchHandler = () => {server.fetch().catch(() => {})};
setInterval(fetchHandler, server.pollingIntervalInSeconds * 1000);