const ts=(new Date().toString()).split(' ');
console.log([parseInt(ts[2],10),ts[1],ts[4]].join(' ')+" - [info] queue Copyright 2019 Jaroslav Peter Prib");
module.exports = function(RED) {
    function QueueNode(n) {
        RED.nodes.createNode(this,n);
        var node=Object.assign(this,{active:0},n);
        node.showStatus=true;
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
    
    RED.httpAdmin.get("/queue/:id/:action/",  function(req,res) {
    	var node = RED.nodes.getNode(req.params.id);
    	if (node && node.type==="Queue") {
    	    try {
    	    	let qm=RED.nodes.getNode(node.queueManager.id);
    	    	switch (req.params.action) {
    	    		case 'empty':
    	       	    	qm.emptyQueue(node.qm.q);
    	       	     	break;
    	    		case 'purge':
    	       	    	qm.purgeQueue(node.qm.q);
    	       	     	break;
    	       	     default:
    	       	    	 throw Error("unknown action: "+req.params.action);
    	    	}
    	    	node.warn("Request to empty queue");
    	        res.sendStatus(200);
    	    } catch(err) {
    	    	var reason1='Internal Server Error, queue empty failed '+err.toString();
    	        node.error(reason1);
    	        res.status(500).send(reason1);
    	    }
    	} else {
    		var reason2="request to empty queue failed for id:" +req.params.id;
//    		node.error(reason2);
    		res.status(404).send(reason2);
    	}
    });   

    
    RED.nodes.registerType("Queue",QueueNode);
};