const logger = new (require("node-red-contrib-logger"))("Queue Rollback");
logger.sendInfo("Copyright 2020 Jaroslav Peter Prib");

module.exports = function(RED) {
	function QueueRollbackNode(n) {
		RED.nodes.createNode(this,n);
		var queueRollbackNode=Object.assign(this,n,{showStatus:true});
		queueRollbackNode.status({fill:"red", shape:"dot", text: "Not initialised by queue manager"});
		queueRollbackNode.on('input', function (msg) {
			if(logger.active) logger.send({label:"on input",msg:msg._msgid});
			try{
				queueRollbackNode.send(msg);
			} catch(ex) {
				logger.sendError({label:"send",msg:msg._msgid,error:ex.message,stack:ex.stack});
			}
		});
	}
	RED.nodes.registerType(logger.label,QueueRollbackNode);
};
