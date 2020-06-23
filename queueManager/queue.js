const logger = new (require("node-red-contrib-logger"))("Queue");
logger.sendInfo("Copyright 2020 Jaroslav Peter Prib");

module.exports = function(RED) {
	function QueueNode(n) {
		RED.nodes.createNode(this,n);
		var node=Object.assign(this,{active:0,showStatus:true},n);
		node.status({ fill: "red", shape: "dot", text: "Not initialised by queue manager"});
		node.on('input', function (msg) {
			if(logger.active) logger.send({label:"on input",msg:msg._msgid});
			node.send(msg);
		});
	}
	RED.httpAdmin.get("/queue/:id/:action", RED.auth.needsPermission('admin.write'), function(req,res) {
		const warning="Request to "+req.params.action;
		logger.sendWarning(warning);
		let node=RED.nodes.getNode(req.params.id);
		if (node && node.type===logger.label) {
			try {
				node.warn(warning);
				let qm=RED.nodes.getNode(node.queueManager);
				if(!qm) throw Error("Queue Manager "+node.queueManager+" not found");
				switch (req.params.action) {
				case 'activeUp1':
//					qm.activeUp1.apply(node.qm.q,[RED]);
					qm.activeUp1(node.qm.q);
					break;
				case 'activeDown1':
					qm.activeDown1(node.qm.q);
//					qm.activeDown1.apply(node.qm.q,[RED]);
					break;
				case 'debug':
					qm.debugToggle.apply(qm,[RED]);
					break;
				case 'empty':
					qm.emptyQueue(node.qm.q);
					break;
				case 'getMessages':
					res.status(200).json(qm.getMessages(node.qm.q));
					return;
				case 'hold':
					qm.hold(node.qm.q);
					break;
				case 'holdAndRollbackActive':
					qm.holdAndRollbackActive(node.qm.q);
				case 'purge':
					qm.purgeQueue(node.qm.q);
					break;
				case 'release':
					qm.release(node.qm.q,node.maxActive);
					break;
				case 'release1':
					qm.release1(node.qm.q);
					break;
				case 'rollbackActive':
					qm.rollbackActive(node.qm.q);
					break;
				default:
					throw Error("unknown action: "+req.params.action);
				}
				res.sendStatus(200);
			} catch(ex) {
				const error='Internal Server Error, '+req.params.action+' failed '+ex.toString();
				node.error(error);
				res.status(500).send(error);
			}
		} else {
			const error="request to "+req.params.action+" failed for id:" +req.params.id +(node?" node type: "+node.type :" node not found");
			logger.sendErrorAndDump(error,node);
			res.status(404).send(error);
		}
	});   
	RED.nodes.registerType(logger.label,QueueNode);
};