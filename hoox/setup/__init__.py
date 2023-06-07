from .notification import add_hoox_notification_channel


def after_install():
    add_hoox_notification_channel()


def after_migrate():
    add_hoox_notification_channel()
