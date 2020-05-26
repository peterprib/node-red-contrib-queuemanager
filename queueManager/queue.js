const Logger = require("node-red-contrib-logger");
const logger = new Logger("queue");
logger.sendInfo("Copyright 2020 Jaroslav Peter Prib");

function addInputWrapper(RED,node) {
	logger.sendInfo("addInputWrapper - once off on first message");
    node.on('input', function (msg) {
		node.send(msg);
	});
	const qm=RED.nodes.getNode(node.queueManager);
	if(qm) {
		qm.addQueueWrapper.apply(qm,[node,node]);
	} else {
		const error="queue manager not defined";
		node.status({ fill: "red", shape: "dot", text: error});
		node.error(error);
	}
}
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
    RED.httpAdmin.get("/queue/:id/:action/",  function(req,res) {
    	var node = RED.nodes.getNode(req.params.id);
    	if (node && node.type==="Queue") {
    	    try {
    	    	node.warn("Request to "+req.params.action);
    	    	let qm=RED.nodes.getNode(node.queueManager);
    	    	if(!qm) throw Error("Queue Manager "+node.queueManager+" not found");
    	    	switch (req.params.action) {
    	    		case 'empty':
    	       	    	qm.emptyQueue(node.qm.q);
    	       	     	break;
    	    		case 'debug':
    	       	    	qm.debugToggle.apply(qm,[RED])
    	       	     	break;
    	    		case 'getMessages':
    	       	    	res.status(200).json(qm.getMessages(node.qm.q));
    	       	     	return;
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