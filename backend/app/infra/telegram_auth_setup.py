"""Telethon session authorization via QR code using SQLite-backed settings.

Usage:
    python -m app.infra.telegram_auth_setup
"""

from __future__ import annotations

import asyncio
import sys
from getpass import getpass

import qrcode
from telethon import TelegramClient, errors

from app.infra.telegram_client import load_telegram_settings


def _print_qr(url: str) -> None:
    qr = qrcode.QRCode(border=1)
    qr.add_data(url)
    qr.make(fit=True)
    qr.print_ascii(invert=True)


async def main() -> None:
    try:
        settings = await load_telegram_settings()
    except ValueError as exc:
        print(f"Error: {exc}")
        sys.exit(1)

    print(f"Session: {settings.session_path}.session")
    print()

    client = TelegramClient(
        str(settings.session_path),
        settings.api_id,
        settings.api_hash,
        device_model="iPhone 15 Pro",
        system_version="17.4",
        app_version="10.8.1",
    )
    await client.connect()

    if await client.is_user_authorized():
        me = await client.get_me()
        print(f"Already authorized as: {me.first_name} ({me.phone})")
        await client.disconnect()
        return

    print("Scan the QR code in Telegram:")
    print("  Settings -> Devices -> Link Desktop Device")
    print()

    try:
        qr = await client.qr_login()
        _print_qr(qr.url)
        print("Waiting for scan (120s timeout)...")
        await qr.wait(timeout=120)
    except errors.SessionPasswordNeededError:
        password = getpass("2FA password: ")
        await client.sign_in(password=password)

    if await client.is_user_authorized():
        me = await client.get_me()
        print(f"Authorized as: {me.first_name} ({me.phone})")
        print(f"Session saved: {settings.session_path}.session")
    else:
        print("Authorization failed.")
        await client.disconnect()
        sys.exit(1)

    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
