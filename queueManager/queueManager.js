const ts=(new Date().toString()).split(' ');
console.log([parseInt(ts[2],10) ,ts[1],ts[4]].join(' ')+" - [info] queueManager Copyright 2019 Jaroslav Peter Prib");		
const overflowMsgStop=10;
let debug=false;
let nodes=[];
function msgDebug(msg) {
	return "properties: "+Object.getOwnPropertyNames(msg).toString();
}
function nodeLabel(node) {
	if(node.hasOwnProperty('type')) {
		return node.type+" "+node.id+" "+(node.name||"");
	
	}
	return "*** not node ***";
}
const qmTypes=["Queue","Queue Manager","Queue ManagerAdmin","Queue Checkpoint","Queue Rollback"];
function isQmNode(t) {
	return qmTypes.includes(t);
}
function checkChanges(RED,current,revised,add,remove,change) {
	let n,nn;
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
				  delete current[n];
				  this.error("check changes new node not found so deleted from list: "+n);
			  }
		}
	}
}
function activateMessage(msg) {
	if(debug) console.log("queue Manager activateMessage "+msg._msgid);
	let q=msg.qm.q;
	++q.activeCnt;
	msg.qm.activeStartTime=Date.now();
	q.active[msg._msgid]=msg;
	this.active++;
	try{
		q.inputListener.apply(q.node,[msg]);        	
	} catch(e) {
		this.error("activateMessage failed: "+e);
	}
}
function StackProcessor(p,n,callback,callbackRetry,callbackArgs,maxRetry) {
	this.stack=[];
	this.parent=p;
	this.groupId=0;
	if(callback||callbackRetry) {
		this.startPoint(n,callback,callbackRetry,callbackArgs,maxRetry);
	}
	return this;
}
StackProcessor.prototype.startPoint=function(n,callback,callbackRetry,callbackArgs,retryMax) {
	++this.groupId;
	this.add({node:n,callback:callback,callbackRetry:callbackRetry,callbackArgs:callbackArgs,retryMax:retryMax||0});
	return this;
};
StackProcessor.prototype.add=function(p) {
	this.stack.push(Object.assign(p,{groupId:this.groupId}));
	return this;
};
StackProcessor.prototype.commit=function(node,callback,args) {
	this.process("commit",node,callback,args);
}
StackProcessor.prototype.rollback=function(node,callback,args) {
	this.process("rollback",node,callback,args);
};
StackProcessor.prototype.error=function(reason) {
	console.log("StackProcessor "+reason);
};
StackProcessor.prototype.log=function(text) {
	console.log(text);
};
StackProcessor.prototype.process=function(action,callbackNode,callback,callbackArgs) {
	if(debug) console.log("Stackprocessor process "+action+" stack size "+this.stack.length);
	if(this.action && action !== this.action) {
		this.error(action+" issued whilst active "+this.action+" enforcing rollback");
		this.action="rollback";
		this.notOK=true;
	} else {
		if(debug) console.log("Stackprocessor process "+action+" node:"+nodeLabel(callbackNode));
		this.action=action;
		this.notOK=(this.action=="rollback");
		this.callbackNode=callbackNode;
		this.callback=callback;
		this.callbackArgs=callbackArgs;
	}
	this.next();
}
StackProcessor.prototype.returnCallback=function() {
	if(debug) console.log("Stackprocessor return orginal process call "+this.action);
	if(this.callback) {  // if rollback no callback  - may be in future if want another path
		this.callback.apply(this.callbackNode,this.callbackArgs);
	}
}
StackProcessor.prototype.next=function() {
	if(debug) console.log("Stackprocessor next "+this.action);
	let r;
	while (this.stack.length) {  // find next stat process that has action
		r=this.stack.pop();
		if(debug) console.log("Stackprocessor next retry, count: "+r.retryMax+" Not OK: "+this.notOK);
		if(r.retryMax && this.notOK) { 
			if(r.retryMax-->0) { // must be retry point
				if(debug) console.log("Stackprocessor next retry");
				r.retry=(r.retry||0)+1;
				this.stack.push(r);
				this.log("Retry attempt "+r.retry+" of "+(r.retryMax+r.retry));
				r.callbackRetry.apply(r.node,r.callbackArgs);
				return;
			} else {
				if(debug) console.log("Stackprocessor next no more retries continue down stack");
				this.next(); // onwards with rollback
				r.callback.apply(r.node,[this]);
				return;
			}
		}
		if(r.hasOwnProperty(this.action)) break;
		if(r.hasOwnProperty("callback")) {
			if(debug) console.log("Stackprocessor next callback "+this.action);
			--this.groupId;
			r.callback.apply(r.node,[this]);
			return;
		}
	}
	if(this.stack.length==0) {
		if(debug) console.log("Stackprocessor next empty stack "+this.action);
		this.returnCallback();
		return;
	}
	try{
		var node=r.node;
		if(debug) console.log("Stackprocessor next calling action "+this.action);
		r[this.action].apply(r.node,[this]);
	} catch(e) {
		try{
			this.error("StackProcessor failed for "+nodeLabel(r.node)+" reason: "+e.message);
		} catch(e) {
			this.error("StackProcessor "+this.action+" failed as stack has bad entry for node reason: "+e+" stack entry properties:" +r);
			if(r instanceof Object) {
				console.error("   stack entry properties:" +Object.keys(r));
				if(r.node) {
					console.error("   node properties:" +Object.keys(r.node));
				}
			}
		}
	}
}
function inputWrapper(msg) {
	if(debug) console.log("queue Manager input wrapper "+msg._msgid+" node "+nodeLabel(this));
	if(!this.qm) {
		this.error("Missing queue manager, ignoring queuing");
		this.orginalSend.apply(this,arguments);
		return;
	}
	if(msg.qm) {
		this.error("Trying to add queue manager to message but already managed.");
		msg.stackProcessor.rollback(msg);
		return;
	}
	var q=this.qm.q;
	msg.stackProcessor=new StackProcessor(msg,this,
		function(processStack) {
			if(debug) console.log("queue Manager input wrapper initial group "+processStack.parent._msgid);
			SetEndActive(processStack.parent);
			if(processStack.notOK && this.type=="Queue") {
				this.send.apply(this,[[null,msg]]);
			} else {
				delete processStack.parent.qm;
			}
			processStack.next();
		},
		function(msg) {  //retry call
			if(debug) console.log("queue Manager input wrapper set retry try again");
			msg.qm.activeStartTime=Date.now();
			msg.stackProcessor.add({
				node:this,
				rollback:function(processStack) {
					this.error(" QM rollback from retry,  message: "+processStack.parent._msgid);
					processStack.next();
				}
			});
			this.send.apply(this,msg);
		},
		[msg],
		q.maxRetries
	);
	msg.stackProcessor.add({
		node:this,
		rollback:function(processStack) {
			this.error(" QM rollback,  message: "+processStack.parent._msgid);
			processStack.next();
		}
	});
	msg.qm={
		startTime:Date.now(),
		q:q,
		node:this,
		qmNode:this.qm
	};
	q.inCnt++;
	if(q.activeCnt<q.maxActive && this.active < this.maxActive) {
		activateMessage.apply(this,[msg]);
		return;
	}
	if(q.waiting.length>q.maxWaiting) {
		if(++q.overflowCnt>=overflowMsgStop){
			if(q.overflowCnt>overflowMsgStop) {
				return;
			}
			throw Error("Too many messages queued. Could be DoS attack, noded latency bad, or logic bug temporary disable this message");
		}
		throw Error("Too many messages queued.");
	}
	q.waiting.push(msg);
}
function removeQueueWrapper (n) {
	this.log("removing queue input wrapper for node "+nodeLabel(n));
	n.removeListener('input', n.qm.q.inputListener);
	n.on('input',n.qm.q.inputListener);
	delete n.qm;
}
function addQueueWrapper (n,o) {
	this.log("adding queue input wrapper for node "+nodeLabel(n));
	if(n.showStatus) n.status({ fill: 'yellow', shape: 'dot', text: "Queue manager initialising"});
	this.queues[n.id]={
		node:n,
		maxRetries:(o.maxRetries||0),
		maxTime:(o.maxTime||60000),
		maxActive:(o.maxActive||10),
		maxWaiting:(o.maxWaiting||1000),
		waiting:[],
		active:{},
		activeCnt:0,
		overflowCnt:0,
		inCnt:0,
		outCnt:0,
		rollbackCnt:0,
		errorCnt:0,
		timeOutCnt:0
	};
	if(n.hasOwnProperty("qm")) {
		n.error("trying to add second queue manager");
		n.status({ fill: 'red', shape: 'ring', text: "Error attempt to add second queue manager"});
	}
	n.qm={inputListener:n.listeners('input')[0],q:this.queues[n.id]};
	n.qm.q.inputListener=n.listeners('input')[0];
	n.removeListener('input', n.qm.q.inputListener);
	n.on('input',inputWrapper);
	this.closeStack.push({node:this,removeFunction:removeQueueWrapper,argument:[n]});
	if(n.showStatus) n.status({ fill: 'green', shape: 'ring', text: "ready"});
}
function addSendOveride(n,id) {
	if(n.orginalSend) {
		n.error("adding "+id+" failed as already orginal send exists");
		if(n.showStatus) n.status({ fill: 'red', shape: 'ring', text: "adding wrapper failed as already orginal send exists"});
		return;
	}
	const orginalSend=n.send;
	if(debug) {
		n.orginalSendDebug=orginalSend;
		n.orginalSend=function(msg) {
			console.log("queue Manager "+id+" orginalSend "+msgDebug(msg));
			this.orginalSendDebug(msg);
		}
	} else {
		n.orginalSend=orginalSend;
	}
}
function addCheckpointWrapper (n) {
	this.log("adding checkpoint wrapper to node "+nodeLabel(n)+" show status: "+n.showStatus);
	if(n.showStatus) n.status({ fill: 'yellow', shape: 'dot', text: "Queue manager initialising"});
	this.checkpoints[n.id]=true;
	addSendOveride(n,"addCheckpointWrapper");
	n.send = function(msg) {
		if(debug) console.log("queue Manager addCheckpointWrapper send");
		if(!msg) {
			if(debug) console.log("queue Manager addCheckpointWrapper input wrapper send null message");
			return;
		}
		if(debug) console.log("queue Manager addCheckpointWrapper input wrapper send "+Object.getOwnPropertyNames(msg).toString());
		let msgBase;
		if(Array.isArray(msg)) { // find msg being sent
			if(debug) console.log("queue Manager addCheckpointWrapper input wrapper is array");
			msgBase=msg.find((e)=>e!==null);
			if(!msgBase) {
				this.error("message missing, so rolled back at timeout",msg);
				return;
			}
		} else {
			msgBase=msg;
		}
		if(debug) console.log("queue Manager addCheckpointWrapper node "+nodeLabel(this)+" send "+msgBase._msgid);
		if(msgBase.hasOwnProperty('qm')) {
			msgBase.stackProcessor.commit(this,this.orginalSend,[msg]);
			return;
		}
		this.error("message missing queue manager so dropped as must have been processed",msg);
		if(this.showStatus) n.status({ fill: 'yellow', shape: 'ring', text: "Received message(s) not queue managed"});
		this.orginalSend.apply(n,[]);
	};
	this.closeStack.push({node:this,removeFunction:removeSendWrapper,argument:[n]});
	if(n.showStatus) n.status({ fill: 'green', shape: 'ring', text: "ready"});
}
function removeSendWrapper(n) {
	this.log("removing send wrapper from node "+nodeLabel(n));
	try{
		n.send=n.orginalSend;
		n.orginalSend=null;
	} catch(e) {
		n.log("error removing send wrapper "+e);	
	}
}
function addRollbackWrapper (n) {
	if(debug) console.log("queue Manager addRollbackWrapper ");
	try{
		this.log("adding rollback send wrapper to node "+nodeLabel(n)+" show status: "+n.showStatus);
	} catch(e) {
		console.log("queue Manager addRollbackWrapper error "+e);
	}
	if(n.showStatus) n.status({ fill: 'yellow', shape: 'dot', text: "Queue manager initialising"});
	if(!this.rollbacks) {this.rollbacks={};}
	this.rollbacks[n.id]=true;
	addSendOveride(n,"addRollbackWrapper");
	n.send = function(msg) {
		if(debug) console.log("queue Manager addRollbackWrapper send on "+nodeLabel(this)+" msg: "+msg._msgid);
		if(!msg.qm) {
			this.error("message missing queue manager so message dropped, message will timeout",msg);
			if(this.showStatus) this.status({ fill: 'yellow', shape: 'ring', text: "Received message(s) not queue managed"});
			this.orginalSend.apply(n,[]);
			return;
		}
		msg.stackProcessor.rollback(msg);
	};
	this.closeStack.push({node:this,removeFunction:removeSendWrapper,argument:[n]});
	if(n.showStatus) n.status({ fill: 'green', shape: 'ring', text: "ready"});
}
function emptyQueue(q) {
	let i=0,msg
	while(q.waiting.length>0) {
		msg=q.waiting.pop();
		i++
		msg.stackProcessor.rollback(msg);
	}
	return i;
}
function purgeQueue(q) {
	let i=0,msg
	while(q.waiting.length>0) {
		msg=q.waiting.pop();
		i++
	}
	return i;
}
function setMaxActive(q,n) {
	q.maxActive=n;
}
function release1(q) {
	if(q.waiting.length>0) {
		activateMessage.apply(q.node,[q.waiting.pop()]);
	}
}
function SetEndActive(msg) {
	var q=msg.qm.q;
	q.outCnt++;
	if(debug) console.log("queue Manager SetEndActive "+q.activeCnt+" message: "+msg._msgId);
	delete q.active[msg._msgid];
	if(--q.activeCnt<0) {
		++q.activeCnt;
		q.node.warn("SetEndActived active msg ended even though actve is zero");
		return;
	}
	if( q.activeCnt<q.maxActive && q.waiting.length>0) {
		activateMessage.apply(q.node,[q.waiting.pop()]);
	}
	msg.qm.active--;
}
function addStatusCheck(node) {
	this.statusCheck.push(node);
}
function qmList(RED) {
	var q,n,queues={};
	for (var p in this.queues) {
		q=this.queues[p];
		n=RED.nodes.getNode(p);
		queues[p]={
			id:p,
			node:(n.id||"*** internal error missing id"),
			name:(n.name||"*** node not found"),
			maxTime:q.maxTime,
			maxRetries:q.maxRetries,
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
function onNodesStarted(RED,node) {
	if(debug) console.log("onNodesStarted "+nodeLabel(node));
	//state not saved on close event so on redeploy need to remove previous applied wrapper
    node.log("removing "+node.closeStack.length+" wrappers on nodes");
    while(node.closeStack.length) {
    	let n=node.closeStack.pop();
    	if(debug) console.log("onNodesStarted "+nodeLabel(n));
    	try{
        	n.removeFunction.apply(n.node,n.argument);
    	} catch(e) {
    		node.error("failed "+nodeLabel(n.node)+" error: "+e.toString());
    	}
    }
    node.log("All nodes have started now adding wrappers");
    try{
    	const users = node._users.map(id => RED.nodes.getNode(id));
        node.log("Queues nodes");
    	users.filter(n => n.type=="Queue").forEach(c=>node.addQueueWrapper.apply(node,[c,c]));
    	node.checkChanges(RED,node.queues,node.setqueues,node.addQueueWrapper,node.removeQueueWrapper);
        node.log("Queue wrappers processed");
        node.log("Checkpoints nodes");
    	users.filter(n => n.type=="Queue Checkpoint").forEach(c=>node.addCheckpointWrapper.apply(node,[c]));
        node.checkChanges(RED,node.checkpoints,node.setcheckpoints,node.addCheckpointWrapper,node.removeSendWrapper);
        node.log("Checkpoint wrappers processed");
        node.log("Rollback nodes");
    	users.filter(n => n.type=="Queue Rollback").forEach(c=>node.addRollbackWrapper.apply(node,[c]));
        node.checkChanges(RED,node.rollbacks,node.setrollbacks,node.addRollbackWrapper,node.removeSendWrapper);
        node.log("Rollback wrappers processed");
    } catch(e) {
    	node.error("error in adding wrappers: "+e)
    }
}
module.exports = function(RED) {
    function QueueManagerNode(n) {
        RED.nodes.createNode(this,n);
        nodes.push(this);
        var node=Object.assign(this,{active:0,checkInterval:1000,queues:{},checkpoints:{},rollbacks:{}},n);
        node.old={maxActive:node.maxActive,maxWaiting:node.maxWaiting};
        node.addQueueWrapper=addQueueWrapper;
        node.addCheckpointWrapper=addCheckpointWrapper;
        node.addRollbackWrapper=addRollbackWrapper;
        node.checkChanges=checkChanges;
        node.qmList=qmList;
        node.debugToggle=function(){debug=!debug;};
        node.emptyQueue=emptyQueue;
        node.purgeQueue=purgeQueue;
        node.setMaxActive=setMaxActive;
        node.release1=release1;
        node.statusCheck=[];
        node.closeStack=[];
        node.addStatusCheck=addStatusCheck;

        RED.httpAdmin.get('/queuemanager/list',function(req,res) {
        	res.json(node.qmList(RED));
        });

        node.on("close", function(removed,done) {
            clearInterval(node.check); 
            done();
        });
        function checkLoop() {
        	var activeCnt=0,waitingCnt=0,rollbackCnt=0,timeOutCnt=0,q,pit=Date.now(),msg,m,p;
			if((pit - node.lastCheckHearbeatMsg) > 60000) {
				node.lastCheckHearbeatMsg=pit;
				node.log("Check loop still running");
			}
        	for(p in node.queues) {
        		q=node.queues[p];
        		q.overflowCnt=0;
        		for(m in q.active) {	//check active messages and kill those over a limit
        			msg=q.active[m];
        			if((pit - msg.qm.activeStartTime) > msg.qm.q.maxTime) {
        				node.error("timeout message "+m+" as ran for "+(pit-msg.qm.activeStartTime)+" millsecs", msg); //  killed message
        				++q.timeOutCnt;
        				msg.stackProcessor.rollback(msg);
        			}
    			}
        		while (q.waiting.length && q.activeCnt<q.maxActive && node.active < node.maxActive) { // activate waiting messages if possible
                		activateMessage.apply(q.node,[q.waiting.pop()]);
        		}
        		if(q.node.showStatus) {
        			q.node.status({ fill: (q.maxActive>0?'green':'yellow'), shape: 'ring', text: (q.maxActive>0?'':'Paused ')+ "Active: "+q.activeCnt+" Waiting: "+q.waiting.length+" Rollback: "+(q.rollbackCnt||0)+" Timed out: "+(q.timeOutCnt||0) });
        		}
        		activeCnt+=q.activeCnt;
        		waitingCnt+=q.waiting.length;
        		rollbackCnt+=q.rollbackCnt||0;
        		timeOutCnt+=q.timeOutCnt||0;
        	}
        	node.statusCheck.forEach(function (statusNode) {
        		statusNode.status({ fill: (node.maxActive>0?'green':'yellow'), shape: 'ring', text: (node.maxActive>0?'':'Paused ')+ "Active: "+activeCnt+" Waiting: "+waitingCnt+" Rollback: "+(rollbackCnt)+" Timed out: "+timeOutCnt });
        	});
        }
        node.check = setInterval(checkLoop, node.checkInterval);
        node.log("check loop started on interval "+node.checkInterval);
    }
	RED.events.on("nodes-started",function() {
		if(debug) console.log("queue Manager "+nodes.length+" nodes to post start");
		while(nodes.length) {
			try{
				onNodesStarted(RED,nodes.pop());
			} catch(e) {
				console.log([parseInt(ts[2],10) ,ts[1],ts[4]].join(' ')+" - [error] queueManager "+nodeLabel(n)+" error "+e.message);
			}
		}
	});
    RED.nodes.registerType("Queue Manager",QueueManagerNode);
};

