var trades = require('./trades.js'),
functions = require('./functions.js'),
mongoose = require('mongoose');

var history = {},
samplesPerRange = 100,
secondsInRange = {'h': 3600, 'd': 86400, 'w': 604800, 'm': 2592000, 'y': 31536000};

var Market = mongoose.model('market');

readHistoryFromDb();

function readHistoryFromDb() {
	Market.find({}, function (error, markets) {
    if (error) {
      console.log(error);
    } else {
      for (var m in markets) {
        var market = markets[m];
        history[market.symbol] = {};
        history[market.symbol]['h'] = market.hourTrades || [];
        history[market.symbol]['d'] = market.dayTrades || [];
        history[market.symbol]['w'] = market.weekTrades || [];
        history[market.symbol]['m'] = market.monthTrades || [];
        history[market.symbol]['y'] = market.yearTrades || [];
      }
    }
  });
}

trades.on('trades', function(market, trades) {
  console.log(market.symbol + "\t" + trades.length + " trades");
  for (var t in trades) {
		var trade = trades[t];
		for (var range in history[market.symbol]) {
			addTradeToRange(trade, history[market.symbol][range], range);
		}
	}
})

trades.on('error', function(err) {
	console.log(err);
})

function addTradeToRange(trade, trades, range) {
	var now = new Date().getTime()/1000;

	//if trade is within timerange
	if (now - trade.date < secondsInRange[range]) {

		//if range is empty create a new sample
		if (trades.length == 0)
			trades.push([trade.date, parseFloat(trade.amount)]);

		else {
			var latestVolume = functions.last(trades);
			var timeSinceLatest = trade.date - latestVolume[0];
			var secondsPerSample = secondsInRange[range]/samplesPerRange;

			//if time since last trade is greater than sample size create a new sample
			if(timeSinceLatest > secondsPerSample) {
				trades.push([trade.date, parseFloat(trade.amount)]);
			}

			//otherwise add to volume of latest sample
			else {
				latestVolume[1] += parseFloat(trade.amount);
				trades[trades.length-1] = latestVolume;
			}
		}
	}
}

module.exports = history;
