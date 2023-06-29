// Copyright (c) 2023, jango_blockchained and contributors
// For license information, please see license.txt

frappe.ui.form.on("Trades", {
  refresh: function (frm) {
    $(frm.fields_dict.tvchart.wrapper).html(
      '<div id="chart" style="width: 100%; height: 500px;"></div>'
    );
    // --
    frappe.call({
      method: "hoox.api.crypto_data.fetch_ohlcv",
      args: {
        exchange_id: frm.doc.exchange, // Replace with the actual exchange ID
        symbol: frm.doc.symbol, // Replace with the actual symbol
        timeframe: "1m", // Replace with the actual timeframe
      },
      callback: function (response) {
        let data = response.message;
        let bars = data.map((datum) => {
          return {
            time: datum[0] / 1000,
            open: datum[1],
            high: datum[2],
            low: datum[3],
            close: datum[4],
          };
        });

        let chart = LightweightCharts.createChart(
          $(frm.fields_dict.tvchart.wrapper)
        );
        // document.getElementById("tvchart")
        let candleSeries = chart.addCandlestickSeries();
        candleSeries.setData(bars);
      },
    });
  },
});
