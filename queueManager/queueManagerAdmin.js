const logger = new (require("node-red-contrib-logger"))("Queue Manager Admin");
logger.sendInfo("Copyright 2020 Jaroslav Peter Prib");

let nodes=[];
module.exports = function(RED) {
	function QueueManagerAdminNode(n) {
		nodes.push(this);
		RED.nodes.createNode(this,n);
		let node=Object.assign(this,n);
		node.on('input', function (msg) {
			switch (msg.topic) {
			case 'list':
				msg.payload=node.qm.qmList.apply(node.qm,[RED]);
				break;
			case 'pause':
				if(node.qm.maxActive==0) {
					msg.payload="already paused";
					break;
				}
				node.qm.old.maxActive=node.qm.maxActive;
				node.qm.maxActive=0;
				msg.payload="paused";
				break;
			case 'release':
				node.qm.maxActive=node.qm.old.maxActive;
				msg.payload="released";
				break;
			case 'set':
				Object.assign(node.qm,msg.payload);
				break;
			case 'debugToggle':
				msg.payload=node.qm.debugToggle.apply(node.qm,[RED]);
				break;
			default:
				msg.payload={error:"unknown topic"};
			}
			node.send(msg);
		});
	}
	RED.events.on("flows-started",function() {
		while(nodes.length>0) {
			let node=nodes.pop();
			node.log("Initialising for queue manager "+node.queueManager);
			node.status({ fill:"red", shape:"dot", text: "Queue manager initialisation "});
			node.qm=RED.nodes.getNode(node.queueManager);
			node.qm.addStatusCheck.apply(node.qm,[node]);
		}
	});
	RED.nodes.registerType(logger.label,QueueManagerAdminNode);
};