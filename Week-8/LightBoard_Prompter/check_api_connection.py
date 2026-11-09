#!/usr/bin/env python3
"""Diagnose the HTTPS connection without reading a key or generating content."""

from pathlib import Path
import socket
import ssl
import sys
import urllib.error
import urllib.request


def explain(error):
    reason = error.reason if isinstance(error, urllib.error.URLError) else error
    print("Error type:", type(reason).__name__)
    if isinstance(reason, ssl.SSLCertVerificationError):
        print("TLS certificate verification failed:", reason.verify_message)
    elif isinstance(reason, socket.gaierror):
        print("DNS lookup failed: the API hostname could not be resolved.")
    elif isinstance(reason, TimeoutError):
        print("Connection timed out before an HTTP response was received.")
    elif isinstance(reason, ssl.SSLError):
        print("TLS connection failed:", getattr(reason, "reason", "unknown SSL error"))
    elif isinstance(reason, OSError):
        print("Connection error number:", reason.errno)
        print("Connection error:", reason.strerror or "not specified")
    else:
        print("Connection failed; raw error omitted to avoid exposing proxy credentials.")


def main():
    print("Connection diagnostic only: no API key, no generation, no settings changes.")
    print("Python:", sys.version.split()[0])
    print("Python executable:", sys.executable)
    print("HTTPS proxy configured:", bool(urllib.request.getproxies().get("https")))
    trust = ssl.get_default_verify_paths()
    print("Default CA file exists:", bool(trust.cafile and Path(trust.cafile).is_file()))
    print("Default CA directory exists:", bool(trust.capath and Path(trust.capath).is_dir()))
    try:
        socket.getaddrinfo("generativelanguage.googleapis.com", 443)
        print("Direct DNS lookup: PASS")
    except OSError as error:
        print("Direct DNS lookup: FAILED")
        explain(error)

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    print("Checking HTTPS; allow about 20 seconds...", flush=True)
    try:
        with urllib.request.build_opener(NoRedirect).open(
            "https://generativelanguage.googleapis.com/v1beta/models", timeout=20
        ) as response:
            print("HTTPS: REACHABLE. HTTP status:", response.status)
    except urllib.error.HTTPError as error:
        print("HTTPS: REACHABLE. HTTP status:", error.code)
        print("An HTTP rejection is expected here because this check sends no API key.")
    except (urllib.error.URLError, OSError, ValueError) as error:
        print("HTTPS: FAILED")
        explain(error)
        return 1
    print("Connection check complete. This did not validate the key or model.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
