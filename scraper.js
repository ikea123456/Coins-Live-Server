var mongoose = require('mongoose'),
  request = require('request'),
  https = require('https'),
  io = require('socket.io-client'),
  events = require('events'),
  functions = require('functions.js');

var eventEmitter = new events.EventEmitter();

var Market = mongoose.model('market', mongoose.Schema({

  // Metadata
  exchange: String,
  symbol: String,
  item: String,
  currency: String,

  // API
  tickerURL: String,
  tradesURL: String,
  ordersURL: String,
  socketURL: String,
  timePath: String,
  tradesPath: String,
  lastTrade: String,
  rateLimit: Number,

  // Market data
  latestTrade: Object,
  hourTrades: Object,
  dayTrades: Object,
  weekTrades: Object,
  monthTrades: Object,
  yearTrades: Object

}));

//Begin updating markets
var db = mongoose.connection;
mongoose.connect('mongodb://localhost/markets');
db.on('error', console.error.bind(console, 'mongo error:'));
db.once('open', function cb() {
  console.log("Connected to db.")
  beginUpdatingMarkets();
});

function beginUpdatingMarkets() {
  Market.find({}, function (error, markets) {
    if (error)
      console.log(error);

    else
      for (var m in markets) {
        var market = markets[m];
        if (!market.socketURL) {
          var rateLimit = market.rateLimit || 2;
          setInterval(fetchTrades, rateLimit * 1000, market); // milliseconds
        }
      }
  });
}

function fetchTrades(market) {
  var options = {
    url: market.tradesURL + market.lastTrade,
    json: true,
    headers: {'user-agent': 'Coins Live'},
    timeout: 5000
  }

  request.get(options, function (error, response, body) {

    if (error)
      console.log(market.symbol + '\t' + error);

    else if (response.statusCode != 200) {
      console.log(market.symbol + '\t' + 'returned status code ' + response.statusCode);
    }

    else if (market.exchange == "kraken" && body["error"][0] == "EAPI:Rate limit exceeded")
      console.log(market.symbol + "\tError: Exceeded rate limit");

    else {
      var newTrades = getNewTrades(market, body);
      if (newTrades.length>0) {
        console.log(market.symbol + ":\t" + newTrades.length + " trades");

        // Set new lastTrade
        var lastTrade = newTrades[newTrades.length-1];
        market.lastTrade = lastTrade["tid"];
        market.save();

        eventEmitter.emit('newTrades', newTrades);
      }
    }
  })
}

// Takes API response and returns 
function getNewTrades(market, body) {

  var rawTrades;

  // These APIs return more than just an array of trades
  if (["anx", "btce", "kraken", "hitbtc", "btcde"].indexOf(market.exchange) != -1)
    rawTrades = functions.valueForKeyPath(body, market.tradesPath);
  else
    rawTrades = body;

  if (Array.isArray(rawTrades)) {
    var cleanTrades = rawTrades.map(sanitizeTrade, market);
    var newTrades = cleanTrades.filter(isNewTrade, market);
  }
  else {
    console.log("Not an array");
    return [];
  }

  return newTrades;
}

function sanitizeTrade(rawTrade, index, trades) {

  // Traverse array in ascending order if weird API
  var descending = ["bitstamp", "btce", "bitcurex", "bitfinex", "itbit", "btcde"];
  if (descending.indexOf(this.exchange) != -1)
    rawTrade = trades[trades.length-1-index];

  // Handle weird trade formats
  if (["bitfinex", "btce", "korbit"].indexOf(this.exchange) != -1) {
    rawTrade["date"] = rawTrade["timestamp"];
  } 
  else if (this.exchange == "kraken") {
    rawTrade = {
      'amount': rawTrade[1],
      'price': rawTrade[0],
      'date': rawTrade[2],
      'tid': rawTrade[2] * 1000000000
    }
  } 
  else if (this.exchange == "hitbtc") {
    rawTrade = {
      'amount': rawTrade[2],
      'price': rawTrade[1],
      'date': rawTrade[3],
      'tid': rawTrade[0]
    }
  }

  // Convert from microseconds
  if (this.exchange == "korbit")
    rawTrade["date"] = rawTrade["date"] / 1000;

  // Sanitize values
  var cleanTrade = {
    'amount': parseFloat(rawTrade["amount"]).toFixed(2),
    'price': parseFloat(rawTrade["price"]).toFixed(2),
    'date': parseInt(rawTrade["date"]),
    'tid': rawTrade["tid"]
  }

  return cleanTrade;
}

function isNewTrade(trade) {
  return trade["tid"] > this.lastTrade;
}