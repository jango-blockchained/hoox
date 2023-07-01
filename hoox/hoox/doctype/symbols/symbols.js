// Copyright (c) 2023, jango_blockchained and contributors
// For license information, please see license.txt

frappe.ui.form.on("Symbols", {
  onload: async (frm) => {
    frm.fields_dict.chart.wrapper.innerHTML =
      '<div id="chart_price" style="width: 100%; height: 300px;"></div>' +
      '<div id="chart_vol" style="width: 100%; height: 150px;"></div>';
    await frappe.call({
      method: "hoox.action.fetch_ohlcv",
      args: {
        exchange_id: frm.doc.exchange,
        symbol: frm.doc.symbol_id,
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
              },
            ],
          },
          colors: ["hsl(251, 76%, 55%)"],
          type: "line",
          height: 300,
          axisOptions: {
            xIsSeries: true,
            xAxisMode: "tick",
            tickFormat: "%Y-%m-%d",
            yAxisMode: "span",
            yAxisTickCount: 5,
            yAxisLabel: "Price",
            yAxisFormat: "$ 0,0",
            limit: 50,
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
              },
            ],
          },
          colors: ["hsl(332, 100%, 41%)"],
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
          limit: 50,
        });
      },
    });
    // --
    let themeSwitcher = new frappe.ui.ThemeSwitcher();
    frm.fields_dict.chart.wrapper.innerHTML = frappe.render_template(
      "hoox/templates/tradingview/ta.html",
      {
        timeframe: "15m",
        symbol: frm.doc.symbol_id,
        theme: themeSwitcher.current_theme,
      }
    );
    // --
    frm
      .add_custom_button(__("Show Data"), function () {
        let jsonContent = JSON.parse(frm.doc.params);
        let Fields = [];
        for (let key in jsonContent) {
          if (jsonContent.hasOwnProperty(key)) {
            let value = jsonContent[key];
            Fields.push({
              fieldtype: "Data",
              label: key,
              fieldname: key,
              default: value,
              read_only: true,
            });
          }
        }
        let d = new frappe.ui.Dialog({
          title: __("Symbol Market Data"),
          fields: Fields,
          size: "small",
          primary_action_label: __("Hide"),
          primary_action(values) {
            d.hide();
          },
        });
        d.show();
      })
      .css({ "background-color": "#5451f0", color: "#fff" });
  },
});

// frappe.form.link_formatters['exchange'] = function(value, doc) {
//     if(doc.employee_name && doc.employee_name !== value) {
//         return value + ': ' + doc.employee_name;
//     } else {
//         return value;
//     }
// }
