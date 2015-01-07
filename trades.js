var mongoose = require('mongoose'),
  request = require('request'),
  io = require('socket.io-client'),
  events = require('events'),
  functions = require('./functions.js');

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

//Connect to db and begin updating markets
var db = mongoose.connection;
mongoose.connect('mongodb://localhost/markets');
db.on('error', console.error.bind(console, 'mongo error:'));
db.once('open', function cb() {
  beginUpdatingMarkets();
  // anxSocket();
});

function beginUpdatingMarkets() {
  Market.find({}, function (error, markets) {
    if (error) {
      console.log(error);
    } else {
      for (var m in markets) {
        var market = markets[m];
        if (market.socketURL) {
        }
         else {
          var rateLimit = market.rateLimit || 2;
          fetchTrades(market);
          setInterval(fetchTrades, rateLimit * 1000, market); // milliseconds
        }
      }
    }
  });
}

function anxSocket() {
  console.log("Connecting");
  var socket = io('https://anxpro.com/streaming/3');


  socket.on('connect', function(){
    console.log("Connected to " + market.symbol)
  });

  socket.on('event', function(data){

  });

  socket.on('disconnect', function(){

  });

  socket.on('error', function(err){
    console.log(err);
  });
}

// Fetch new trades from exchange API
function fetchTrades(market) {
  var options = {
    url: market.tradesURL + market.lastTrade,
    json: true,
    headers: {
      'user-agent': 'Coins Live'
    },
    timeout: 5000
  }

  request.get(options, function (error, response, body) {

    if (error) {
      var err = market.symbol + '\t' + error;
      eventEmitter.emit('error', err);
    } else if (response.statusCode != 200) {
      var err = market.symbol + '\t' + 'Error ' + response.statusCode;
      eventEmitter.emit('error', err);
    } else if (market.exchange == "kraken" && body["error"][0] == "EAPI:Rate limit exceeded") {
      var err = market.symbol + "\tError: Exceeded rate limit";
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

  // Sloppy fix for weird API responses
  if (Array.isArray(rawTrades)) {
    var cleanTrades = rawTrades.map(sanitizeTrade, market);
    var newTrades = cleanTrades.filter(isNewTrade, market);
  } else {
    eventEmitter.emit('error', market.symbol + '\t' + 'weird response');
    return [];
  }

  return newTrades;
}

function sanitizeTrade(rawTrade, index, trades) {

  // Traverse array in ascending order if weird API
  var descending = ["bitstamp", "btce", "bitcurex", "bitfinex", "itbit"];
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
  }

  // Korbit uses milliseconds
  if (this.exchange == "korbit")
    rawTrade["date"] = rawTrade["date"] / 1000;

  // Sanitize values
  var cleanTrade = {
    'exchange': this.symbol,
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

module.exports = eventEmitter;