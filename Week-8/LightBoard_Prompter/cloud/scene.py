"""restState editing boundary, derived from the existing local Lightboard helper."""
import hashlib
import json
from pathlib import Path
import re


def digest(data):
    return hashlib.sha256(data).hexdigest()


def mask_cpp(source):
    """Preserve offsets while hiding comments and C++ string/character literals."""
    result = list(source)
    i = 0
    while i < len(source):
        start = i
        if source.startswith("//", i):
            end = source.find("\n", i)
            i = len(source) if end < 0 else end
        elif source.startswith("/*", i):
            end = source.find("*/", i + 2)
            if end < 0:
                raise ValueError("Unterminated C++ comment")
            i = end + 2
        elif source.startswith('R"', i):
            match = re.match(r'R"([^\s()\\]{0,16})\(', source[i:])
            if not match:
                raise ValueError("Invalid C++ raw string")
            terminator = ")" + match.group(1) + '"'
            end = source.find(terminator, i + match.end())
            if end < 0:
                raise ValueError("Unterminated C++ raw string")
            i = end + len(terminator)
        elif source[i] in "\"'":
            quote = source[i]
            i += 1
            while i < len(source):
                if source[i] == "\\":
                    i += 2
                elif source[i] == quote:
                    i += 1
                    break
                else:
                    i += 1
            else:
                raise ValueError("Unterminated C++ literal")
        else:
            i += 1
            continue
        for j in range(start, min(i, len(source))):
            if source[j] not in "\r\n":
                result[j] = " "
    return "".join(result)


def function_span(source):
    masked = mask_cpp(source)
    matches = list(re.finditer(r"\bvoid\s+restState\s*\(\s*unsigned\s+long\s+now\s*\)\s*\{", masked))
    if len(matches) != 1:
        raise ValueError("Expected exactly one void restState(unsigned long now) definition")
    depth = 1
    for i in range(matches[0].end(), len(masked)):
        depth += (masked[i] == "{") - (masked[i] == "}")
        if depth == 0:
            return matches[0].start(), i + 1
    raise ValueError("Unbalanced restState braces")


def protected_hash(source):
    start, end = function_span(source)
    return digest((source[:start] + "\0" + source[end:]).encode())


DRAWING_METHODS = set("fillScreen drawPixel drawLine drawFastHLine drawFastVLine drawRect fillRect drawRoundRect fillRoundRect drawCircle fillCircle drawTriangle fillTriangle drawBitmap color565 width height".split())
PURE_CALLS = set("if for while switch return sizeof alignof static_cast int float double bool char short long unsigned signed uint8_t uint16_t uint32_t int8_t int16_t int32_t min max abs constrain map random sin sinf cos cosf tan tanf atan2 atan2f sqrt sqrtf pow powf floor floorf ceil ceilf round roundf fabs fabsf fmod fmodf fmin fminf fmax fmaxf exp expf log logf".split())


def validate_function(candidate):
    if not isinstance(candidate, str) or len(candidate.encode()) > 65536:
        raise ValueError("Missing or oversized candidate")
    candidate = candidate.strip()
    if "\\\n" in candidate or "\\\r" in candidate:
        raise ValueError("C++ line splicing is not allowed")
    # Accept one conventional code fence, without repairing or rewriting the function.
    fence = re.fullmatch(r"```(?:cpp|c\+\+|arduino)?\s*\n(.*?)\n```", candidate, re.DOTALL)
    if fence:
        candidate = fence[1].strip()
    start, end = function_span(candidate)
    masked = mask_cpp(candidate)
    if (masked[:start] + masked[end:]).strip():
        raise ValueError("Candidate must contain only restState")
    body = masked[start:end]
    if "#" in body or "\\\n" in body or "\\\r" in body or "::" in body:
        raise ValueError("Directives, line splicing, and external namespaces are not allowed")
    forbidden = r"\b(?:new|delete|malloc|calloc|realloc|free|extern|volatile|asm|__asm__|reinterpret_cast|const_cast|throw|try|catch|goto|displayTimer|timerMux|lastFrame|FRAME_INTERVAL_MS|setup|loop|display_updater|Serial\w*|ESP|WiFi\w*|HTTPClient|FS|SPIFFS|LittleFS|SD|SPI|Wire|String|P_[A-Z0-9_]+)\b"
    if re.search(forbidden, body):
        raise ValueError("Candidate uses unsupported hardware, external state, allocation, or control flow")
    if re.search(r"\([^()]*\*\s*\)", body):
        raise ValueError("Pointer casts are not allowed")
    for occurrence in re.finditer(r"\bdisplay\b", body):
        method = re.match(r"display\s*\.\s*(\w+)\s*\(", body[occurrence.start():])
        if not method or method[1] not in DRAWING_METHODS:
            name = method[1] if method else "alias or non-call access"
            raise ValueError(f"Unsupported display access: {name}")
    lambdas = set(re.findall(r"\bauto\s+(\w+)\s*=\s*\[", body))
    # Skip the single function signature. Calls may only be drawing, math, or local lambdas.
    for name in re.findall(r"\b([A-Za-z_]\w*)\s*\(", body[body.index("{") + 1:]):
        if name not in PURE_CALLS | DRAWING_METHODS | lambdas:
            raise ValueError(f"Candidate calls an unsupported function: {name}")
    if re.search(r"\bfor\s*\(\s*;|\bwhile\s*\(\s*(?:true|[1-9]\d*)\s*\)", body):
        raise ValueError("An unconditional loop is not allowed")
    return candidate[start:end]


def compose(source, candidate, expected_protected_hash):
    if protected_hash(source) != expected_protected_hash:
        raise ValueError("Baseline protected bytes differ from the pinned foundation")
    start, end = function_span(source)
    updated = source[:start] + validate_function(candidate) + source[end:]
    if protected_hash(updated) != expected_protected_hash:
        raise ValueError("Protected bytes changed")
    return updated


def load_generation(path):
    record = json.loads(Path(path).read_text())
    if record.get("model") != "gemini-3.5-flash-lite" or record.get("finish_reason") != "STOP":
        raise ValueError("Generation record has an unexpected model or incomplete response")
    text = record.get("response_text")
    if not isinstance(text, str) or digest(text.encode()) != record.get("response_sha256"):
        raise ValueError("Generated response hash mismatch")
    return record, validate_function(text)


if __name__ == "__main__":
    import argparse
    import sys
    parser = argparse.ArgumentParser(description="Validate one generated restState for the pinned build")
    parser.add_argument("--record", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        _, function = load_generation(args.record)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x") as output:
            output.write(function + "\n")
        print("PASS: RESTSTATE_VALIDATED — compilation still required; no device operation.")
    except (ValueError, OSError, TypeError, KeyError) as error:
        print(f"STOP: {error}", file=sys.stderr)
        sys.exit(1)
