const Logger = require("node-red-contrib-logger");
const logger = new Logger("queueRollback");
logger.sendInfo("Copyright 2020 Jaroslav Peter Prib");

module.exports = function(RED) {
    function QueueRollbackNode(n) {
        RED.nodes.createNode(this,n);
        var node=Object.assign(this,n,{showStatus:true});
		node.status({ fill:"red", shape:"dot", text: "Not initialised by queue manager"});
        node.on('input', function (msg) {
        	node.send(msg);
        });
    }
    RED.nodes.registerType("Queue Rollback",QueueRollbackNode);
};