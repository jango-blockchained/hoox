// Copyright (c) 2023, jango_blockchained and contributors
// For license information, please see license.txt

frappe.ui.form.on('Trades', {
	refresh: function(frm) {
		if (frm.doc.time != frm.doc.creation) {
			frm.set_value('time', frm.doc.creation);
			frm.refresh_field('time');
			frm.save();
		}
	}
});

