var markets = require('./markets.js'),
  functions = require('./functions.js'),
  mongoose = require('mongoose');

var trades = {},
  samplesPerRange = 200,
  secondsInRange = {
    'h': 3600,
    'd': 86400,
    'w': 604800,
    'm': 2592000,
    'y': 31536000
  };

var availableMarkets = [];

var Market = mongoose.model('market');

readTradesFromDb();

function readTradesFromDb() {
  Market.find({}, function (error, markets) {
    if (error) {
      console.log(error);
    } else {
      for (var m in markets) {
        var market = markets[m];
        trades[market.symbol] = {};
        trades[market.symbol]['h'] = market.hourTrades || [];
        trades[market.symbol]['d'] = market.dayTrades || [];
        trades[market.symbol]['w'] = market.weekTrades || [];
        trades[market.symbol]['m'] = market.monthTrades || [];
        trades[market.symbol]['y'] = market.yearTrades || [];
        setInterval(removeOldSamples, 60000, market);
        availableMarkets.push(market.symbol);
      }
    }
  });
}

markets.on('trades', function (market, newTrades) {
  // console.log(market.symbol + "\t" + newTrades.length + " trades");
  for (var t in newTrades) {
    var trade = newTrades[t];
    for (var range in trades[market.symbol]) {
      addTradeToRange(trade, trades[market.symbol][range], range);
    }
  }
  saveTrades(market);
})

markets.on('error', function (err) {
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
	for (var range in trades[market.symbol]) {
		var samplesInRange = [];
		for (var sample in trades[market.symbol][range]) {
			var date = trades[market.symbol][range][sample][0];
			if (now - date < secondsInRange[range])
				samplesInRange.push(trades[market.symbol][range][sample])
		}
		trades[market.symbol][range] = samplesInRange;
	};
 	saveTrades(market);
}

function saveTrades(market) {
  market.update({
    $set: {
      hourTrades: trades[market.symbol]['h'],
      dayTrades: trades[market.symbol]['d'],
      weekTrades: trades[market.symbol]['w'],
      monthTrades: trades[market.symbol]['m'],
      yearTrades: trades[market.symbol]['y']
    }
  }, function () {});
}

function tradesOfMarket(market) {
  if (trades[market])
    return trades[market];
}

module.exports = {
  tradesOfMarket: function (market) {
    if (trades[market])
      return trades[market];
  },
  availableMarkets: availableMarkets

}