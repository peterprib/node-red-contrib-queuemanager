const ts=(new Date().toString()).split(' ');
console.log([parseInt(ts[2],10),ts[1],ts[4]].join(' ')+" - [info] queueRollback Copyright 2019 Jaroslav Peter Prib");
module.exports = function(RED) {
    function QueueRollbackNode(n) {
        RED.nodes.createNode(this,n);
        var node=Object.assign(this,n);
        if(!n.queueManager|| n.queueManager===null) {
        	node.error("no queue manager defined");
        	return;
        }
        node.qm=RED.nodes.getNode(n.queueManager.id);
        node.on('input', function (msg) {
        	node.send(msg);
        });
		RED.events.on("nodes-started",function() {
   			node.log("adding rollback wrapper for queue manager "+node.queueManager.id);
	        node.qm=RED.nodes.getNode(n.queueManager.id);
	        node.qm.addRollbackWrapper(node,node);
		});
    }
    RED.nodes.registerType("Queue Rollback",QueueRollbackNode);
};