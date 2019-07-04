const ts=(new Date().toString()).split(' ');
console.log([parseInt(ts[2],10),ts[1],ts[4]].join(' ')+" - [info] queueCheckpoint Copyright 2019 Jaroslav Peter Prib");
module.exports = function(RED) {
    function QueueCheckpointNode(n) {
        RED.nodes.createNode(this,n);
        var node=Object.assign(this,n);
        if(!node.queueManager|| node.queueManager===null) {
        	node.error("no queue manager defined");
        	return;
        }
        node.on('input', function (msg) {
			node.send(msg);
        });
		RED.events.on("nodes-started",function() {
   			node.log("adding checkpoint wrapper for queue manager "+node.queueManager.id);
	        node.qm=RED.nodes.getNode(node.queueManager.id);
			node.qm.addCheckpointWrapper(node,node);
		});
    }
    RED.nodes.registerType("Queue Checkpoint",QueueCheckpointNode);
};