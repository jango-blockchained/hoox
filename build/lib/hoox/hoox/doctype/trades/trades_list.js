frappe.listview_settings['Trades'] = {
	add_fields: ['exchange', 'action', 'symbol', 'quantity', 'price', 'fee', 'total', 'time'],
	onload: function(listview) {
		listview.page.add_inner_button(__('Delete Trades'), function() {
			frappe.confirm(__('Are you sure you want to delete all Trades?'), function() {
				frappe.call({
					method: 'hoox.hoox.action.delete_trades',
					callback: function(r) {
						if (r.message) {
							frappe.msgprint(r.message);
						}
					},
					freeze: true,
					freeze_message: __('Deleting Trades...')
				});
			});
		});
	},
	render: function(listview, doc) {
		// Update the time field value
		var timeValue = moment(doc.creation).format("YYYY-MM-DD HH:mm:ss");
		listview.set_secondary_value(doc, 'time', timeValue);
	}
	// get_indicator: function(doc) {
	//     if(doc.action === "buy") {
	//         return [__("Buy"), "green", "action,=,Buy"];
	//     } else if(doc.action === "sell") {
	//         return [__("Sell"), "red", "action,=,Sell"];
	//     } else if(doc.action === "close") {
	//         return [__("Close"), "blue", "action,=,Close"];
	//     }
	// }
};
