# node-red-contrib-queuemanager


[Node-Red][1] nodes for queue managed of nodes.

![Queue Manager](queueManager/icons/icons8-networking-manager-64.png "Queue Manager") Management node which can turn other nodes to act like queue, checkpoint or rollback by wrappering base node input with queue manager input which is called before passing mEssage to input of node. For eample catch node can be made to act like rollback node.
 
![Queue](queueManager/icons/icons8-inbox-64.png "Queue") A queueing node which sets how many active messages can be active, maximum queue depth and a time out for the message.  

![Checkpoint](queueManager/icons/icons8-tollbooth-48.png "Checkpoint") A point that applies any commits in commit stack of message and activates next waiting message. Any node can add to commit stack by msg.commitStack.push({node:aNode,action:afunction})

![Rollback](queueManager/icons/icons8-explosion-96.png "Rollback") A point that applies any rollbacks in rollback stack of message and activates next waiting message. Any node can add to rollback stack by msg.rollbackStack.push({node:aNode,action:afunction})

 
# Install

Run the following command in the root directory of your Node-RED install

    npm install node-red-contrib-queuemanager


Test/example flow in test/testflow.json


# Author

[Peter Prib][3]


[1]: http://nodered.org
[2]: https://www.npmjs.com/package/queuemanager
[3]: https://github.com/peterprib
