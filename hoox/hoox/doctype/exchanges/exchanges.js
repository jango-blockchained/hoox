frappe.ui.form.on('Exchanges', {
	refresh: function(frm) {
		frm.add_custom_button(__('Sync Exchanges'), function() {
			frappe.call({
				method: 'trading.trading.doctype.exchanges.exchanges.sync_exchanges',
				callback: function(r) {
					if(!r.exc) {
						frappe.msgprint(__('Exchanges synced successfully.'));
						frm.reload_doc();
					}
				}
			});
		});
	}
});
