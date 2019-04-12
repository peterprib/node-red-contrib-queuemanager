module.exports = function(RED) {
    function QueueCheckpointNode(n) {
        RED.nodes.createNode(this,n);
        var node=Object.assign(this,n);
        node.qm=RED.nodes.getNode(n.queueManager.id);
        node.on('input', function (msg) {
			node.send(msg);
        });
        node.qm.addCheckpointWrapper(node,node);
    }
    RED.nodes.registerType("Queue Checkpoint",QueueCheckpointNode);
};