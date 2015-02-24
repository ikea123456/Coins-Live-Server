var trades = require('./trades.js'),
orders = require('./orders.js'),
functions = require('./functions.js'),
restify = require('restify'),
WebSocketServer = require('ws').Server;

var wss = new WebSocketServer({port: 8080});
var trade_subscriptions = {};
var depth_subscriptions = {};
wss.on('connection', function(ws) {

    ws.on('subscribe_trades', function(message) {
        console.log('received: %s', message);
    });

    ws.on('unsubscribe_trades', function(message) {
        console.log('received: %s', message);
    });

    ws.on('message', function(message) {
    	var messageObject = JSON.parse(message);
    	var action = messageObject["action"];

    	if (action == 'subscribe_depth') {
    		var markets = messageObject["data"];
    		for (var m in markets) {
    			var market = markets[m];
    			ws.depth_subscriptions = ws.depth_subscriptions || [];
    			ws.depth_subscriptions.push(market);
    			depth_subscriptions[market] = depth_subscriptions[market] || [];
    			depth_subscriptions[market].push(ws);
    		}
    	} else if (action == 'subscribe_trades') {
    		var markets = messageObject["data"];
    		for (var m in markets) {
    			var market = markets[m];
    			ws.depth_subscriptions = ws.depth_subscriptions || [];
    			ws.depth_subscriptions.push(market);
    			depth_subscriptions[market] = depth_subscriptions[market] || [];
    			depth_subscriptions[market].push(ws);
    		}
    	}
    });

    ws.on('close', function() {
      console.log('closed');
      if (ws.depth_subscriptions) {
      	for (var m in ws.depth_subscriptions) {
      		var market = ws.depth_subscriptions[m];
      		var index = depth_subscriptions[market].indexOf(ws);
      		delete depth_subscriptions[market][index];
      	}
      }
    });
});

orders.orders.on('change', function(market, change) {
	if (depth_subscriptions[market]) {
		for (var ws in depth_subscriptions[market]) {
			var socket = depth_subscriptions[market][ws];
			socket.send(JSON.stringify({
				"market": market,
				"event": "depth_change",
				"data": change}));
		}
	}
})

var server = restify.createServer(),
port = 8000;	// Should probably change to 80 on production
server.use(restify.bodyParser());

server.get('/markets', function (req, res, cb) {
	res.send(trades.availableMarkets);
	res.end;
});

server.get('/trades/:market/', function (req, res, cb) {
	sanitizeMarkets([req.params.market], function(err, market) {
		if (!err) {
			res.send(trades.tradesOfMarket(market));
			res.end();
			console.log('Sent trades to ' + req.connection.remoteAddress);
		} else {
			res.send("Error: invalid market");
			res.end();
			console.log(req.connection.remoteAddress + ' is sending bad post data: ' + err);
		}
	});	
});

// TODO: Implement since parameter
server.post('/trades', function (req, res, cb) {
	sanitizeMarkets(req.params.markets, function(err, markets) {
		if (!err) {
			var histories = {};
			for (var m in markets) {
				var market = markets[m];
				histories[markets[m]] = trades.tradesOfMarket(markets[m]);
			}
			res.send(histories);
			res.end();
			console.log('Sent trades to ' + req.connection.remoteAddress);
		} else {
			console.log(req.connection.remoteAddress + ' is sending bad post data: ' + err);
			res.end();
		}
	})
});

server.get('/orders/:market', function (req, res, cb) {
	sanitizeMarkets([req.params.market], function(err, market) {
		if (!err) {
			res.send(orders.ordersOfMarket(market));
			res.end();
			// console.log('Sent orders to ' + req.connection.remoteAddress);
		} else {
			console.log(req.connection.remoteAddress + ' is sending bad post data: ' + err);
			res.send("Error: invalid market")
			res.end();
		}
	});
})

server.post('/orders', function (req, res, cb) {
	sanitizeMarkets(req.params.markets, function(err, markets) {
		if (!err) {
			var orders = {};
			for (var m in markets) {
				var market = markets[m];
				orders[markets[m]] = orders.ordersOfMarket(markets[m]);
			}
			res.send(orders);
			res.end();
			console.log('Sent orders to ' + req.connection.remoteAddress);
		} else {
			console.log(req.connection.remoteAddress + ' is sending bad post data: ' + err);
			res.end();
		}
	})
});

server.listen(port);
console.log("Listening on port " + port);


//**** SANITIZATION ****//

var market_list = trades.availableMarkets;


// Simplify this!
function sanitizeMarkets(raw_markets, cb) {
	functions.parse(raw_markets, function(err, clean_markets) {
		if (!err) {
			if (Array.isArray(clean_markets) && clean_markets.length <= market_list.length) {
				for (var m = 0; m < clean_markets.length; m++) {
					if (market_list.indexOf(clean_markets[m]) == -1) {
						cb('Invalid market: ' + clean_markets[m]);
						break;
					}
					
					else if (m == clean_markets.length-1)
						cb(null, clean_markets);
				}
			}
			else 
				cb('Too many markets or not array.');
		}
		else
			cb('Could not parse markets.');
	})
}
