// markets_list.js

frappe.listview_settings["Market Type"] = {
  refresh: function (listview) {
    // Add a custom button to the list view toolbar
    listview.page.add_menu_item(__("Fetch Exchange Market Types"), function () {
      // Open a dialog to select an exchange
      frappe.prompt(
        {
          label: __("Select Exchange"),
          fieldname: "exchange_id",
          fieldtype: "Link",
          options: "Exchange",
          reqd: 1,
        },
        function (data_exchange) {
          // Fetch the supported market types for the selected exchange
          frappe.call({
            method:
              "hoox.hoox.doctype.market_type.market_type.get_supported_market_types",
            args: {
              exchange_id: data_exchange.exchange_id,
            },
            freeze: true,
            freeze_message: __("Loading Markets..."),
            callback: function (response) {
              // Display the fetched market types in a dialog list
              frappe.prompt(
                {
                  label: __("Select Market Types"),
                  fieldname: "market_types",
                  fieldtype: "MultiSelectList",
                  options: response.message,
                },
                function (data) {
                  // Insert the selected market types into the Market Type doctype
                  frappe.call({
                    method:
                      "hoox.hoox.doctype.market_type.market_type.insert_market_types",
                    args: {
                      exchange: data_exchange.exchange_id,
                      market_types: data.market_types,
                    },
                    freeze: true,
                    freeze_message: __("Insert Markets..."),
                    callback: function (response) {
                      // Show a success message or perform any other actions
                      frappe.msgprint("Market types inserted successfully!");
                    },
                  });
                }
              );
            },
          });
        }
      );
    });
  },
};
