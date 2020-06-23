const logger = new (require("node-red-contrib-logger"))("Queue Manager");
logger.sendInfo("Copyright 2020 Jaroslav Peter Prib");

const overflowMsgStop=10;
let nodes=[];
function msgDebug(msg) {
	return "properties: "+Object.getOwnPropertyNames(msg).toString();
}
function nodeLabel(node) {
	if(Object.prototype.hasOwnProperty.call(node, "type")) {
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
			if (Object.prototype.hasOwnProperty.call(revised, n)) {
				Object.assign(current[n],revised[n]);
			}
		}
	}
	if(remove) {
		for(n in current ) {
			if (Object.prototype.hasOwnProperty.call(revised, n)) {continue;}
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
			if (Object.prototype.hasOwnProperty.call(current, n)) {continue;}
			nn=RED.nodes.getNode(n);
			if(nn) {
				if(isQmNode(nn.type)) {continue;}
				add.apply(this,[nn,revised[n]]);
			} else {
				delete current[n];
				error(this,"check changes new node not found so deleted from list: "+n);
			}
		}
	}
}
function activateWaiting(q) {
	if(logger.active) logger.send({label:"activateWaiting","q.waiting.length":q.waiting.length,"q.activeCnt":q.activeCnt,"q.maxActive":q.maxActive,"q.qm.active":q.qm.active,"q.qm.maxActive":q.qm.maxActive});
	while( q.waiting.length>0 && q.activeCnt<q.maxActive && q.qm.active<q.qm.maxActive) {
		activateMessage.apply(q.node,[q.waiting.pop()]);
	}
}
function activateMessage(msg) {
	if(logger.active) logger.send({label:"activateMessage",msg:msg._msgid});
	let q=msg.qm.q;
	++q.activeCnt;
	msg.qm.activeStartTime=Date.now();
	q.active[msg._msgid]=msg;
	this.active++;
	try{
		msg.qm.q.inputListener.apply(q.node,[msg]);			
	} catch(e) {
		error(this,"activateMessage failed: "+e);
	}
}
function addStatusCheck(node) {
	this.statusCheck.push(node);
}
function getMessages(q,max=10) {
	let r=[];
	for(let i=0;i<q.waiting.length && i<max;i++){
		const m=q.waiting[i];
		r.push({id:m._msgid,topic:m.topic,payload:m.payload});
	}
	return r;
}
function error(node,error){
	(node.error||logger.sendErrorAndStackDump)(error);
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
	logger.sendError("StackProcessor "+reason);
};
StackProcessor.prototype.log=function(text) {
	logger.sendInfo(text);
};
StackProcessor.prototype.process=function(action,callbackNode,callback,callbackArgs) {
	if(logger.active) logger.send({label:"StackProcessor process",action:action,stackLength:this.stack.length});
	if(this.action && action !== this.action) {
		error(this,action+" issued whilst active "+this.action+" enforcing rollback");
		this.action="rollback";
		this.notOK=true;
	} else {
		if(logger.active) logger.send({label:"StackProcessor process",action:action,node:nodeLabel(callbackNode)});
		this.action=action;
		this.notOK=(this.action=="rollback");
		this.callbackNode=callbackNode;
		this.callback=callback;
		this.callbackArgs=callbackArgs;
	}
	this.next();
}
StackProcessor.prototype.returnCallback=function() {
	if(logger.active) logger.send({label:"StackProcessor returnCallback"});
	if(this.callback) {  // if rollback no callback  - may be in future if want another path
		this.callback.apply(this.callbackNode,this.callbackArgs);
	}
}
StackProcessor.prototype.next=function() {
	if(logger.active) logger.send({label:"StackProcessor next"});
	let r;
	while (this.stack.length) {  // find next stat process that has action
		r=this.stack.pop();
		if(logger.active) logger.send({label:"StackProcessor next retry",count:r.retryMax,NotOK:this.notOK});
		if(r.retryMax && this.notOK) { 
			if(r.retryMax-->0) { // must be retry point
				if(logger.active) logger.send({label:"StackProcessor next retry attempt"});
				r.retry=(r.retry||0)+1;
				this.stack.push(r);
				this.log("Retry attempt "+r.retry+" of "+(r.retryMax+r.retry));
				r.callbackRetry.apply(r.node,r.callbackArgs);
				return;
			} else {
				if(logger.active) logger.send({label:"StackProcessor next no more retries continue down stack"});
				this.next(); // onwards with rollback
				r.callback.apply(r.node,[this]);
				return;
			}
		}
		if(Object.prototype.hasOwnProperty.call(r,this.action)) break;
		if(Object.prototype.hasOwnProperty.call(r,"callback")) {
			if(logger.active) logger.send({label:"StackProcessor next callback"});
			--this.groupId;
			r.callback.apply(r.node,[this]);
			return;
		}
	}
	if(this.stack.length==0) {
		if(logger.active) logger.send({label:"StackProcessor next empty stack"});
		this.returnCallback();
		return;
	}
	const node=r.node;
	try{
		if(logger.active) logger.send({label:"StackProcessor next calling"});
		r[this.action].apply(node,[this]);
	} catch(e) {
		try{
			error(this,"StackProcessor failed for "+nodeLabel(node)+" reason: "+e.message);
		} catch(e) {
			error(this,"StackProcessor "+this.action+" failed as stack has bad entry for node reason: "+e+" stack entry properties:" +r);
			if(r instanceof Object) {
				logger.sendError("   stack entry properties:" +Object.keys(r));
				if(node) {
					logger.sendError("   node properties:" +Object.keys(node));
				}
			}
		}
	}
}
function inputWrapper(msg) {
	if(logger.active) logger.send({label:"inputWrapper",msg:msg._msgid,node:nodeLabel(this)});
	if(!this.qm) {
		logger.sendErrorAndDump({label:"inputWrapper",msg:msg._msgid,error:"Missing queue manager, ignoring queuing"},this);
		error(this,"Missing queue manager, ignoring queuing");
		this.orginalSend.apply(this,arguments);
		return;
	}
	if(msg.qm) {
		logger.sendErrorAndStackDump("Trying to add queue manager to message but already managed.");
		msg.stackProcessor.rollback(msg);
		return;
	}
	let q=this.qm.q;
	msg.stackProcessor=new StackProcessor(msg,this,
		function(processStack) {
			if(logger.active) logger.send({label:"inputWrapper initial group",msg:processStack.parent._msgid});
			SetEndActive(processStack.parent);
			if(processStack.notOK && this.type==="Queue") {
				this.send.apply(this,[[null,msg]]);
			} else {
				delete processStack.parent.qm;
			}
			processStack.next();
		},
		function(msg) {  //retry call
			if(logger.active) logger.send({label:"inputWrapper set retry try again",msg:msg._msgid});
			msg.qm.activeStartTime=Date.now();
			msg.stackProcessor.add({
				node:this,
				rollback:function(processStack) {
					error(this,"QM rollback from retry,  message: "+processStack.parent._msgid);
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
			error(this,"QM rollback,  message: "+processStack.parent._msgid);
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
	if(q.activeCnt<q.maxActive && this.active<this.maxActive) {
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
	const listeners=n.listeners('input');
	if(logger.active) logger.send({label:"removeQueueWrapper",listeners:listeners.length});
	if(listeners.length==0) {
		if(logger.active) logger.send({label:"removeQueueWrapper input is _inputCallback"});
		n._inputCallback=n.qm.q.inputListener;
	} else {
		n.removeListener('input', n.qm.q.inputListener);
		n.on('input',n.qm.q.inputListener);
	}
	delete n.qm;
}
function addQueueWrapper (n,o) {
	const holdOnRollback=n.holdOnRollback||o.holdOnRollback||this.holdOnRollback||false;
	this.log("adding queue input wrapper for node "+nodeLabel(n)+" holdOnRollback "+holdOnRollback);
	if(n.showStatus) n.status({ fill: 'yellow', shape: 'dot', text: "Queue manager initialising"});
	this.queues[n.id]={
		node:n,
		qm:this,
		holdOnRollback:holdOnRollback,
		maxRetries:(o.maxRetries||0),
		maxTime:(o.maxTime||60000),
		maxActive:(o.maxActive||10),
		maxActiveSet:(o.maxActive||10),
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
	if(Object.prototype.hasOwnProperty.call(n,"qm")) {
		n.error("trying to add second queue manager");
		n.status({ fill: 'red', shape: 'ring', text: "Error attempt to add second queue manager"});
	}
	const listeners=n.listeners('input');
	if(logger.active) logger.send({label:"addQueueWrapper",listeners:listeners.length});
	n.qm={q:this.queues[n.id]};
	if(listeners.length==0) {
		if(logger.active) logger.send({label:"addQueueWrapper input is _inputCallback"});
		n.qm.q.inputListener=n._inputCallback;
		n._inputCallback=inputWrapper.bind(n);
		if(n._inputCallbacks) logger.sendWarning("node has _inputCallbacks");
	} else {
//		n.qm.inputListener=listeners[0];
		n.qm.q.inputListener=listeners('input');
		n.removeListener('input', n.qm.q.inputListener);
		n.on('input',inputWrapper.bind(n));
	}
	this.closeStack.push({node:this,removeFunction:removeQueueWrapper,argument:[n]});
	if(n.showStatus) n.status({ fill: 'green', shape: 'ring', text: "ready"});
	if(n.type=="Queue" && n.hold) hold(n.qm.q);
}
function addSendOveride(n,id) {
	if(n.orginalSend) {
		n.error("adding "+id+" failed as already orginal send exists");
		if(n.showStatus) n.status({ fill: 'red', shape: 'ring', text: "adding wrapper failed as already orginal send exists"});
		return;
	}
	const orginalSend=n.send.bind(n);
	if(logger.active) {
		n.orginalSendDebug=orginalSend;
		n.orginalSend=function(msg) {
			logger.sendInfo("queue Manager "+id+" orginalSend "+msgDebug(msg));
			this.orginalSendDebug(msg);
		}
	} else {
		n.orginalSend=orginalSend;
	}
}
function addCheckpointWrapper(n) {
	this.log("adding checkpoint wrapper to node "+nodeLabel(n)+" show status: "+n.showStatus);
	if(n.showStatus) n.status({ fill: 'yellow', shape: 'dot', text: "Queue manager initialising"});
	this.checkpoints[n.id]=true;
	addSendOveride(n,"addCheckpointWrapper");
	n.send = function(msg) {
		if(logger.active) logger.send({label:"addCheckpointWrapper send"});
		if(!msg) {
			if(logger.active) logger.send({label:"addCheckpointWrapper send, msg is null"});
			return;
		}
		if(logger.active) logger.send({label:"addCheckpointWrapper send",send:Object.getOwnPropertyNames(msg).toString()});
		let msgBase;
		if(Array.isArray(msg)) { // find msg being sent
			if(logger.active) logger.send({label:"addCheckpointWrapper send, msg is array"});
			msgBase=msg.find((e)=>e!==null);
			if(!msgBase) {
				error(this,"Checkpoint Wrapper message base missing, so rolled back at timeout",msg);
				return;
			}
		} else {
			msgBase=msg;
		}
		if(logger.active) logger.send({label:"addCheckpointWrapper send",node:nodeLabel(this),send:msgBase._msgid});
		if(Object.prototype.hasOwnProperty.call(msgBase,'qm')) {
			msgBase.stackProcessor.commit(this,this.orginalSend,[msg]);
			return;
		}
		error(this,"message missing queue manager so dropped as must have been processed",msg);
		if(this.showStatus) n.status({ fill: 'yellow', shape: 'ring', text: "Received message(s) not queue managed"});
//		this.orginalSend.call();
//		this.orginalSend.apply(n,[]);
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
function addRollbackWrapper(n) {
	if(logger.active) logger.send({label:"addRollbackWrapper"});
	try{
		this.log("adding rollback send wrapper to node "+nodeLabel(n)+" show status: "+n.showStatus+" holdOnRollback: "+n.holdOnRollback);
	} catch(e) {
		logger.sendError("addRollbackWrapper error "+e);
	}
	const holdOnRollback=n.holdOnRollback;
	if(n.showStatus) n.status({ fill: 'yellow', shape: 'dot', text: "Queue Manager initialising"});
	if(!this.rollbacks) {this.rollbacks={};}
	this.rollbacks[n.id]=true;
	addSendOveride(n,"addRollbackWrapper");
	n.send = function(msg) {
		if(logger.active) logger.send({label:"addRollbackWrapper send",on:nodeLabel(this),msg:msg._msgid});
		if(msg.qm) {
			msg.qm.q.rollbackCnt++;
			if(msg.qm.q.holdOnRollback || holdOnRollback) {
				logger.sendWarning("rollback put queue on hold");
				hold(msg.qm.q);
			}
			msg.stackProcessor.rollback(msg);
		} else {
			error(this,"message missing queue manager so message dropped, message will timeout",msg);
			if(this.showStatus) this.status({ fill: 'yellow', shape: 'ring', text: "Received message(s) not queue managed"});
//			this.orginalSend.apply(n,[]);
			return;
		}
	};
	this.closeStack.push({node:this,removeFunction:removeSendWrapper,argument:[n]});
	if(n.showStatus) n.status({ fill: 'green', shape: 'ring', text: "ready"});
}
function activeUp1(q) {
	q.maxActive++;
	q.maxActiveSet++;
	release1(q);
}
function activeDown1(q,n) {
	if(q.maxActive<0) return;
	q.maxActive--;
	q.maxActiveSet--;
}
function hold(q) {
	if(logger.active) logger.send({label:"hold"});
	q.maxActive=0;
}
function emptyQueue(q) {
	let i=0,msg
	while(q.waiting.length>0) {
		msg=q.waiting.shift();
		i++;
		msg.stackProcessor.rollback(msg);
	}
	return i;
}
function holdAndRollbackActive(q){
	hold(q);
	while(q.active.length>0) msg.stackProcessor.rollback(q.active.shift());
}
function purgeQueue(q) {
	let i=0;
	while(q.waiting.length>0) {
		q.waiting.shift();
		i++;
	}
	return i;
}
function setMaxActive(q,n) {
	q.maxActive=n;
	q.maxActiveSet=n;
}
function release(q,maxActive) {
	q.maxActive=q.maxActiveSet;
	activateWaiting(q);
}
function release1(q) {
	if(q.waiting.length>0) {
		activateMessage.apply(q.node,[q.waiting.pop()]);
	}
}
function rollbackActive(q) {
	holdAndRollbackActive(q);
	release(q);
}
function SetEndActive(msg) {
	let q=msg.qm.q;
	q.outCnt++;
	if(logger.active) logger.send({label:"SetEndActive",activeCount:q.activeCnt,msg:msg._msgid});
	delete q.active[msg._msgid];
	if(--q.activeCnt<0) {
		++q.activeCnt;
		q.node.warn("SetEndActived active msg ended even though actve is zero");
		return;
	}
	activateWaiting(q);
	msg.qm.active--;
}
function qmList(RED) {
	let q,n,queues={};
	for (let p in this.queues) {
		q=this.queues[p];
		n=RED.nodes.getNode(p);
		queues[p]={
			id:p,
			node:(n.id||"*** internal error missing id"),
			name:(n.name||"*** node not found"),
			holdOnRollback:q.holdOnRollback,
			maxTime:q.maxTime,
			maxRetries:q.maxRetries,
			maxActive:q.maxActive,
			maxActiveSet:q.maxActiveSet,
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
	if(logger.active) logger.send({label:"onNodesStarted",node:nodeLabel(node)});
	//state not saved on close event so on redeploy need to remove previous applied wrapper
	node.log("removing "+node.closeStack.length+" wrappers on nodes");
	while(node.closeStack.length) {
		let n=node.closeStack.pop();
		if(logger.active) logger.send({label:"onNodesStarted",node:nodeLabel(n)});
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
		let node=Object.assign(this,
			{active:0,checkInterval:1000,queues:{},checkpoints:{},rollbacks:{},statusCheck:[],closeStack:[],
			addQueueWrapper:addQueueWrapper,addCheckpointWrapper:addCheckpointWrapper,addRollbackWrapper:addRollbackWrapper,
			checkChanges:checkChanges,qmList:qmList,emptyQueue:emptyQueue,purgeQueue:purgeQueue,
			setMaxActive:setMaxActive,release1:release1,getMessages:getMessages,addStatusCheck:addStatusCheck,
			activeUp1:activeUp1,activeDown1:activeDown1,rollbackActive:rollbackActive,holdAndRollbackActive:holdAndRollbackActive,
			release:release,hold:hold
			},
			n);
		node.old={maxActive:node.maxActive,maxWaiting:node.maxWaiting};
		node.debugToggle=function(){logger.setOn()};

		RED.httpAdmin.get('/queuemanager/list',function(req,res) {
			res.json(node.qmList(RED));
		});

		node.on("close", function(removed,done) {
			logger.send("on close stopping check");
			clearInterval(node.check); 
			done();
		});
		function checkLoop() {
			let activeCnt=0,waitingCnt=0,rollbackCnt=0,timeOutCnt=0,q,pit=Date.now();
			if((pit - node.lastCheckHearbeatMsg) > 60000) {
				node.lastCheckHearbeatMsg=pit;
				node.log("Check loop still running");
			}
			for(let p in node.queues) {
				const q=node.queues[p],timeOutTime=pit-q.maxTime;
				q.overflowCnt=0;
				for(let m in q.active) {	//check active messages and kill those over a limit
					const msg=q.active[m];
					if(logger.active) logger.send({label:"checkLoop timeout",timeOutTime:timeOutTime,activeStartTime:msg.qm.activeStartTime,timout:(msg.qm.activeStartTime-timeOutTime)});
					if(msg.qm.activeStartTime<timeOutTime) {
						node.error("timeout message "+m+" as ran for "+(pit-msg.qm.activeStartTime)+" millsecs", msg); //  killed message
						++q.timeOutCnt;
						++q.rollbackCnt;
						msg.stackProcessor.rollback(msg);
					}
				}
				if(logger.active) logger.send({label:"checkLoop",node:nodeLabel(q.node),activeCnt:q.activeCnt,maxActive:q.maxActive,nodeActive:node.active,nodeMaxActive:node.maxActive});
				activateWaiting(q);
//				while (q.waiting.length && q.activeCnt<q.maxActive && node.active<node.maxActive) { // activate waiting messages if possible
//					if(logger.active) logger.send({label:"checkLoop activateMessage"});
//					activateMessage.apply(q.node,[q.waiting.shift()]);
//				}
				if(q.node.showStatus) {
					q.node.status({fill:(q.maxActive>0?'green':'yellow'), shape: 'ring', text: (q.maxActive>0?'':'Paused ')+ "Active: "+q.activeCnt+" Waiting: "+q.waiting.length+" Rollback: "+(q.rollbackCnt||0)+" Timed out: "+(q.timeOutCnt||0) });
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
		node.check=setInterval(checkLoop, node.checkInterval);
		node.log("check loop started on interval "+node.checkInterval);
	}
	RED.events.on("nodes-started",function(done) {
		if(logger.active) logger.send({label:"nodes-started",nodes:nodes.length});
		while(nodes.length) {
			const n=nodes.pop();
			try{
				onNodesStarted(RED,n);
			} catch(e) {
				logger.sendError(nodeLabel(n)+" error "+e.message);
			}
		}
		if(done) {
			if(logger.active) logger.send({label:"nodes-started calling done"});
			done();
		}
	});
	RED.nodes.registerType(logger.label,QueueManagerNode);
};
