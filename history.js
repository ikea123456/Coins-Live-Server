var trades = require('./trades.js'),
  functions = require('./functions.js'),
  mongoose = require('mongoose');

var history = {},
  samplesPerRange = 100,
  secondsInRange = {
    'h': 3600,
    'd': 86400,
    'w': 604800,
    'm': 2592000,
    'y': 31536000
  };

var availableMarkets = [];

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
        setInterval(removeOldSamples, 6000, market);
        availableMarkets.push(market.symbol);
      }
    }
  });
}

trades.on('trades', function (market, trades) {
  // console.log(market.symbol + "\t" + trades.length + " trades");
  for (var t in trades) {
    var trade = trades[t];
    for (var range in history[market.symbol]) {
      addTradeToRange(trade, history[market.symbol][range], range);
    }
  }
  saveHistory(market);
})

trades.on('error', function (err) {
  console.log(err);
})

function addTradeToRange(trade, trades, range) {
  var now = new Date().getTime() / 1000;

  //if trade is within timerange
  if (now - trade.date < secondsInRange[range]) {
    var date = trade.date,
      price = parseFloat(trade.price),
      amount = parseFloat(trade.amount);

    //if range is empty create a new sample
    if (trades.length == 0)
      trades.push([date, price, amount]);

    else {
      var latestSample = functions.last(trades);
      var timeSinceLatest = date - latestSample[0];
      var secondsPerSample = secondsInRange[range] / samplesPerRange;

      //if time since last trade is greater than sample size create a new sample
      if (timeSinceLatest > secondsPerSample) {
        trades.push([date, price, amount]);
      }

      //otherwise add to volume of latest sample
      else {
        latestSample[1] = parseFloat(price.toFixed(2));
        latestSample[2] += amount;
        latestSample[2] = parseFloat(latestSample[2].toFixed(2));
        trades[trades.length - 1] = latestSample;
      }
    }
  }
}

// Clean this up??
function removeOldSamples(market) {       
	var now = new Date().getTime() / 1000;
	for (var range in history[market.symbol]) {
		var samplesInRange = [];
		for (var sample in history[market.symbol][range]) {
			var date = history[market.symbol][range][sample][0];
			if (now - date < secondsInRange[range])
				samplesInRange.push(history[market.symbol][range][sample])
		}
		history[market.symbol][range] = samplesInRange;
	};
 	saveHistory(market);
}

function saveHistory(market) {
  market.update({
    $set: {
      hourTrades: history[market.symbol]['h'],
      dayTrades: history[market.symbol]['d'],
      weekTrades: history[market.symbol]['w'],
      monthTrades: history[market.symbol]['m'],
      yearTrades: history[market.symbol]['y']
    }
  }, function () {});
}

function historyOfMarket(market) {
  if (history[market])
    return history[market];
}

module.exports = {
  historyOfMarket: function (market) {
    if (history[market])
      return history[market];
  },
  availableMarkets: availableMarkets

}