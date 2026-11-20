#include <atomic>
#include <cassert>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
using String = std::string;
enum { WL_CONNECTED = 3 };
enum wifi_auth_mode_t { WIFI_AUTH_WPA2_PSK = 3, WIFI_AUTH_WPA_WPA2_PSK = 4,
                        WIFI_AUTH_WPA2_WPA3_PSK = 7 };
struct { char ssid[33]; char password[65]; } credentials = {};
bool hasCredentials = true;
std::atomic<int> lastDisconnectReason{39};
unsigned connectStarted = 1, lastConnectAttempt = 1;
unsigned millis() { return 100; }
unsigned pdMS_TO_TICKS(unsigned n) { return n; }
void vTaskDelay(unsigned) {}
struct { unsigned getFreeHeap() { return 220000; } } ESP;
struct Capture {
  std::string output;
  void println(const char* s) { output += s; output += '\n'; }
  void printf(const char* format, ...) {
    char buffer[1024]; va_list args; va_start(args, format);
    int size = vsnprintf(buffer, sizeof(buffer), format, args); va_end(args);
    assert(size >= 0 && size < (int)sizeof(buffer)); output += buffer;
  }
} Serial;
struct Radio {
  std::vector<std::string> names;
  int result = 0, connection = 6, scans = 0, disconnects = 0, cleanups = 0;
  int status() { return connection; }
  void disconnect(bool, bool) { ++disconnects; }
  void scanDelete() { ++cleanups; }
  int scanNetworks(bool async, bool hidden, bool passive, unsigned dwell) {
    assert(!async && hidden && !passive && dwell == 300); ++scans; return result;
  }
  String SSID(int i) { return names.at(i); }
  wifi_auth_mode_t encryptionType(int) { return WIFI_AUTH_WPA2_PSK; }
  int channel(int) { return 6; }
  int RSSI(int) { return -50; }
} WiFi;

// PRODUCTION_DIAGNOSTIC

void reset(const char* name = "Hello World") {
  WiFi = Radio(); Serial.output.clear(); hasCredentials = true;
  std::strcpy(credentials.ssid, name);
  std::strcpy(credentials.password, "PRIVATE_PASSWORD_SENTINEL");
}
void redacted() {
  for (auto value : {"Hello World", "PRIVATE_NEIGHBOR", "PRIVATE_PASSWORD_SENTINEL"})
    assert(Serial.output.find(value) == std::string::npos);
}
int main() {
  reset(); WiFi.names = {"Hello World", "PRIVATE_NEIGHBOR", "Hello World 5GHz"}; WiFi.result = 3;
  diagnoseWifi("Hello World"); redacted();
  assert(Serial.output.find("\"configured_matches_expected\":true") != std::string::npos);
  assert(Serial.output.find("\"scan_result\":3,\"target_matches\":1,\"expected_matches\":1") != std::string::npos);
  assert(WiFi.scans == 1 && WiFi.cleanups == 2);

  reset("Hello World "); WiFi.names = {"Hello World", "PRIVATE_NEIGHBOR"}; WiFi.result = 2;
  diagnoseWifi("Hello World"); redacted();
  assert(Serial.output.find("\"configured_matches_expected\":false") != std::string::npos);
  assert(Serial.output.find("\"target_matches\":0,\"expected_matches\":1") != std::string::npos);
  assert(Serial.output.find("\"matches_configured\":false,\"matches_expected\":true") != std::string::npos);

  reset(); WiFi.result = -2; diagnoseWifi("Hello World"); redacted();
  assert(Serial.output.find("\"scan_result\":-2") != std::string::npos && WiFi.cleanups == 2);

  reset(); WiFi.connection = WL_CONNECTED; diagnoseWifi("Hello World"); redacted();
  assert(WiFi.scans == 0 && WiFi.disconnects == 0);

  reset(); hasCredentials = false; diagnoseWifi("Hello World"); redacted(); assert(WiFi.scans == 0);
  reset(); diagnoseWifi("Hello\tWorld"); redacted(); assert(WiFi.scans == 0);

  reset(); WiFi.names.assign(8, "Hello World"); WiFi.result = 8; diagnoseWifi("Hello World"); redacted();
  unsigned rows = 0; size_t position = 0;
  while ((position = Serial.output.find("LB_WIFI_DIAG_AP", position)) != std::string::npos) { ++rows; ++position; }
  assert(rows == 4 && Serial.output.find("\"target_matches\":8") != std::string::npos);
}
