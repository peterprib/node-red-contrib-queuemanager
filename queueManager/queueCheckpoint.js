const ts=(new Date().toString()).split(' ');
console.log([parseInt(ts[2],10),ts[1],ts[4]].join(' ')+" - [info] queueCheckpoint Copyright 2019 Jaroslav Peter Prib");
module.exports = function(RED) {
    function QueueCheckpointNode(n) {
        RED.nodes.createNode(this,n);
        var node=Object.assign(this,n,{showStatus:true});
		node.status({ fill: "red", shape: "dot", text: "Not initialised by queue manager"});
        node.on('input', function (msg) {
			node.send(msg);
        });
    }
    RED.nodes.registerType("Queue Checkpoint",QueueCheckpointNode);
};