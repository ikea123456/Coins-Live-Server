var history = require('./history.js'),
orders = require('./orders.js'),
functions = require('./functions.js'),
restify = require('restify');

var server = restify.createServer(),
port = 8000;	// Should probably change to 80 on production
server.use(restify.bodyParser());

server.get('/markets', function (req, res, cb) {
	res.send(history.availableMarkets);
	res.end;
});

server.get('/history/:market/', function (req, res, cb) {
	var rawMarket = req.params.market;
	sanitizeMarkets([rawMarket], function(err, market) {
		if (!err) {
			res.send(history.historyOfMarket(market));
			res.end();
			console.log('Sent history to ' + req.connection.remoteAddress);
		} else {
			console.log(req.connection.remoteAddress + ' is sending bad post data: ' + err);
			res.send("Error: invalid market");
			res.end();
		}
	});	
});

// TODO: Implement since parameter
server.post('/history', function (req, res, cb) {
	var rawMarkets = req.params.markets;
	sanitizeMarkets(rawMarkets, function(err, markets) {
		if (!err) {
			var histories = {};
			for (var m in markets) {
				var market = markets[m];
				histories[markets[m]] = history.historyOfMarket(markets[m]);
			}
			res.send(histories);
			res.end();
			console.log('Sent history to ' + req.connection.remoteAddress);
		} else {
			console.log(req.connection.remoteAddress + ' is sending bad post data: ' + err);
			res.end();
		}
	})
});

server.get('/orders/:market', function (req, res, cb) {
	var rawMarket = req.params.market;
	sanitizeMarkets([rawMarket], function(err, market) {
		if (!err) {
			res.send(orders.ordersOfMarket(market));
			res.end();
			console.log('Sent orders to ' + req.connection.remoteAddress);
		} else {
			console.log(req.connection.remoteAddress + ' is sending bad post data: ' + err);
			res.send("Error: invalid market")
			res.end();
		}
	});
})

server.listen(port);
console.log("Listening on port " + port);


//**** SANITIZATION ****//

var market_list = history.availableMarkets;


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
