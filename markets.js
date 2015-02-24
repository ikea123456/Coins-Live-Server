var mongoose = require('mongoose'),
  request = require('request'),
  WebSocket = require('ws'),
  Pusher = require('pusher-client'),
  io = require('socket.io-client'),
  oldio = require('socket.io-client-old'),
  events = require('events'), // use streams/queue instead!!
  functions = require('./functions.js');

var eventEmitter = new events.EventEmitter();

var Market = mongoose.model('market', require('./market'));



/* LakeBTC Socket */

var lakebtc;
openLakebtc();

function openLakebtc() {
  lakebtc = new WebSocket('wss://www.lakebtc.com/websocket');

  lakebtc.on('open', function() {
    console.log('lakebtc open');
    var subscribe = ["websocket_rails.subscribe",{"id":0,"data":{"channel":"orderbook_USD"}}];
    lakebtc.send(JSON.stringify(subscribe));

    lakebtc.on('message', function(message, flags) {
      var data = JSON.parse(message);
      var event = data[0][0];

      if (event == 'websocket_rails.ping') {
        var pong = ["websocket_rails.pong", {}];
        lakebtc.send(JSON.stringify(pong));
      }

      else if (event == 'update') {
        var update = data[0][1];
        // console.log(update);
      }
    })
  })

  lakebtc.on('close', function() {
    console.log('lakebtc closed');
    setTimeout(openLakebtc, 3000);
  })

  lakebtc.on('error', function() {
    console.log('lakebtc error');
    setTimeout(openLakebtc, 3000);
  })
}


/* BTC China WebSocket */

var btcchina = io('https://websocket.btcchina.com/');

btcchina.on('connect', function() {
  btcchina.emit('subscribe', 'marketdata_cnybtc');
})

btcchina.on('trade', function (data) {
  var cleanTrade = {
    'exchange': 'btcchinaBTCCNY',
    'price': parseFloat(data.price),
    'amount': parseFloat(data.amount),
    'date': parseInt(data.date)
  }
  console.log('btcchina trade');
});

/* Huobi WebSocket -- crap api */

var huobi = oldio.connect('hq.huobi.com:80');

huobi.on('connect', function() {
  var symbolList = {
    'marketDepthDiff': [{"symbolId":"btccny","pushType":"array","percent":"100"}],
    'tradeDetail': [{"symbolId":"btccny","pushType":"pushLong"}]
  }
  var data = {"symbolList":symbolList, "version":1, "msgType":"reqMsgSubscribe","requestIndex":Date.now()};
  huobi.emit('request', data);
});

huobi.on('message', function(data){
  if (data.msgType == 'marketDepthDiff') {
    // console.log(data.payload.version);
  } else if (data.msgType == 'tradeDetail') {

    var symbol = data.payload.symbolId;
    var prices = data.payload.price;
    var times = data.payload.time;
    var sizes = data.payload.amount;
    var ids = data.payload.tradeId;

    var cleanTrades = [];

    for (var i=0; i < prices.length; i++) {
      if (i<times.length && i<times.length && i<sizes.length && i<ids.length) {
        cleanTrades.push({
          'exchange': 'huobi' + symbol,
          'price': parseFloat(prices[i]),
          'amount': parseFloat(sizes[i]),
          'date': parseInt(times[i]),
          'tid': ids[i]
        })
      } else {
        console.log("Huobi error: API trade arrays are not the same length!");
      }
    }

    console.log(symbol + ' trades: ' + cleanTrades.length);
  }
});

huobi.on('disconnect', function(){
  console.log("huobi dc");
});

huobi.on('error', function(err){
  console.log("huobi error: " + err);
});


/* OKCoin WebSocket */

var okcoin;
openOkCoin();

function openOkCoin() {
  okcoin = new WebSocket('wss://real.okcoin.cn:10440/websocket/okcoinapi');
  okcoin.on('open', function() {
    // okcoin.send("{'event':'addChannel','channel':'ok_btccny_trades'}");

    okcoin.on('error', function(err) {
      console.log("okcoin socket error: " + err);
      setTimeout(openOkCoin, 3000);
    })

    okcoin.on('message', function(message, flags) {
      var data = JSON.parse(message)[0]; //okcoin api wraps responses in array for some reason

      if (data.channel == "ok_btccny_trades") {
        console.log(data);
        var cleanTrades = [];
        data.data.forEach(function(trade) {
          var rawDate = trade[2];
          var split = rawDate.split(':');
          var date = new Date();
          date.setUTCHours(+split[0]-8); // beijing to utc
          date.setUTCMinutes(split[1]);
          date.setUTCSeconds(split[2]);
          cleanTrades.push({
            "price": trade[0],
            "amount": trade[1],
            "date": parseInt(date.getTime() / 1000)
          })

        })
        Market.findOne({symbol: "okcoinBTCCNY"}, function (error, market) {
          eventEmitter.emit('trades', market, cleanTrades);
        });
      }

      else if (data.channel == 'ok_btccny_depth60') {
        var orders = {
          "asks": {},
          "bids": {}
        }

        var rawAsks = data.data["asks"];
        var rawBids = data.data["bids"];

        // ascending order
        for (var i = rawAsks.length-1; i > 0; i--) {
          var ask = rawAsks[i];
          var price = parseFloat(ask[0]);
          var size = parseFloat(ask[1]);
          orders.asks[price] = [price, size];
        } 

        for (var i = 0; i < rawBids.length; i++) {
          var bid = rawBids[i];
          var price = parseFloat(bid[0]);
          var size = parseFloat(bid[1]);
          orders.bids[price] = [price, size];
        }
        Market.findOne({symbol: "okcoinBTCCNY"}, function (error, market) {
          eventEmitter.emit('orders', market, orders);
        });
      }

    })
  })
}





