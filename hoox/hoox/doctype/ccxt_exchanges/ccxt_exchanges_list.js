frappe.listview_settings['CCXT Exchanges'] = {
	add_fields: ['exchange_id', 'exchange_name', 'precision_mode', 'rate_limit', 'testnet'],
	filters: [['docstatus', '=', 1]],
	onload: function (listview) {
		listview.page.add_menu_item('Custom Button', function () {
			frappe.call({
				method: "hoox.hoox.exchange.sync_exchanges"
			});
		});
	}
}