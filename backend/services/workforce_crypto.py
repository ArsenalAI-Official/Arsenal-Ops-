"""Fernet symmetric encryption for the QuickBooks OAuth refresh + access
tokens at rest.

Why a dedicated helper rather than calling Fernet inline at each call
site: tokens are touched from at least three places (callback storage,
sync worker reads, manual refresh) and we want a single audit surface
for "where do plaintext tokens cross the trust boundary". This module
is that surface.

Key management
==============
The encryption key lives in `WORKFORCE_TOKEN_ENCRYPTION_KEY` (env var).
Generate with::

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Rotation: generate a new key, decrypt with the old, re-encrypt with the
new, write back. We don't ship a rotation tool for MVP — if the key is
ever compromised, the safest move is to disconnect the integration
(which deletes the row) and reconnect.

Failure mode
============
If the env var is missing, `encrypt`/`decrypt` raise at call time
rather than at import. That keeps the rest of the app bootable on
machines where the integration isn't configured (e.g. local dev).
"""

import os

from cryptography.fernet import Fernet, InvalidToken


class WorkforceCryptoNotConfigured(RuntimeError):
    """Raised when the encryption key env var is missing.

    Surfaced as a 503 by the workforce router so the admin gets a clear
    "configure WORKFORCE_TOKEN_ENCRYPTION_KEY then redeploy" message
    rather than a stack trace.
    """


class WorkforceCryptoCorrupted(RuntimeError):
    """Raised when ciphertext can't be decrypted — wrong key, tampered
    value, or corrupted at-rest storage. Treated as "integration must be
    reconnected" by callers.
    """


_ENV_VAR = "WORKFORCE_TOKEN_ENCRYPTION_KEY"


def _load_cipher() -> Fernet:
    key = os.getenv(_ENV_VAR)
    if not key:
        raise WorkforceCryptoNotConfigured(
            f"{_ENV_VAR} is not set. Generate one with `Fernet.generate_key()` "
            "and add it to the backend env before connecting the QuickBooks integration."
        )
    try:
        # Fernet accepts bytes or str. Normalize to bytes to surface key
        # format errors early with a useful message.
        return Fernet(key.encode("ascii") if isinstance(key, str) else key)
    except Exception as e:
        raise WorkforceCryptoNotConfigured(
            f"{_ENV_VAR} is not a valid Fernet key ({type(e).__name__}). "
            "Must be 32 url-safe base64-encoded bytes."
        ) from e


def encrypt(plaintext: str) -> str:
    """Encrypt a token string. Returns ascii-safe ciphertext suitable
    for storage in a TEXT column."""
    cipher = _load_cipher()
    return cipher.encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt(ciphertext: str) -> str:
    """Decrypt a previously-encrypted token. Raises
    `WorkforceCryptoCorrupted` if the ciphertext is invalid (wrong key,
    tampered, etc.) — callers should treat this as "integration is
    broken, reconnect required" rather than crashing."""
    cipher = _load_cipher()
    try:
        return cipher.decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except InvalidToken as e:
        raise WorkforceCryptoCorrupted(
            "Stored workforce token could not be decrypted. The encryption "
            "key may have changed; disconnect and reconnect the QuickBooks "
            "integration."
        ) from e
