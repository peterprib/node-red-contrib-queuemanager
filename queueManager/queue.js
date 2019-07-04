const ts=(new Date().toString()).split(' ');
console.log([parseInt(ts[2],10),ts[1],ts[4]].join(' ')+" - [info] queue Copyright 2019 Jaroslav Peter Prib");
module.exports = function(RED) {
    function QueueNode(n) {
        RED.nodes.createNode(this,n);
        var node=Object.assign(this,{active:0},n);
        node.on('input', function (msg) {
			node.send(msg);
        });   
		RED.events.on("nodes-started",function() {
	        if(node.queueManager) {
	        	node.qm=RED.nodes.getNode(node.queueManager.id);
	        	if(node.qm) {
	       			node.log("adding wrapper for queue manager "+node.queueManager.id);
	                node.qm.addQueueWrapper(node,node);
	        	} else {
	       			node.error("Queue Manager not "+node.queueManager.id+" found");
	           		node.status({ fill: 'red', shape: 'ring', text: "Queue Manager node not found" });
	        	}
	        } else {
	   			node.error("Queue Manager not defined");
	       		node.status({ fill: 'red', shape: 'ring', text: "Queue Manager not defined" });
	        }
		});
    }
    RED.nodes.registerType("Queue",QueueNode);
};