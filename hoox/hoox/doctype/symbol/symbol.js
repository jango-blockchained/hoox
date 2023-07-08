// Copyright (c) 2023, jango_blockchained and contributors
// For license information, please see license.txt
async function createChartForSymbol(
  elementId,
  title,
  xAxisTickCount,
  yAxisTickCount,
  yAxisLabel,
  yAxisFormat,
  chartType,
  labels,
  values,
  colors
) {
  return new frappe.Chart(elementId, {
    title: title,
    data: {
      labels: labels,
      datasets: [
        {
          name: yAxisLabel,
          values: values,
          chartType: chartType,
        },
      ],
    },
    colors: colors,
    type: chartType,
    height: chartType === "line" ? 300 : 150,
    axisOptions: {
      xIsSeries: true,
      xAxisMode: "tick",
      xAxisTickCount: xAxisTickCount,
      tickFormat: "%Y-%m-%d",
      yAxisMode: "span",
      yAxisTickCount: yAxisTickCount,
      yAxisLabel: yAxisLabel,
      yAxisFormat: yAxisFormat,
    },
    tooltipOptions: {
      formatTooltipX: (d) => (d instanceof Date ? d.toDateString() : d),
      formatTooltipY: (d) => yAxisFormat.charAt(0) + " " + d,
    },
  });
}

frappe.ui.form.on("Symbol", {
  onload: function (frm) {
    // frm.fields_dict.widget_ta.wrapper.innerHTML = `
    //   <!-- TradingView Widget BEGIN -->
    //   <div class="tradingview-widget-container">
    //       <div class="tradingview-widget-container__widget"></div>
    //       <div class="tradingview-widget-copyright"><a href="https://de.tradingview.com/" rel="noopener nofollow" target="_blank"><span class="blue-text">Alle Märkte bei TradingView verfolgen</span></a></div>
    //       <script type="text/javascript"
    //           src="https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js" async>
    //               {
    //                   "interval": "15m",
    //                       "width": "100%",
    //                           "isTransparent": true,
    //                               "height": "100%",
    //                                   "symbol": "BTCUSDT",
    //                                       "showIntervalTabs": true,
    //                                           "locale": "de_DE",
    //                                               "colorTheme": "dark"
    //               }
    //           </script>
    //   </div>
    //   <!-- TradingView Widget END -->`;
  },
  refresh: async (frm) => {
    frm.fields_dict.chart.wrapper.innerHTML =
      '<div id="chart_price" style="width: 100%; height: 300px;"></div>' +
      '<div id="chart_vol" style="width: 100%; height: 150px;"></div>';
    await frappe.call({
      method: "hoox.hoox.doctype.symbol.symbol.fetch_ohlcv",
      args: {
        exchange_id: frm.doc.exchange,
        market: frm.doc.market_type,
        symbol: frm.doc.symbol_id,
        timeframe: "15m",
      },
      callback: async (response) => {
        const data = response.message.map((ohlcv) => {
          let date = new Date(ohlcv[0]);
          return {
            label: date.toLocaleString("en-US", {
              weekday: "short",
              hourCycle: "h24",
              month: "numeric",
              day: "numeric",
              hour: "numeric",
              minute: "numeric",
            }),
            value: ohlcv[4],
            volume: ohlcv[5],
          };
        });
        const labels = data.map((d) => d.label);
        const values = data.map((d) => d.value);
        const volumes = data.map((d) => d.volume);

        const chart_price = await createChartForSymbol(
          "#chart_price",
          `${frm.doc.symbol} Price Chart`,
          50,
          4,
          "Price",
          "$ 0,0",
          "line",
          labels,
          values,
          ["hsl(251, 76%, 55%)"]
        );

        const chart_vol = await createChartForSymbol(
          "#chart_vol",
          `${frm.doc.symbol} Volume Chart`,
          50,
          3,
          "Qty.",
          "0,0",
          "bar",
          labels,
          volumes,
          ["hsl(332, 100%, 41%)"]
        );
      },
    });

    // --
    // let themeSwitcher = new frappe.ui.ThemeSwitcher();
    // frm.fields_dict.widget_ta.wrapper.innerHTML = frappe.render_template(
    //   "templates/tradingview/ta.html",
    //   {
    //     timeframe: "15m",
    //     symbol: frm.doc.symbol_id,
    //     theme: themeSwitcher.current_theme,
    //   }
    // );
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
      .css({ "background-color": "hsl(251, 76%, 55%)", color: "#fff" });

    // frm.add_custom_button(__("Fetch OHLCV Data"), function () {
    //   frappe.call({
    //     method: "hoox.hoox.doctype.symbol.symbol.fetch_ohlcv_data",
    //     args: {
    //       symbol: frm.doc.symbol,
    //       interval: frm.doc.interval,
    //       exchange_name: frm.doc.exchange_name,
    //       from_date_time: frm.doc.from_date_time,
    //       page_size: frm.doc.page_size,
    //     },
    //     callback: function (r) {
    //       frm.reload_doc();
    //     },
    //   });
    // });
  },
});

// frappe.form.link_formatters['exchange'] = function(value, doc) {
//     if(doc.employee_name && doc.employee_name !== value) {
//         return value + ': ' + doc.employee_name;
//     } else {
//         return value;
//     }
// }
