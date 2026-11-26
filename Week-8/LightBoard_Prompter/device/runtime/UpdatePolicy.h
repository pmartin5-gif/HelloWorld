#pragma once
#include <stddef.h>
#include <stdint.h>
#include <string.h>
#include <stdio.h>

// These pure checks are shared by the ESP32 implementation and native C++ tests.
namespace lightboard {
static const char kFeedUrl[] = "https://raw.githubusercontent.com/pmartin5-gif/HelloWorld/lightboard-feed/manifest.json";
static const char kDevice[] = "esp32-32x32";
static const uint32_t kAppSlotBytes = 0x140000;
static const size_t kMaxManifest = 8192;

inline bool feedRequestUrl(char* output, size_t capacity, uint32_t boot, uint32_t sequence) {
  int count = snprintf(output, capacity, "%s?lb=%08lx%08lx", kFeedUrl,
      (unsigned long)boot, (unsigned long)sequence);
  return count > 0 && (size_t)count < capacity;
}
inline bool reportingUrl(const char* value) {
  static const char prefix[] = "https://script.google.com/macros/s/";
  if (!value || strncmp(value, prefix, sizeof(prefix) - 1) != 0) return false;
  const char* id = value + sizeof(prefix) - 1;
  const char* end = strchr(id, '/');
  if (!end || end - id < 20 || end - id > 200 || strcmp(end, "/exec") != 0) return false;
  for (const char* p = id; p < end; ++p)
    if (!((*p >= 'a' && *p <= 'z') || (*p >= 'A' && *p <= 'Z') ||
          (*p >= '0' && *p <= '9') || *p == '_' || *p == '-')) return false;
  return true;
}
inline bool reportRedirectUrl(const char* value) {
  static const char prefix[] = "https://script.googleusercontent.com/macros/echo?";
  if (!value || strncmp(value, prefix, sizeof(prefix) - 1) != 0 || strlen(value) >= 3072) return false;
  for (const unsigned char* p = (const unsigned char*)value; *p; ++p)
    if (*p < 33 || *p > 126 || *p == '\\' || *p == '#' || *p == '@') return false;
  return true;
}

inline bool safeAscii(const char* text) {
  if (!text) return false;
  for (const unsigned char* p = (const unsigned char*)text; *p; ++p)
    if (*p < 33 || *p > 126 || *p == '\\') return false;
  return true;
}
inline bool sha256Text(const char* value) {
  if (!value || strlen(value) != 64) return false;
  for (size_t i = 0; i < 64; ++i)
    if (!((value[i] >= '0' && value[i] <= '9') || (value[i] >= 'a' && value[i] <= 'f'))) return false;
  return true;
}
inline bool safeVersion(const char* value) {
  if (!value || !*value || strlen(value) > 79) return false;
  for (size_t i = 0; value[i]; ++i)
    if (!((value[i] >= 'a' && value[i] <= 'z') || (value[i] >= 'A' && value[i] <= 'Z') ||
          (value[i] >= '0' && value[i] <= '9') || value[i] == '-' || value[i] == '_')) return false;
  return true;
}
inline bool allowedHttps(const char* url) {
  if (!safeAscii(url) || strncmp(url, "https://", 8) != 0 || strlen(url) >= 3072) return false;
  const char* slash = strchr(url + 8, '/');
  if (!slash) return false;
  static const char* hosts[] = {"github.com", "raw.githubusercontent.com",
      "release-assets.githubusercontent.com", "objects.githubusercontent.com"};
  for (const char* host : hosts)
    if ((size_t)(slash - (url + 8)) == strlen(host) && strncmp(url + 8, host, strlen(host)) == 0)
      return strchr(slash, '#') == nullptr && strchr(slash, '@') == nullptr;
  return false;
}
inline bool firmwareUrl(const char* url) {
  static const char prefix[] = "https://github.com/pmartin5-gif/HelloWorld/releases/download/lightboard-ota-";
  static const char suffix[] = "/firmware.bin";
  if (!allowedHttps(url) || strncmp(url, prefix, sizeof(prefix) - 1) != 0) return false;
  const char* tag = url + sizeof(prefix) - 1;
  const char* slash = strchr(tag, '/');
  if (!slash || slash == tag || (size_t)(slash - tag) > 96 || strcmp(slash, suffix) != 0) return false;
  for (const char* p = tag; p < slash; ++p)
    if (!((*p >= '0' && *p <= '9') || (*p >= 'a' && *p <= 'z') || *p == '-')) return false;
  return true;
}
struct Candidate {
  char url[256];
  char sha256[65];
  char version[80];
  uint32_t bytes;
};
inline bool sameCandidate(const Candidate& a, const Candidate& b) {
  return a.bytes == b.bytes && strcmp(a.url, b.url) == 0 &&
      strcmp(a.sha256, b.sha256) == 0 && strcmp(a.version, b.version) == 0;
}
inline bool eligible(unsigned schema, bool otaEnabled, const char* device,
                     const char* foundation, const char* expectedFoundation,
                     const Candidate& candidate, uint32_t slotBytes) {
  return schema == 2 && otaEnabled && device && strcmp(device, kDevice) == 0 &&
      sha256Text(foundation) && strcmp(foundation, expectedFoundation) == 0 &&
      firmwareUrl(candidate.url) && sha256Text(candidate.sha256) && safeVersion(candidate.version) &&
      candidate.bytes >= 288 && candidate.bytes <= kAppSlotBytes && candidate.bytes <= slotBytes;
}
inline bool expired(uint32_t now, uint32_t started, uint32_t interval) {
  return (uint32_t)(now - started) >= interval;
}
inline bool boundedJson(const char* value) {
  // cJSON is recursive. Limit nesting before allocating/parsing untrusted JSON.
  unsigned depth = 0; bool inString = false, escape = false;
  for (const unsigned char* p = (const unsigned char*)value; *p; ++p) {
    if (inString) {
      if (*p < 32) return false;
      if (escape) escape = false;
      else if (*p == '\\') escape = true;
      else if (*p == '"') inString = false;
    } else if (*p == '"') inString = true;
    else if (*p == '{' || *p == '[') { if (++depth > 12) return false; }
    else if (*p == '}' || *p == ']') { if (!depth) return false; --depth; }
  }
  return !inString && !depth;
}
}  // namespace lightboard
