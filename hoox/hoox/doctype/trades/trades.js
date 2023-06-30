frappe.ui.form.on("Trades", {
  refresh: function (frm) {
    frm.fields_dict.tvchart.wrapper.innerHTML =
      '<div id="chart_price" style="width: 100%; height: 300px;"></div>' +
      '<div id="chart_vol" style="width: 100%; height: 150px;"></div>';
    frappe.call({
      method: "hoox.action.fetch_ohlcv",
      args: {
        exchange_id: frm.doc.exchange,
        symbol: frm.doc.symbol,
        timeframe: "15m",
      },
      callback: function (response) {
        const labels = response.message.map((ohlcv) => {
          let date = new Date(ohlcv[0]);
          return date.toLocaleString("en-US", {
            weekday: "short",
            hourCycle: "h24",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
          });
        });

        const values = response.message.map((ohlcv) => {
          return ohlcv[4];
        });

        const volumes = response.message.map((ohlcv) => {
          return ohlcv[5];
        });

        const chart_price = new frappe.Chart("#chart_price", {
          title: `${frm.doc.symbol} Price Chart`,
          data: {
            labels: labels,
            datasets: [
              {
                name: "Price",
                values: values,
                chartType: "line",
                color: "hsl(251, 76%, 55%)",
              },
            ],
          },
          type: "line",
          height: 300,
          annotations: [
            {
              type: "line",
              value: 0.07,
              series: "Price",
              label: frm.doc.action.toUpperCase(),
              backgroundColor: "#ff8800",
              borderColor: "#ff7300",
              borderWidth: 2,
              x: new Date(frm.doc.creation), // Modify the x value to a valid JavaScript Date object
            },
          ],
          axisOptions: {
            xIsSeries: true,
            xAxisMode: "tick",
            tickFormat: "%Y-%m-%d",
            yAxisMode: "span",
            yAxisTickCount: 5,
            yAxisLabel: "Price",
            yAxisFormat: "$ 0,0",
          },
          tooltipOptions: {
            formatTooltipX: (d) => (d instanceof Date ? d.toDateString() : d),
            formatTooltipY: (d) => "$ " + d,
          },
        });
        // --
        const chart_vol = new frappe.Chart("#chart_vol", {
          title: `${frm.doc.symbol} Volume Chart`,
          data: {
            labels: labels,
            datasets: [
              {
                name: "Volume",
                values: volumes,
                chartType: "bar",
                color: "hsl(332, 100%, 41%)",
              },
            ],
          },
          type: "bar",
          height: 150,
          axisOptions: {
            xIsSeries: true,
            xAxisMode: "tick",
            tickFormat: "%Y-%m-%d",
            yAxisMode: "span",
            yAxisTickCount: 5,
            yAxisLabel: "Qty.",
            yAxisFormat: "0,0",
          },
          tooltipOptions: {
            formatTooltipX: (d) => (d instanceof Date ? d.toDateString() : d),
            formatTooltipY: (d) => "x " + d,
          },
        });
      },
    });
  },
});
