var mongoose = require('mongoose'),
  request = require('request'),
  events = require('events'), // use streams/queue instead!!
  functions = require('./functions.js');

var eventEmitter = new events.EventEmitter();

var Market = mongoose.model('market', require('./market'));

//Connect to db and begin updating markets
var db = mongoose.connection;
mongoose.connect('mongodb://localhost/markets');
db.on('error', console.error.bind(console, 'mongo error:'));
db.once('open', function cb() {
  beginUpdatingMarkets();
});

function beginUpdatingMarkets() {
  Market.find({}, function (error, markets) {
    if (error) {
      eventEmitter.emit('error', error);
    } else {
      for (var m in markets) {
        var market = markets[m];
        if (market.tradesURL) {
          fetchTradesRecursively(market);
        }
        if (market.ordersURL) {
          fetchOrderBook(market, "recursive");
        }
      }
    }
  });
}


// Fetch new trades from exchange API
function fetchTradesRecursively(market) {
  if (market.exchange == 'coinbase') {
    var after = parseInt(market.lastTrade) + 100;
    var url = 'https://api.exchange.coinbase.com/products/BTC-USD/trades?before=' + market.lastTrade + '&after=' + after;
  }
  else
    url = market.tradesURL + market.lastTrade;
  request.get({
    url: url,
    json: true,
    headers: {
      'user-agent': 'Coins Live'
    },
    timeout: 5000,
    rejectUnauthorized: false
  }, function (error, response, body) {
    if (error) {
      var err = market.symbol + '\t' + error;
      eventEmitter.emit('error', err);
    } else if (response.statusCode != 200) {
      var err = market.symbol + '\t' + 'Response Status: ' + response.statusCode;
      console.log(market.tradesURL + market.lastTrade);
      eventEmitter.emit('error', err);
    } else if (market.exchange == "kraken" && body["error"][0]) {
      var err = market.symbol + '\t' + 'Error: ' + body["error"][0];
      eventEmitter.emit('error', err);
    } else {
      var newTrades = getNewTrades(market, body);
      if (newTrades.length > 0) {
        eventEmitter.emit('trades', market, newTrades);

        // Set new lastTrade
        var lastTrade = newTrades[newTrades.length - 1];
        market.lastTrade = lastTrade["tid"];
        market.save();
      }
    }
    var rateLimit = market.rateLimit || 2;
    setTimeout(fetchTradesRecursively, rateLimit * 1000, market); // milliseconds
  })
}

// Takes API response and parses new trades
function getNewTrades(market, body) {
  var rawTrades;

  // These APIs return more than just an array of trades
  if (["anx", "btce", "kraken", "hitbtc"].indexOf(market.exchange) != -1) {
    rawTrades = functions.valueForKeyPath(body, market.tradesPath);
  } else {
    rawTrades = body;
  }

  // Sloppy fix for non json API responses
  if (Array.isArray(rawTrades)) {
    return rawTrades.map(sanitizeTrade, market)
    .filter(isNewTrade, market);
  } else {
    // bitcoinde exceed rate limit
    // bitfinex truncated response
    eventEmitter.emit('error', market.symbol + " invalid response");
    return [];
  }
}

function sanitizeTrade(rawTrade, index, trades) {

  // These APIs return descending trades. Traverse in ascending order
  var descending = ["bitstamp", "btce", "bitcurex", "bitfinex", "itbit", "coinbase"];
  if (descending.indexOf(this.exchange) != -1)
    rawTrade = trades[trades.length - 1 - index];

  // Handle weird trade formats
  if (["bitfinex", "btce", "korbit"].indexOf(this.exchange) != -1) {
    rawTrade["date"] = rawTrade["timestamp"];
  } else if (this.exchange == "kraken") {
    rawTrade = {
      'amount': rawTrade[1],
      'price': rawTrade[0],
      'date': rawTrade[2],
      'tid': rawTrade[2] * 1000000000
    }
  } else if (this.exchange == "hitbtc") {
    rawTrade = {
      'amount': rawTrade[2],
      'price': rawTrade[1],
      'date': rawTrade[3],
      'tid': rawTrade[0]
    }
  } else if (this.exchange == "okcoin") {
    // var date = new Date.parse(rawTrade[0]);
    // console.log(rawTrade);
    // rawTrade = {
    //   'amount': rawTrade[2],
    //   'price': rawTrade[1],
    //   'date': 
    // }
  } else if (this.exchange == "coinbase") {
    var date = Date.parse(rawTrade.time);

    rawTrade = {
      'amount': rawTrade.size,
      'price': rawTrade.price,
      'date': Math.floor(date/1000),
      'tid': rawTrade.trade_id
    }
  }

  // Korbit uses milliseconds
  if (this.exchange == "korbit")
    rawTrade["date"] = rawTrade["date"] / 1000;

  // Sanitize values
  var cleanTrade = {
    'exchange': this.symbol,
    'amount': parseFloat(rawTrade["amount"]),
    'price': parseFloat(rawTrade["price"]),
    'date': parseInt(rawTrade["date"]),
    'tid': parseInt(rawTrade["tid"])
  }

  return cleanTrade;
}

function isNewTrade(trade) {
  return trade["tid"] > this.lastTrade;
}



/* Order Book */

function fetchOrderBook(market, recursive) {
  request.get({
    url: market.ordersURL,
    json: true,
    headers: {
      'user-agent': 'Coins Live'
    },
  }, function (error, response, body) {
    if (error) {
      var err = market.symbol + '\t' + error;
      eventEmitter.emit('error', err);
    } else if (response.statusCode != 200) {
      var err = market.symbol + '\t' + 'Response Status: ' + response.statusCode;
      eventEmitter.emit('error', err);
    } else if (market.exchange == "kraken" && body["error"][0] == "EAPI:Rate limit exceeded") {
      var err = market.symbol + '\t' + 'Error: Exceeded rate limit';
      eventEmitter.emit('error', err);
    } else {
      var rawAsks = functions.valueForKeyPath(body, market.asksPath);
      var rawBids = functions.valueForKeyPath(body, market.bidsPath);

      var orders = {
        "asks": {},
        "bids": {},
        "sequence": body["sequence"]
      }

      if (rawAsks) {
        rawAsks.forEach(function(ask, index) {

          if (market.exchange == "bitfinex") {
            var price = ask["price"];
            var size = ask["amount"];
            orders.asks[price] = [price, size];
          }

          else {
            var price = parseFloat(ask[0]);
            var size = parseFloat(ask[1]);
            orders.asks[price] = [price, size];
          }
        })
      }


      if (rawBids) {
        rawBids.forEach(function(bid, index) {
          if (market.exchange == "bitfinex") {
            var price = bid["price"];
            var size = bid["amount"];
            orders.bids[price] = [price, size];
          }

          else {
            var price = parseFloat(bid[0]);
            var size = parseFloat(bid[1]);
            orders.bids[price] = [price, size];
          }
        })
      }

      eventEmitter.emit('orders', market, orders);
    }

    if (recursive == "recursive") {
      var rateLimit = market.rateLimit || 2;
      setTimeout(fetchOrderBook, market.rateLimit * 1000, market, "recursive");
    }
  })
}

function sanitizeOrder(order) {
  return [order[0], order[1]]
}



module.exports = eventEmitter;
