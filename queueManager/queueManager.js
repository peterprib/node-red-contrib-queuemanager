function isQmNode(t) {
	return ["Queue Manager","Queue","Queue Checkpoint","Queue Rollback"].includes(t);
}
function checkChanges(RED,current,revised,add,remove,change) {
	var n,nn;

	if(change) {
		for(n in current ) {
			  if (revised.hasOwnProperty(n)) {
				  Object.assign(current[n],revised[n]);
			  }
		}
	}
	
	if(remove) {
		for(n in current ) {
			  if (revised.hasOwnProperty(n)) {continue;}
			  nn=RED.nodes.getNode(n);
			  if(nn) {
				  if(isQmNode(nn.type)) {continue;}
				  remove.apply(this,[nn]);
			  } else {
				  this.log("check changes on remove current node not found: "+n);
			  }
		}
	}
	if(add) {
		for(n in revised ) {
			  if (current.hasOwnProperty(n)) {continue;}
			  nn=RED.nodes.getNode(n);
			  if(nn) {
				  if(isQmNode(nn.type)) {continue;} 
				  add.apply(this,[nn,revised[n]]);
			  } else {
				  this.error("check changes new node not found: "+n);
			  }
		}
	}
}

function activateMessage(msg) {
	++msg.qm.q.activeCnt;
	msg.qm.activeStartTime=Date.now();
	msg.qm.q.active[msg._msgid]=msg;
	this.active++;
	try{
		msg.qm.q.inputListener.apply(msg.qm.q.node,[msg]);        	
	} catch(e) {
		this.error("activateMessage failed: "+e);
	}
}
function inputWrapper(msg) {
	if(!this.qm) {
		return;
	}
	if(!msg.hasOwnProperty("rollbackStack")) {
		msg.rollbackStack=[];
		msg.rollback=rollback;
	}
	msg.rollbackStack.push({node:this,
		action: function() {
				this.error("rollback message: "+msg._msgid);
			}
		});
	var q=this.qm.q;
	msg.qm={startTime:Date.now(),q:q,node:this};
	q.inCnt++;
	if(q.activeCnt<q.maxActive && this.active < this.maxActive) {
		activateMessage.apply(this,[msg]);
		return;
	}
	if(q.waiting.length>q.maxWaiting) {
		throw Error("Too many messages queued. Could be DoS attack, noded latency bad, or logic bug");
	}
	q.waiting.push(msg);
}
function removeQueueWrapper (n) {
	n.removeListener('input', n.qm.q.inputListener);
	n.on('input',n.qm.q.inputListener);
	delete n.qm;
}
function addQueueWrapper (n,o) {
	this.log("adding queue input wrapper for node "+n.id);
	this.queues[n.id]={node:n,
			maxTime:(o.maxTime||60000),
			maxActive:(o.maxActive||10),
			maxWaiting:(o.maxWaiting||1000),
			waiting:[],
			active:{},
			activeCnt:0,
			inCnt:0,
			outCnt:0,
			rollbackCnt:0,
			timeOutCnt:0};
	n.qm={inputListener:n.listeners('input')[0],q:this.queues[n.id]};
	n.qm.q.inputListener=n.listeners('input')[0];
	n.removeListener('input', n.qm.q.inputListener);
	n.on('input',inputWrapper);
}
function remCheckpointWrapper (n) {
	this.log("removing checkpoint wrapper to node "+n.id);
	delete this.checkpoints[n.id];
	n.send=n.orginalsend;
}
function addCheckpointWrapper (n) {
	this.log("adding checkpoint wrapper to node "+n.id);
	this.checkpoints[n.id]=true;
	n.orginalsend=n.send;
	n.send = function(msg) {
		if(!msg.qm) {
			n.error("message missing queue manager so dropped",msg);
			n.orginalsend.apply(n,[]);
			return;
		}
		commit(msg);
		SetEndActive(msg);
		msg.qm.q.outCnt++;
    	delete msg.qm.q.active[msg._msgid];
    	delete msg.qm;
    	n.orginalsend.apply(n,arguments); //saved send
	};
}
function removeRollbackWrapper (n) {
	this.log("removing checkpoint wrapper to node "+n.id);
	delete this.rollbacks[n.id];
	n.send=n.orginalsend;
}
function addRollbackWrapper (n) {
	this.log("adding rollback send wrapper to node "+n.id);
	if(!this.rollbacks) {this.rollbacks={};}
	this.rollbacks[n.id]=true;
	n.orginalsend=n.send;
	n.send = function(msg) {
		if(!msg.qm) {
			n.error("message missing queue manager so dropped",msg);
			n.orginalsend.apply(n,[]);
			return;
		}
		msg.qm.q.rollbackCnt++;
		rollback(msg);
		SetEndActive(msg);
		n.orginalsend.apply(n,[msg]);
	};
}
function SetEndActive(msg) {
	if(msg.qm.q.waiting.length>0) {
		activateMessage.apply(msg.qm.q.node,[msg.qm.q.waiting.pop()]);
	}
	msg.qm.active--;
	msg.qm.q.activeCnt--;
	delete msg.qm.q.active[msg._msgid];
}
function rollback(msg) {
	msg.attempts=msg.attempts++||0;
	if(msg.rollbackStack) {
		for(var r of msg.rollbackStack) {
			try{
				r.action.apply(r.node,[msg]);
			} catch(e) {
				try{
					r.node.error("rollback failed for node: "+r.node.id+" reason: "+e,msg);
				} catch(e) {
					console.error("rollback failed as rollbackStack has bad entry for node reason: "+e+" stack entry properties:" +r);
					if(r instanceof Object) {
						console.error("   stack entry properties:" +Object.keys(r));
						if(r.node) {
							console.error("   node properties:" +Object.keys(r.node));
						}
					}
				}
			}
		}
	}
}
function commit(msg) {
	if(msg.commitStack) {
		for(var r in msg.rollbackStack) {
			r.action.apply(r.node,[msg]);
		}
	}
}
function qmList(RED) {
	var q,n,queues={};
	for (var p in this.queues) {
		q=this.queues[p];
		n=RED.nodes.getNode(p);
		queues[p]={
			id:p,
			name:(n.name||"*** node not found"),
			maxTime:q.maxTime,
			maxActive:q.maxActive,
			active:q.activeCnt,
			maxWaiting:q.maxWaiting,
			waiting:q.waiting.length,
			inCount:q.inCnt,
			outCount:q.outCnt,
			timeOutCount:q.timeOutCnt,
			rollbackCount:q.rollbackCnt
		};
	}
	return {queues:queues, active:(this.active||0), checkpoints:this.checkpoints, rollbacks:this.rollbacks};
}
module.exports = function(RED) {
    function QueueManagerNode(n) {

        RED.nodes.createNode(this,n);
        var node=Object.assign(this,{active:0,checkInterval:1000,queues:{},checkpoints:{},rollbacks:{}},n);
        node.old={maxActive:node.maxActive,maxWaiting:node.maxWaiting};
        node.addQueueWrapper=addQueueWrapper;
        node.addCheckpointWrapper=addCheckpointWrapper;
        node.addRollbackWrapper=addRollbackWrapper;
        node.checkChanges=checkChanges;
        node.qmList=qmList;
        node.rollback=rollback;

        RED.events.on("nodes-started",function() {
            node.log("All nodes have started now adding wrappers");
            try{
            	node.checkChanges(RED,node.queues,n.setqueues,node.addQueueWrapper,node.removeQueueWrapper);
                node.log("Queue wrappers processed");
            	node.checkChanges(RED,node.checkpoints,n.setcheckpoints,node.addCheckpointWrapper,node.removeCheckpointWrapper);
                node.log("Checkpoint wrappers processed");
            	node.checkChanges(RED,node.rollbacks,n.setrollbacks,node.addRollbackWrapper,node.removeRollbackWrapper);
                node.log("Rollback wrappers processed");
            } catch(e) {
            	node.error("error in adding wrappers: "+e)
            }
        	
        })
        
        RED.httpAdmin.get('/queuemanager/list',function(req,res) {
        	res.json(node.qmList(RED));
        });

        node.on("close", function(removed,done) {
            clearInterval(node.check); 
            node.log("removing wrappers on nodes");
            node.checkChanges(RED,node.queues,{},null,node.removeQueueWrapper);
            node.checkChanges(RED,node.checkpoints,{},null,node.removeCheckpointWrapper);
            node.checkChanges(RED,node.rollbacks,{},null,node.removeRollbackWrapper);        
            done();
        });
        node.on('input', function (msg) {
        	switch (msg.topic) {
        		case 'list':
        			msg.payload=this.qmList(RED);
        			break;
        		case 'pause':
        			if(node.maxActive==0) {
            			msg.payload="already paused";
            			break;
        			}
        			node.old.maxActive=node.maxActive;
        			node.maxActive=0;
        			msg.payload="paused";
        			break;
        		case 'release':
        			node.maxActive=node.old.maxActive;
        			msg.payload="released";
        			checkLoop.apply(node);
        			break;
        		case 'set':
        			Object.assign(node,msg.payload)
        			break;
        		default:
        			msg.payload={error:"unknown topic"};
        	}
			node.send(msg);
        });
        function checkLoop() {
        	var activeCnt=0,waitingCnt=0,rollbackCnt=0,timeOutCnt=0,q,pit=Date.now(),msg,m,p;
        	for (p in node.queues) {
        		q=node.queues[p];
        		for(m in q.active) {	//check active messages and kill those over a limit
        			msg=q.active[m];
        			if(pit-msg.qm.activeStartTime >msg.qm.q.maxTime) {
        				node.error("timeout message ", msg); //  killed message
        				rollback(msg);
        				msg.qm.q.timeOutCnt++;
        				msg.qm.q.activeCnt--;
       					delete q.active[m];
       					delete msg.qm;
        			}
        		}
        		while (q.waiting.length && q.activeCnt<q.maxActive && node.active < node.maxActive) { // activate waiting messages if possible
                		activateMessage.apply(q.node,[q.waiting.pop()]);
        		}
        		activeCnt+=q.activeCnt;
        		waitingCnt+=q.waiting.length;
        		rollbackCnt+=q.rollbackCnt||0;
        		timeOutCnt+=q.timeOutCnt||0;
        	}
        	node.status({ fill: (node.maxActive>0?'green':'yellow'), shape: 'ring', text: (node.maxActive>0?'':'Paused ')+ "Active: "+activeCnt+" Waiting: "+waitingCnt+"<br/> Rollback: "+(rollbackCnt)+" Timed out: "+timeOutCnt });
        }
        node.check = setInterval(checkLoop, node.checkInterval);
    }
    RED.nodes.registerType("Queue Manager",QueueManagerNode);
};

