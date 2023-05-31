frappe.listview_settings['CCXT Exchanges'] = {
	add_fields: ['exchange_id', 'exchange_name', 'precision_mode', 'rate_limit', 'testnet'],
	filters: [['docstatus', '=', 1]],
	onload: function (listview) {
		listview.page.add_inner_button(__('Sync Exchanges'), function () {
			frappe.call({
				method: 'hoox.hoox.action.sync_exchanges',
				callback: function (r) {
					if (r.message) {
						frappe.msgprint(r.message);
					}
				},
				error: function (r) {
					if (r.message) {
						frappe.msgprint(r.message);
					}
				},
				freeze: true,
				freeze_message: __('Syncing Exchanges...')
			});
		});
		listview.page.add_inner_button(__('Delete Exchanges'), function () {
			frappe.call({
				method: 'hoox.hoox.action.delete_exchanges',
				callback: function (r) {
					if (r.message) {
						frappe.msgprint(r.message);
					}
				},
				error: function (r) {
					if (r.message) {
						frappe.msgprint(r.message);
					}
				},
				freeze: true,
				freeze_message: __('Deleting Exchanges...')
			});
		});
	}
}