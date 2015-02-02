var markets = require('./markets.js'),
  functions = require('./functions.js'),
  mongoose = require('mongoose');

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
      }
    }
  });
}

markets.on('orders', function (market, orders) {
  orderbook[market.symbol]['asks'] = orders['asks'];
  orderbook[market.symbol]['bids'] = orders['bids'];
})

module.exports = {
  ordersOfMarket: function (market) {
    if (orderbook[market])
      return orderbook[market];
  }
}