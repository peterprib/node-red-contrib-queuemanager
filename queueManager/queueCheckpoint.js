const logger = new (require("node-red-contrib-logger"))("Queue Checkpoint");
logger.sendInfo("Copyright 2020 Jaroslav Peter Prib");

module.exports = function(RED) {
	function QueueCheckpointNode(n) {
		RED.nodes.createNode(this,n);
		let queueCheckpointNode=Object.assign(this,n,{showStatus:true});
		queueCheckpointNode.status({ fill: "red", shape: "dot", text: "Not initialised by queue manager"});
		queueCheckpointNode.on('input', function (msg) {
			if(logger.active) logger.send({label:"on input",msg:msg._msgid});
			try{
				queueCheckpointNode.send(msg);
			} catch(ex) {
				
				logger.sendError({label:"send",msg:msg._msgid,error:ex.message,stack:ex.stack});
			}
		});
	}
	RED.nodes.registerType(logger.label,QueueCheckpointNode);
};