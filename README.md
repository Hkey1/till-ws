# till-ws
 Async wrappers for WS module


## tillSocketOpened(socket, opts={})

```js
	const WS     = require('ws');
	const socket = new WS(url);
	
	await tillSocketOpened(socket)	
```


## tillSocketMessage(socket, opts={})
```js
	await tillSocketMessage(socket)	
```


## getFromSocket(socket, onOpen=[], filter=undefined, opts={})
connect, send some messages, get neaded message, and close websocket

```js
	await getFromSocket(socket, ['someOutgoingMessage'], function onMessage(parsedMessage, parseError, rawMessage, isBinary, socket){
		if(parseError) {
			throw parseError;
		} else if(parsedMessage.channel==='error'){
			throw new Error(parsedMessage.data);
		} else if(parsedMessage.channel==='trades'){
			return parsedMessage;
		} else if(parsedMessage.channel==='subscriptionResponse'){
			return false; //dont log('strange message', ...)
		} 
	})	
```


## closeSocket(socket, removeAllListeners=true)
Close socket, removeAllListeners, dont die on this socket error

```js
	closeSocket(socket)	
```
