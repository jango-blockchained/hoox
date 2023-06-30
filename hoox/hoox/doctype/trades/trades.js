// // Copyright (c) 2023, jango_blockchained and contributors
// // For license information, please see license.txt

frappe.ui.form.on("Trades", {
  refresh: function (frm) {
    frm.fields_dict.tvchart.wrapper.innerHTML =
      '<div id="trades_chart" style="width: 100%; height: 300px;"></div>';
    frappe.call({
      method: "hoox.action.fetch_ohlcv",
      args: {
        exchange_id: frm.doc.exchange, // Replace with the actual exchange ID
        symbol: frm.doc.symbol, // Replace with the actual symbol
        timeframe: "15m", // Replace with the actual timeframe
      },
      callback: function (response) {
        const labels = response.message.map((ohlcv) => {
          let date = new Date(ohlcv[0]);
          return date.toLocaleString("en-US", {
            weekday: "short",
            hourCycle: "h24",
            hour: "numeric",
            minute: "numeric",
          });
          // return frappe.datetime.str_to_user(date, frappe.get_user_locale());
        });

        const values = response.message.map((ohlcv) => {
          return ohlcv[4];
        });

        const volumes = response.message.map((ohlcv) => {
          return ohlcv[5];
        });

        const chart = new frappe.Chart("#trades_chart", {
          title: `${frm.doc.symbol} Price Chart`,
          data: {
            labels: labels,
            datasets: [
              {
                name: "Price",
                values: values,
                chartType: "line",
              },
              {
                name: "Volume",
                values: volumes,
                chartType: "bar",
              },
            ],
          },
          type: "axis-mixed",
          height: 300,
          annotations: [
            {
              type: "line",
              value: frm.doc.avg_exec_price,
              series: "Price",
              label: frm.doc.action.toUpperCase(),
              backgroundColor: "#ff8800",
              borderColor: "#ff7300",
              borderWidth: 2,
              x: new Date(frm.doc.creation),
              // position: "start",
              // style: {
              //   "stroke-width": 4,
              //   stroke: "#00c3ff",
              // },
            },
          ],
        });
      },
    });
  },
});
