module.exports = function(RED) {
    function QueueNode(n) {
        RED.nodes.createNode(this,n);
        var node=Object.assign(this,{active:0},n);
        node.qm=RED.nodes.getNode(n.queueManager.id);
        node.on('input', function (msg) {
			node.send(msg);
        });
        node.qm.addQueueWrapper(node,node);
    }
    RED.nodes.registerType("Queue",QueueNode);
};

