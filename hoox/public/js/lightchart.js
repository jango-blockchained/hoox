const ccxt = require("ccxt");
const { createChart } = import("lightweight-charts");

async function fetchAndDisplayData(exchangeId, symbol, timeframe) {
  // let exchange = new ccxt[exchangeId]();
  // let data = await exchange.fetchOHLCV(symbol, timeframe);

  // let bars = data.map((datum) => {
  //   return {
  //     time: datum[0] / 1000,
  //     open: datum[1],
  //     high: datum[2],
  //     low: datum[3],
  //     close: datum[4],
  //   };
  // });
  frappe.call({
    method: "hoox.action.fetch_ohlcv",
    args: {
      exchange_id: exchangeId, // Replace with the actual exchange ID
      symbol: symbol, // Replace with the actual symbol
      timeframe: timeframe, // Replace with the actual timeframe
    },
    callback: function (response) {
      let data = response.message;
      let bars = data.map((kline) => {
        return {
          time: kline[0] / 1000,
          open: kline[1],
          high: kline[2],
          low: kline[3],
          close: kline[4],
        };
      });
      let chart = createChart(document.getElementById("lightchart"));
      let candleSeries = chart.addCandlestickSeries();
      candleSeries.setData(bars);
    },
  });
}