/* Bitstamp WebSocket */

var bitstamp = new Pusher('de504dc5763aeef9ff52');
var bitstampSynced = false;

var bitstamp_orders = bitstamp.subscribe('diff_order_book');
var bitstamp_trades = bitstamp.subscribe('live_trades');


bitstamp_orders.on('data', function(data) {
  // if ((data["asks"] && data["asks"].length > 0) || (data["bids"] && data["bids"].length > 0)) {
    Market.findOne({exchange: "bitstamp"}, function (error, market) {
      if (!bitstampSynced)
        fetchOrderBook(market);
      eventEmitter.emit('order_diff', market, data);
    });
  // }
})

bitstamp_trades.on('trade', function(trade) {
  var now = parseInt(new Date().getTime() / 1000);
  var cleanTrade = {
      'price': trade.price,
      'amount': trade.amount,
      'date': now
  }
  Market.findOne({exchange: "bitstamp"}, function (error, market) {
    eventEmitter.emit('trades', market, [cleanTrade]);
  });
})



/* Coinbase WebSocket */

var sockets = {};
















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
        if (market.socketURL) {
          market.syncedBook = false;
          openSocket(market);
        } else {
          if (market.tradesURL && market.exchange != "bitstamp" && market.exchange != "lakebtc") {
            fetchTradesRecursively(market);
          }
          if (market.ordersURL) {
            if (market.exchange != "bitstamp" && market.exchange != "lakebtc" && market.symbol != "okcoinBTCCNY")
              fetchOrderBook(market, "recursive");
          }
        }
      }
    }
  });
}

function openSocket(market) {

  if (sockets[market.exchange]) {
    var socket = sockets[market.exchange];
    socket.send(market.subscribeMessage);
    fetchOrderBook(market);
  }

  else {
    var socket = new WebSocket(market.socketURL);
    socket.on('open', function(){
      socket.send(market.subscribeMessage);
      
      fetchOrderBook(market);

      socket.on('message', function(data, flags) {
        var rawMessage = JSON.parse(data);
        var cleanMessage = {
          "type": rawMessage["type"],
          "side": rawMessage["side"] == ("sell") ? "asks" : "bids",
          "price": parseFloat(rawMessage["price"]),
          "size": parseFloat(rawMessage.size || rawMessage.remaining_size || rawMessage.new_size),
          "sequence": rawMessage["sequence"],
        }
        eventEmitter.emit('order', market, cleanMessage);
      });
    });

    socket.on('error', function(err) {
      console.log(market.symbol + "error: " + err);
    })

    sockets[market.symbol] = socket;
  }
}

function fetchOrderBook(market, recursive) {
  request.get({
    url: market.ordersURL,
    json: true,
    headers: {
      'user-agent': 'Coins Live'
    },
    // rejectUnauthorized: false,
    timeout: 5000
  }, function (error, response, body) {
    if (error) {
      var err = market.symbol + '\t' + error;
      eventEmitter.emit('error', err);
    } else if (response.statusCode != 200) {
      var err = market.symbol + '\t' + 'Error: ' + response.statusCode;
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


function handleSocketMessage(message) {
  if (!market.syncedBook) {
    market.messageQueue.forEach(function(message) {
      if (message["sequence"] < sequence) {
        console.log("Handling queued " + message["type"]);
      eventEmitter.emit('orders', market, orders);
      }
    })
  }
}

// Fetch new trades from exchange API
function fetchTradesRecursively(market) {
  request.get({
    url: market.tradesURL + market.lastTrade,
    json: true,
    headers: {
      'user-agent': 'Coins Live'
    },
    rejectUnauthorized: false,
    timeout: 5000
  }, function (error, response, body) {
    if (error) {
      var err = market.symbol + '\t' + error;
      eventEmitter.emit('error', err);
    } else if (response.statusCode != 200) {
      var err = market.symbol + '\t' + 'Error: ' + response.statusCode;
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
    // in this case back off from api
    eventEmitter.emit('error', market.symbol + '\t' + body);
    return [];
  }
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
  // } else if (this.exchange == "okcoin") {
  //   var date = new Date.parse(rawTrade[0]);
  //   rawTrade = {
  //     'amount': rawTrade[2],
  //     'price': rawTrade[1],
  //     'date': 
  //   }
  // }

  // Korbit uses milliseconds
  if (this.exchange == "korbit")
    rawTrade["date"] = rawTrade["date"] / 1000;

  // Sanitize values
  var cleanTrade = {
    'exchange': this.symbol,
    'amount': parseFloat(rawTrade["amount"]),
    'price': parseFloat(rawTrade["price"]),
    'date': parseInt(rawTrade["date"]),
    'tid': rawTrade["tid"]
  }

  return cleanTrade;
}

function isNewTrade(trade) {
  return trade["tid"] > this.lastTrade;
}

module.exports = eventEmitter;
