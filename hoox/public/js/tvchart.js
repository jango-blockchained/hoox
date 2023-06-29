const ccxt = require("ccxt");
const { createChart } = require("lightweight-charts");

(async () => {
  // Initialize the exchange object
  const exchange = new ccxt.binance();

  // Fetch OHLCV data
  const symbol = "BTC/USDT";
  const timeframe = "1h";
  const ohlcvData = await exchange.fetchOHLCV(symbol, timeframe);

  // Convert OHLCV data to the format required by TradingView Lightweight Charts
  const chartData = ohlcvData.map(([time, open, high, low, close]) => ({
    time: time / 1000,
    open,
    high,
    low,
    close,
  }));

  // Create the chart
  const chart = createChart(document.getElementById("tvchart"), {
    width: document.documentElement.clientWidth,
    height: 500,
  });

  // Add a candlestick series to the chart
  const candlestickSeries = chart.addCandlestickSeries();

  // Set the chart data
  candlestickSeries.setData(chartData);
})();
