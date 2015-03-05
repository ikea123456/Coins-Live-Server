var markets = require('./markets.js'),
  functions = require('./functions.js'),
  mongoose = require('mongoose'),
  events = require('events');

var eventEmitter = new events.EventEmitter();

var orderbook = {};
var Market = mongoose.model('market');
readOrdersFromDb();

function readOrdersFromDb() {
  Market.find({}, function (error, markets) {
    if (error) {
      console.log(error);
    } else {
      for (var m in markets) {
        var market = markets[m];
        orderbook[market.symbol] = {};
        orderbook[market.symbol]['asks'] = market.asks || {};
        orderbook[market.symbol]['bids'] = market.bids || {};
        orderbook[market.symbol]['sorted'] = {};
        orderbook[market.symbol]['sorted']['asks'] = {};
        orderbook[market.symbol]['sorted']['bids'] = {};
      }
    }
  });
}

markets.on('order', function (market, order) {

  if (!market.syncedBook) {
    market.messageQueue = market.messageQueue || [];
    market.messageQueue.push(order);
  }

  else {
    if (market.exchange == "coinbase") {
      console.log('coinbase')
    }
    processOrder(market, order);
  }
})

markets.on('orders', function (market, orders) {
  calculateChanges(market, orders);
  orderbook[market.symbol]["asks"] = orders["asks"];
  orderbook[market.symbol]["bids"] = orders["bids"];
  if (market.messageQueue) {
    market.messageQueue.forEach(function(message) {
      if (message["sequence"] < orders["sequence"]) {
        console.log("Handling queued " + message["type"]);
      }
    })
    market.messageQueue = null;
  }
  market.syncedBook = true;
  sortOrderBook(market, "asks");
  sortOrderBook(market, "bids");
})

markets.on('order_diff', function (market, changes) {
  eventEmitter.emit('change', market.symbol, changes);
  for (var o in changes["asks"]) {
    var order = changes["asks"][o];
    if (order[1] == 0) {
      delete orderbook[market.symbol]["asks"][order[0]];
    }
    else {
      orderbook[market.symbol]["asks"][order[0]] = order;
    }
  }

  for (var o in changes["bids"]) {
    var order = changes["bids"][o];
    if (order[1] == 0) {
      delete orderbook[market.symbol]["bids"][order[0]];
    }
    else {
      orderbook[market.symbol]["bids"][order[0]] = order;
    }
  }

  sortOrderBook(market, "asks");
  sortOrderBook(market, "bids");
})


//why sending 0s for orders that dont exist on the book?
function calculateChanges(market, orders) {

  var add = {
    "asks": [],
    "bids": []
  }

  var remove = {
    "asks": [],
    "bids": []
  }

  var update = {
    "asks": [],
    "bids": []
  }

  var changes = {
    "asks": [],
    "bids": []
  }

  var originalAsks = orderbook[market.symbol]["asks"];
  var originalBids = orderbook[market.symbol]["bids"]

  for (price in orders["asks"]) {
    if (originalAsks[price]) {
      var oldSize = originalAsks[price][1];
      var newSize = orders["asks"][price][1];
      if (newSize != oldSize) {
        changes["asks"].push([price, newSize]);
      }
    } else {
      changes["asks"].push(orders["asks"][price]);
    }
  }

  for (price in originalAsks) {
    if (!orders["asks"][price]) {
      changes["asks"].push([price, 0]);
    }
  }

  for (price in orders["bids"]) {
    if (originalBids[price]) {
      var oldSize = originalBids[price][1];
      var newSize = orders["bids"][price][1];
      if (newSize != oldSize) {
        changes["bids"].push([price, newSize]);
      }
    } else {
      changes["bids"].push(orders["bids"][price]);
    }
  }

  for (price in originalBids) {
    if (!orders["bids"][price]) {
      changes["bids"].push([price, 0]);
    }
  }

  eventEmitter.emit('change', market.symbol, changes);
}


function processOrder(market, order) {
  var side = order["side"];
  var type = order["type"];
  if (type == "open" ||
      type == "received" ||
      type == "changed") {
    var newData = [order.price, order.size];
    orderbook[market.symbol][side][order.price] = newData;
    // eventEmitter.emit('change', market.symbol, changes);
  }

  if (type == "done") {
    delete orderbook[market.symbol][side][order.price];
  }

  sortOrderBook(market, side);

}

function sortOrderBook(market, side) {
  var sortedKeys = [];
  for (var key in orderbook[market.symbol][side]) {
    sortedKeys.push(key);
  }

  if (side == "bids")
    sortedKeys.sort(function(a,b) { 
      return parseFloat(b) - parseFloat(a); 
    });

  else
    sortedKeys.sort(function(a,b) { 
      return parseFloat(a) - parseFloat(b); 
    });

  for (var k in sortedKeys) {
    var key = sortedKeys[k];
    sortedKeys[k] = orderbook[market.symbol][side][key];
  }

  orderbook[market.symbol]['sorted'][side] = sortedKeys;
}

module.exports = {
  ordersOfMarket: function (market) {
    if (orderbook[market])
      return orderbook[market]['sorted'];
  },
  orders: eventEmitter
}