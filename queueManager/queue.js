const ts=(new Date().toString()).split(' ');
console.log([parseInt(ts[2],10),ts[1],ts[4]].join(' ')+" - [info] queue Copyright 2019 Jaroslav Peter Prib");
module.exports = function(RED) {
    function QueueNode(n) {
        RED.nodes.createNode(this,n);
        var node=Object.assign(this,{active:0,showStatus:true},n);
		node.status({ fill: "red", shape: "dot", text: "Not initialised by queue manager"});

        node.on('input', function (msg) {
			node.send(msg);
        });
/*
		RED.events.setMaxListeners(RED.events.getMaxListeners()+1);
		RED.events.on("nodes-started",function() {
	       	node.log("connecting to Queue Manager "+node.queueManager);
			node.status({ fill:"red", shape:"dot", text: "Queue manager initialisation "});
	        node.qm=RED.nodes.getNode(node.queueManager);
	        node.log("adding wrapper for queue manager "+node.qm.name);
	        node.qm.addQueueWrapper(node,node);
		});
*/    
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
    	    		case 'hold':
    	       	    	qm.setMaxActive(node.qm.q,0);
    	       	     	break;
    	    		case 'release':
    	       	    	qm.setMaxActive(node.qm.q,node.maxActive);
    	       	     	break;
    	    		case 'release1':
    	       	    	qm.release1(node.qm.q);
    	       	     	break;
    	       	     default:
    	       	    	 throw Error("unknown action: "+req.params.action);
    	    	}
    	    	node.warn("Request to "+req.params.action);
    	        res.sendStatus(200);
    	    } catch(err) {
    	    	var reason1='Internal Server Error, '+req.params.action+' failed '+err.toString();
    	        node.error(reason1);
    	        res.status(500).send(reason1);
    	    }
    	} else {
    		var reason2="request to "+req.params.action+" failed for id:" +req.params.id;
    		res.status(404).send(reason2);
    	}
    });   
    
    RED.nodes.registerType("Queue",QueueNode);
};