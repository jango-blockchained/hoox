frappe.ui.form.on('Hoox Settings', {
    refresh: function(frm) {
        frm.add_custom_button(__('Get Telegram Bot Token'), function() {
            window.open('https://t.me/BotFather', '_blank');
        });
    }
});
