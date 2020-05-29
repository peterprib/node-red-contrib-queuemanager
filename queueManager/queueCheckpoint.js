const logger = new (require("node-red-contrib-logger"))("Queue Checkpoint");
logger.sendInfo("Copyright 2020 Jaroslav Peter Prib");

module.exports = function(RED) {
	function QueueCheckpointNode(n) {
		RED.nodes.createNode(this,n);
		let node=Object.assign(this,n,{showStatus:true});
		node.status({ fill: "red", shape: "dot", text: "Not initialised by queue manager"});
		node.on('input', function (msg) {
			if(logger.active) logger.send({label:"on input",msg:msg._msgid});
			node.send(msg);
		});
	}
	RED.nodes.registerType(logger.label,QueueCheckpointNode);
};