const Schema = require('mongoose').Schema;  

const Market = module.exports = new Schema({ 
	// Metadata
  exchange: String,
  symbol: String,
  item: String,
  currency: String,

   // Market data
  latestTrade: Object,
  hourTrades: Object,
  dayTrades: Object,
  weekTrades: Object,
  monthTrades: Object,
  yearTrades: Object,
  asks: Object,
  bids: Object,
  messageQueue: Object,
  subscribeMessage: Object,

  // API
  tickerURL: String,
  tradesURL: String,
  ordersURL: String,
  socketURL: String,
  tradesPath: String,
  asksPath: String,
  bidsPath: String,
  lastTrade: String,
  rateLimit: Number,
  syncedBook: Boolean

  // TODO: All trades in one data structure
  // with appropriate intervals for zooming
}); 