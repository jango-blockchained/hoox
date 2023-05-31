// Copyright (c) 2023, jango_blockchained and contributors
// For license information, please see license.txt

frappe.ui.form.on('Trades', {
	refresh: function(frm) {
		if (!frm.doc.time) {
			frm.set_value('time', get_time(frm));
			frm.refresh_field('time');
			frm.save();
		}
	}
});

function get_time(frm) {
	return moment(doc.creation).format("YYYY-MM-DD HH:mm:ss");
}

