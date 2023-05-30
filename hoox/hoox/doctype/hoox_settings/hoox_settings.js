frappe.ui.form.on('HooxSettings', {
    refresh: function(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button(__('Open in New Tab'), function() {
                var url = '/app/your_doctype/' + frm.docname;
                window.open(url, '_blank');
            });
        }
    }
});
