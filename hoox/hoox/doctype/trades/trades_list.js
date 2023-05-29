frappe.listview_settings['Trades'] = {
    // add_fields: ['exchange', 'symbol', 'action', 'amount', 'price', 'fee', 'total', 'timestamp'],
    onload: function (listview) {
		listview.page.add_menu_item('Delete Trades', function () {
			frappe.call({
				method: 'hoox.hoox.action.delete_trades'
			});
		});
	}
//     get_indicator: function(doc) {
//         if(doc.action === "buy") {
//             return [__("Buy"), "green", "action,=,Buy"];
//         } else if(doc.action === "sell") {
//             return [__("Sell"), "red", "action,=,Sell"];
//         } else if(doc.action === "close") {
//             return [__("Close"), "blue", "action,=,Close"];
//         }
//     }
}
