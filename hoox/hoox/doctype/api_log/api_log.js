frappe.ui.form.on('API Log', {
	refresh: function(frm) {
		if(frm.doc.status === 'Success') {
			frm.set_df_property('request_data', 'read_only', 1);
		}
	}
});
