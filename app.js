var history = require('./history.js'),
functions = require('./functions.js'),
restify = require('restify');

var server = restify.createServer();
server.use(restify.bodyParser());

server.get('/history/:market/', function (req, res, cb) {
	var rawMarket = req.params.market;
	sanitizeMarkets([rawMarket], function(err, market) {
		if (!err) {
			res.send(historyOfMarket(market));
			res.end();
			console.log('Sent history to ' + req.connection.remoteAddress);
		} else {
			console.log(req.connection.remoteAddress + ' is sending bad post data: ' + err);
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
				histories[markets[m]] = historyOfMarket(markets[m]);
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

server.listen(8000);


//**** SANITIZATION ****//

var market_list = ['lakebtcBTCUSD', 'bitstampBTCUSD', 'btceBTCUSD','fxbtcBTCCNY',
'bitcurexBTCPLN','anxbtcBTCHKD', 'anxbtcBTCJPY','btceBTCRUR','virtexBTCCAD',
'bitcurexBTCEUR','bit2cBTCNIS','okcoinBTCCNY','btceNMCUSD','coinbaseBTCUSD',
'btceBTCEUR','bitfinexBTCUSD','krakenBTCUSD','krakenBTCEUR','huobiBTCCNY',
'itbitBTCUSD','hitbtcBTCUSD', 'hitbtcBTCEUR','campbxBTCUSD','btcdeBTCEUR',
'localbtcBTCUSD', 'localbtcBTCGBP','korbitBTCKRW','btcchinaBTCCNY','1coinBTCUSD',
'okcoinLTCCNY', 'okcoinBTCUSD', 'btceLTCUSD','btceNMCUSD', 'btceLTCEUR',
'btceNMCBTC','bitfinexLTCUSD', 'okcoinLTCUSD'];


// Simplify this!
function sanitizeMarkets(raw_markets, cb) {
	functions.parse(raw_markets, function(err, clean_markets) {
		if (!err) {
			if (Array.isArray(clean_markets) && clean_markets.length < market_list.length) {
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

function historyOfMarket(market) {
	if (history[market])
		return history[market];
}
