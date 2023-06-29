// // Copyright (c) 2023, jango_blockchained and contributors
// // For license information, please see license.txt

// frappe.ui.form.on("Trades", {
//   refresh: function (frm) {
//     $(frm.fields_dict.tvchart.wrapper).html(
//       '<div id="lightchart" style="width: 100%; height: 500px;"></div>'
//     );

//     // --
//     frappe.call({
//       method: "hoox.action.fetch_ohlcv",
//       args: {
//         exchange_id: frm.doc.exchange, // Replace with the actual exchange ID
//         symbol: frm.doc.symbol, // Replace with the actual symbol
//         timeframe: "1m", // Replace with the actual timeframe
//       },
//       callback: function (response) {
//         let data = response.message;
//         let bars = data.map((kline) => {
//           return {
//             time: kline[0] / 1000,
//             open: kline[1],
//             high: kline[2],
//             low: kline[3],
//             close: kline[4],
//           };
//         });
//         let chart = LightweightCharts.createChart(
//           document.getElementById("lightchart")
//         );
//         let candleSeries = chart.addCandlestickSeries();
//         candleSeries.setData(bars);
//       },
//     });
//   },
// });
frappe.ui.form.on("Trades", {
  refresh: async function (frm) {
    const { fetchAndDisplayData } = await import("/assets/js/chart_bundle.js");

    $(frm.fields_dict.tvchart.wrapper).html(
      '<div id="lightchart" style="width: 100%; height: 500px;"></div>'
    );

    fetchAndDisplayData(frm.doc.exchange, frm.doc.symbol, "1m");
  },
});
