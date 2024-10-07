const assert    = require('node:assert');
const tillEvent = require('till-event');

function closeSocket(socket, removeAllListeners=true){
	if(removeAllListeners){
		socket.removeAllListeners();
	}
	if(socket.listenerCount('error')===0){
		socket.on('error', err=>console.log('Closed Socket error', err));
	}
	try{
		socket.close();
	} catch(e){console.error(e)}
}

function tillSocketOpened(socket, opts={}){
	if(socket.isAlreadyOpened){
		return socket;
	}
	
	opts = typeof(opts)==='number' ? {timeout: opts} : opts;
	let {abort, timeout, closeOnReject, removeAllListenersOnClose} = opts;
	timeout                   ??= 4000;
	closeOnReject             ??= true;
	removeAllListenersOnClose ??= true;

	return tillEvent(socket, ['open', 'error', 'close'], {
		abort,
		timeout,
		filter : function(promise, result){
			const {event, args} = result;
			if(event === 'open'){
				socket.isAlreadyOpened = true;
				return socket;
			} else if(event === 'close'){
				throw new Error('Socket closed before open :  '+args[0]+' '+(args[1]||''));
			} else if(event === 'error'){
				throw ((args[0] instanceof Error) ? args[0] : new Error('Socket open Error: '+args[0]));
			} else throw new Error('Something gone wrong. event='+event)
		},
		afterReject : function(){
			if(closeOnReject){
				closeSocket(socket, removeAllListenersOnClose);
			}
		}
	});
}

function parseIncomingMessage(rawMessage, isBinary){
	let parsedMessage=undefined, parseError=undefined;
	try {
		parsedMessage = JSON.parse(rawMessage.toString());
	} catch (err){
		parseError = err;
	}
	return [parsedMessage, parseError, parseError ? rawMessage : parsedMessage];
}
function sendMessages(socket, messages){
	assert(!(messages instanceof Promise));
	if(messages instanceof Buffer || typeof(messages)==='string' || (typeof(messages)==='object' && !Array.isArray(messages))){
		messages = [messages];
	}
	messages.forEach(message=>{
		if(typeof(message)==='object' && !(message instanceof Buffer)){
			message = JSON.stringify(message);
		}
		socket.send(message);
	})
}
function tillSocketMessage(socket, opts={}){
	let {timeout, filter, abort} = opts;
	timeout ??= 4000;
	return tillEvent(socket, ['message', 'error', 'close'], {
		abort,
		timeout,
		filter :  function(promise, result){
			const {event, args} = result;
			if(event === 'message'){
				const [rawMessage, isBinary]           = args;
				const [parsedMessage, parseError, msg] = parseIncomingMessage(rawMessage, isBinary);
				if(filter){
					const res = filter(parsedMessage, parseError, rawMessage, isBinary, socket);
					if(res===undefined){
						console.log('Strange message', msg, 'You can off this warning if onMessageCb(...) returns false (not undefined)');
					}
					return res;
				} else return { parsedMessage, parseError, rawMessage, isBinary, socket };
			} else if(event === 'close'){
				throw new Error('Socket Closed :  '+args[0]+' '+(args[1]||''));
			} else if(event === 'error'){
				throw ((args[0] instanceof Error) ? args[0] : new Error('Socket Error: '+args[0]));
			} else throw new Error('Something gone wrong');
		},
	});
}

async function getFromSocket(socket, onOpen=[], filter=undefined, opts={}){
	let {abort, timeout, closeOnResolve, closeOnReject, removeAllListenersOnClose} = opts;

	removeAllListenersOnClose ??= true;
	closeOnResolve            ??= true;
	closeOnReject             ??= true;
	timeout                   ??= 9000;
	
	const startTimestamp = Date.now();

	await tillSocketOpened(socket, {abort, timeout, closeOnReject});
	sendMessages(socket, typeof(onOpen)==='function' ? onOpen(socket) : onOpen);

	try{
		const res = await tillSocketMessage(socket, {abort, timeout: timeout - (Date.now() - startTimestamp), filter});	
		if(closeOnResolve){
			closeSocket(socket, removeAllListenersOnClose);
		}
		return res;
	} catch(e){
		if(closeOnReject){
			closeSocket(socket, removeAllListenersOnClose);
		}
		throw e;
	}
}

if(require.main === module) { //Tests
	const WS  = require('ws');

	function onMessage(msg, parseError, rawMessage, isBinary, socket){
		if(parseError) {
			throw parseError;
		} else if(msg.channel==='error'){
			throw new Error(msg.data);
		} else if(msg.channel==='trades'){
			return msg;
		} else if(msg.channel==='subscriptionResponse'){
			return false; //dont log('strange message', ...)
		} 
	}
	async function printResults(testName, promise){
		try{
			const res = await promise;
			console.log('---------------test ok: '+testName+'----------------');
			console.log('res', {...res, data: 'см ниже'});
			console.log('res.data.length', res.data.length);
			console.log('res.data[0]', res.data[0]);
		} catch(err){
			console.log('---------------test fail: '+testName+'----------------');
			console.error(err);			
		}
	}
	const genSubMessage = coin=>({method: "subscribe", subscription: { type: "trades", coin}});
	const subMsg        = genSubMessage('SOL');
	const url           = 'wss://api.hyperliquid.xyz/ws';
	(async ()=>{	
		printResults(1, getFromSocket(
			new WS(url), //new WS(url), //const WS = require('ws');
			[subMsg],
			onMessage,
		));
		printResults(2, getFromSocket(
			new WS(url), //new WS(url), //const WS = require('ws');
			function onOpen(socket){
				socket.send(JSON.stringify(subMsg));
				return [];
			},
			onMessage,
		));
	})();
}

module.exports = {
	closeSocket,
	sendMessages,
	parseIncomingMessage,
	tillSocketMessage,
	tillSocketOpened,	
	getFromSocket,
};