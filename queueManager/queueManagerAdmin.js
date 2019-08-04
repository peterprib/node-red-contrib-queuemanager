const ts=(new Date().toString()).split(' ');
console.log([parseInt(ts[2],10) ,ts[1],ts[4]].join(' ')+" - [info] queueManagerAdmin Copyright 2019 Jaroslav Peter Prib");		
let debug=true;
function setMaxActive(q,n) {
	q.maxActive=n;
}
module.exports = function(RED) {
    function QueueManagerAdminNode(n) {
        RED.nodes.createNode(this,n);
        let node=Object.assign(this,n);
//       node.QM=RED.nodes.getNode(node.queueManager);
//    	node.qm.addStatusCheck.apply(node.QM,[node]);
        node.on('input', function (msg) {
        	switch (msg.topic) {
        		case 'list':
        			msg.payload=node.qm.qmList.apply(node.QM,[RED]);
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
        			node.qm.checkLoop.apply(node.QM);
        			break;
        		case 'set':
        			Object.assign(node.QM,msg.payload);
        			break;
        		default:
        			msg.payload={error:"unknown topic"};
        	}
			node.send(msg);
        });
		RED.events.on("nodes-started",function() {
			node.status({ fill:"red", shape:"dot", text: "Queue manager initialisation "});
   			node.log("Initialising for queue manager "+node.queueManager);
	        node.qm=RED.nodes.getNode(node.queueManager);
			node.qm.addStatusCheck.apply(node.qm,[node]);
		});

    }
    RED.nodes.registerType("Queue Manager Admin",QueueManagerAdminNode);
};

