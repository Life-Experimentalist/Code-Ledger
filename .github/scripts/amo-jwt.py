#!/usr/bin/env python3
"""Print a short-lived HS256 JWT for the addons.mozilla.org API.

This used to be a heredoc inside publish-firefox.yml, written at column 0 so
Python would accept it — which ended the enclosing YAML block scalar and made
the whole workflow file unparseable. GitHub answered by failing the run in under
a second with no log to read. A script file has no indentation to negotiate.

Reads AMO_JWT_ISSUER and AMO_JWT_SECRET from the environment; the token is valid
for five minutes, which is AMO's documented maximum.
"""

import base64
import hashlib
import hmac
import json
import os
import sys
import time
import uuid


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def main() -> int:
    try:
        issuer = os.environ["AMO_JWT_ISSUER"]
        secret = os.environ["AMO_JWT_SECRET"]
    except KeyError as missing:
        print(f"{missing} is not set", file=sys.stderr)
        return 1

    issued = int(time.time())
    header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = b64(
        json.dumps(
            {
                "iss": issuer,
                "jti": str(uuid.uuid4()),
                "iat": issued,
                "exp": issued + 300,
            }
        ).encode()
    )
    signing_input = f"{header}.{payload}"
    signature = b64(hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest())
    print(f"{signing_input}.{signature}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
