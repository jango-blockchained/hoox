frappe.pages['exchange-balance'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Exchange Balance',
		single_column: true
	});
}