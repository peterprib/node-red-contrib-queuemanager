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
        node.qm.addRollbackWrapper(node,node);
    }
    RED.nodes.registerType("Queue Rollback",QueueRollbackNode);
};