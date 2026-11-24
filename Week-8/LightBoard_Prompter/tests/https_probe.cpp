#include <algorithm>
#include <cassert>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <string>
#include "UpdatePolicy.h"
using namespace lightboard;
using std::min;
enum { WL_CONNECTED = 3 };
struct { int state = 3; int status() { return state; } } WiFi;
unsigned now = 0;
unsigned millis() { return now; }
void vTaskDelay(unsigned) { now += 100; }
struct Capture {
  std::string output;
  void println(const char* s) { output += s; output += '\n'; }
  void printf(const char* format, ...) {
    char buffer[1024]; va_list args; va_start(args, format);
    int size = vsnprintf(buffer, sizeof(buffer), format, args); va_end(args);
    assert(size >= 0 && size < (int)sizeof(buffer)); output += buffer;
  }
} Serial;
struct Response {
  int length = 2500, actual = 2500, received = 0, opens = 0, reads = 0;
  bool opensOk = true, chunked = false, readError = false, stalled = false;
} response;
struct HttpsStream {
  Response* client = &response;
  bool open(const char*) { ++response.opens; return response.opensOk; }
};
int esp_http_client_get_content_length(Response* r) { return r->length; }
bool esp_http_client_is_chunked_response(Response* r) { return r->chunked; }
bool esp_http_client_is_complete_data_received(Response* r) { return r->received == r->actual; }
int esp_http_client_read(Response* r, char* out, int wanted) {
  assert(wanted > 0 && wanted <= 1024); ++r->reads;
  if (r->readError) return -1;
  if (r->stalled) return 0;
  int count = min(317, min(wanted, r->actual - r->received));
  memset(out, 0x55, count);
  if (!r->received && count) out[0] = (char)0xe9;
  r->received += count; return count;
}
// A deterministic hashing stub verifies the probe passes every received byte to hashing.
// Actual SHA-256 and the full public image were independently checked on the physical ESP32.
struct mbedtls_sha256_context { int bytes = 0; };
int hashed = 0;
void mbedtls_sha256_init(mbedtls_sha256_context* c) { c->bytes = 0; }
int mbedtls_sha256_starts_ret(mbedtls_sha256_context*, int) { return 0; }
int mbedtls_sha256_update_ret(mbedtls_sha256_context* c, const uint8_t*, int n) { c->bytes += n; return 0; }
int mbedtls_sha256_finish_ret(mbedtls_sha256_context* c, uint8_t* out) {
  hashed = c->bytes; memset(out, 0x42, 32); return 0;
}
void mbedtls_sha256_free(mbedtls_sha256_context*) {}
// No flash/OTA API is provided: any probe dependency on one fails compilation.

// PRODUCTION_PROBE

const char* url = "https://github.com/pmartin5-gif/HelloWorld/releases/download/lightboard-ota-123-1/firmware.bin";
void reset() { response = Response(); WiFi.state = 3; now = 0; hashed = 0; Serial.output.clear(); }
void redacted() {
  assert(Serial.output.find("https://") == std::string::npos);
  assert(Serial.output.find("PRIVATE_SENTINEL") == std::string::npos);
}
int main() {
  reset(); probeFirmware(url); redacted();
  assert(hashed == 2500 && response.received == 2500);
  assert(Serial.output.find("\"complete\":true,\"image_magic\":true") != std::string::npos);
  assert(Serial.output.find("\"no_flash_operation\":true") != std::string::npos);

  for (const char* bad : {"https://PRIVATE_SENTINEL/firmware.bin",
       "https://github.com/pmartin5-gif/HelloWorld/releases/download/lightboard-ota-123-1/recovery.bin"}) {
    reset(); probeFirmware(bad); redacted(); assert(response.opens == 0);
  }
  reset(); WiFi.state = 6; probeFirmware(url); assert(response.opens == 0);
  reset(); response.opensOk = false; probeFirmware(url); assert(response.reads == 0); redacted();
  for (int length : {-1, 0, 287, (int)kAppSlotBytes + 1}) {
    reset(); response.length = length; probeFirmware(url); assert(response.reads == 0);
  }
  reset(); response.chunked = true; probeFirmware(url); assert(response.reads == 0);
  reset(); response.actual = 2300; probeFirmware(url);
  assert(Serial.output.find("\"complete\":false") != std::string::npos && now <= 120000);
  reset(); response.readError = true; probeFirmware(url);
  assert(response.reads == 1 && Serial.output.find("\"complete\":false") != std::string::npos);
  reset(); response.stalled = true; probeFirmware(url);
  assert(now <= 120000 && Serial.output.find("\"complete\":false") != std::string::npos);
}
