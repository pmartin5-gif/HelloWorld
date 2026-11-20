#include "LightboardRuntime.h"
#include "UpdatePolicy.h"
#include "BuildIdentity.h"
#include <Arduino.h>
#include <WiFi.h>
#include <Preferences.h>
#include <cJSON.h>
#include <esp_crt_bundle.h>
#include <esp_http_client.h>
#include <esp_ota_ops.h>
#include <esp_partition.h>
#include <esp_log.h>
#include <mbedtls/sha256.h>
#include <time.h>
#include <atomic>

// Arduino 2.0.17 otherwise confirms an OTA image before setup() runs.
extern "C" bool verifyRollbackLater() { return true; }

namespace lightboard {
namespace {
struct Metrics { uint32_t frames; uint32_t last; uint32_t maxGap; };
Metrics metrics = {};
portMUX_TYPE metricsMux = portMUX_INITIALIZER_UNLOCKED;
TaskHandle_t workerHandle = nullptr;
struct Credentials { uint32_t format; char ssid[33]; char password[65]; };
Credentials credentials = {};
bool hasCredentials = false;
bool pendingVerify = false;
bool healthy = false;
bool terminalHealthFailure = false;
bool reconnectEnabled = true;
std::atomic<int> lastDisconnectReason{-1};
uint32_t connectStarted = 0;
uint32_t lastConnectAttempt = 0;
uint32_t healthWindowStart = 0;
char line[192] = {};
size_t lineLength = 0;
bool discardLine = false;
uint32_t lineStarted = 0;
uint32_t provisionUntil = 0;
unsigned provisionPhase = 0;
char provisionSsid[33] = {};
uint32_t armedUntil = 0;
Candidate checkedCandidate = {};
uint32_t candidateCheckedAt = 0;
bool candidateReady = false;

class FlashGuard {
 public:
  FlashGuard() { lightboardFlashGuard(true); }
  ~FlashGuard() { lightboardFlashGuard(false); }
};
void wipe(void* data, size_t bytes) {
  volatile uint8_t* p = (volatile uint8_t*)data;
  while (bytes--) *p++ = 0;
}
Metrics snapshot() {
  portENTER_CRITICAL(&metricsMux);
  Metrics result = metrics;
  portEXIT_CRITICAL(&metricsMux);
  return result;
}
void resetHealthWindow() {
  portENTER_CRITICAL(&metricsMux);
  metrics.frames = 0;
  metrics.maxGap = 0;
  portEXIT_CRITICAL(&metricsMux);
  healthWindowStart = millis();
}
bool layoutValid() {
  const esp_partition_t* a = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_0, nullptr);
  const esp_partition_t* b = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_1, nullptr);
  const esp_partition_t* data = esp_partition_find_first(ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_OTA, nullptr);
  return ESP.getFlashChipSize() >= 0x400000 && a && b && data &&
      a->address == 0x10000 && a->size == kAppSlotBytes &&
      b->address == 0x150000 && b->size == kAppSlotBytes &&
      data->address == 0xe000 && data->size == 0x2000;
}
void status() {
  Metrics m = snapshot();
  const esp_partition_t* running = esp_ota_get_running_partition();
  const esp_partition_t* target = esp_ota_get_next_update_partition(nullptr);
  esp_ota_img_states_t state = ESP_OTA_IMG_UNDEFINED;
  if (running) esp_ota_get_state_partition(running, &state);
  Serial.printf("LB_STATUS {\"version\":\"%s\",\"foundation\":\"%s\",\"flash_bytes\":%u,"
      "\"layout_ok\":%s,\"running\":\"%s\",\"running_offset\":%u,\"slot_bytes\":%u,"
      "\"target\":\"%s\",\"ota_state\":%d,\"credentials_set\":%s,\"wifi_status\":%d,"
      "\"rssi\":%d,\"heap_free\":%u,\"heap_min\":%u,\"heap_largest\":%u,"
      "\"worker_stack_free\":%u,\"refresh_stack_free\":%u,\"refresh_cycles\":%u,\"frames\":%u,\"max_frame_gap_ms\":%u,"
      "\"health_ok\":%s,\"automatic_updates\":false}\n",
      LB_FIRMWARE_VERSION, LB_FOUNDATION_ID, ESP.getFlashChipSize(), layoutValid() ? "true" : "false",
      running ? running->label : "none", running ? running->address : 0,
      running ? running->size : 0, target ? target->label : "none", (int)state,
      hasCredentials ? "true" : "false", (int)WiFi.status(),
      WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0,
      ESP.getFreeHeap(), ESP.getMinFreeHeap(), ESP.getMaxAllocHeap(),
      (unsigned)uxTaskGetStackHighWaterMark(nullptr), lightboardRefreshStackFree(), lightboardRefreshCycles(),
      m.frames, m.maxGap, healthy ? "true" : "false");
}
bool loadCredentials() {
  Preferences store;
  if (!store.begin("lightboard", true)) return false;
  bool found = store.getBytesLength("wifi") == sizeof(credentials) &&
      store.getBytes("wifi", &credentials, sizeof(credentials)) == sizeof(credentials);
  store.end();
  if (!found || credentials.format != 1 || credentials.ssid[32] != 0 ||
      credentials.password[64] != 0 || !credentials.ssid[0]) {
    wipe(&credentials, sizeof(credentials));
    return false;
  }
  size_t n = strlen(credentials.password);
  bool valid = (n >= 8 && n <= 63) || (n == 64 && strspn(credentials.password, "0123456789abcdefABCDEF") == 64);
  if (!valid) wipe(&credentials, sizeof(credentials));
  return valid;
}
void connectWifi() {
  if (!hasCredentials || !reconnectEnabled) return;
  lastConnectAttempt = connectStarted = millis();
  WiFi.begin(credentials.ssid, credentials.password);
  Serial.println("LB_WIFI_CONNECTING");  // Never echo SSID, password, or provisioning input.
}
void diagnoseWifi(const char* expected = nullptr) {
  if (!hasCredentials) { Serial.println("LB_STOP: provision Wi-Fi privately first"); return; }
  if (expected && (!expected[0] || strlen(expected) > 32 || strchr(expected, '\t'))) {
    Serial.println("LB_STOP: diagnostic name format rejected; input omitted"); return;
  }
  if (expected) Serial.printf("LB_WIFI_NAME_CHECK {\"configured_matches_expected\":%s}\n",
      strcmp(credentials.ssid, expected) == 0 ? "true" : "false");
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("LB_WIFI_DIAG: already connected; use status/check; no scan performed"); return;
  }
  // The worker owns scanning. Stop any unfinished association, retaining credentials.
  const int priorReason = lastDisconnectReason.load(std::memory_order_relaxed);
  WiFi.disconnect(false, false);
  connectStarted = 0;
  vTaskDelay(pdMS_TO_TICKS(100));
  WiFi.scanDelete();
  Serial.println("LB_WIFI_DIAG_SCANNING: counting 2.4GHz access points; names/password omitted");
  const int count = WiFi.scanNetworks(false, true, false, 300);
  unsigned matches = 0, expectedMatches = 0, emitted = 0;
  for (int i = 0; i < count; ++i) {
    const String name = WiFi.SSID(i);
    const bool configuredMatch = name == credentials.ssid;
    const bool expectedMatch = expected && name == expected;
    if (configuredMatch) ++matches;
    if (expectedMatch) ++expectedMatches;
    if ((!configuredMatch && !expectedMatch) || emitted >= 4) continue;
    ++emitted;  // Bound output without exposing other networks or BSSIDs.
    const wifi_auth_mode_t auth = WiFi.encryptionType(i);
    const bool wpa2 = auth == WIFI_AUTH_WPA2_PSK || auth == WIFI_AUTH_WPA_WPA2_PSK ||
        auth == WIFI_AUTH_WPA2_WPA3_PSK;
    Serial.printf("LB_WIFI_DIAG_AP {\"channel\":%d,\"rssi\":%d,\"auth_mode\":%d,"
        "\"wpa2_personal_compatible\":%s,\"matches_configured\":%s,\"matches_expected\":%s}\n",
        (int)WiFi.channel(i), (int)WiFi.RSSI(i), (int)auth, wpa2 ? "true" : "false",
        configuredMatch ? "true" : "false", expectedMatch ? "true" : "false");
  }
  WiFi.scanDelete();
  lastConnectAttempt = millis();  // Keep the normal bounded retry interval after scanning.
  Serial.printf("LB_WIFI_DIAG {\"scan_result\":%d,\"target_matches\":%u,"
      "\"expected_matches\":%u,\"prior_disconnect_reason\":%d,\"heap_free\":%u}\n",
      count, matches, expectedMatches, priorReason, ESP.getFreeHeap());
}
void provision(char* value) {
  if (!provisionUntil || (int32_t)(provisionUntil - millis()) <= 0) {
    Serial.println("LB_STOP: send provision first; credentials were not stored"); return;
  }
  provisionUntil = 0;
  provisionPhase = 0;
  wipe(provisionSsid, sizeof(provisionSsid));
  char* separator = strchr(value, '\t');
  if (!separator) { Serial.println("LB_STOP: provisioning format rejected"); return; }
  *separator++ = 0;
  size_t ssidLength = strlen(value), passwordLength = strlen(separator);
  bool validPass = (passwordLength >= 8 && passwordLength <= 63) ||
      (passwordLength == 64 && strspn(separator, "0123456789abcdefABCDEF") == 64);
  if (!ssidLength || ssidLength > 32 || !validPass || strchr(separator, '\t')) {
    Serial.println("LB_STOP: credential lengths or format rejected"); return;
  }
  Credentials next = {};
  next.format = 1;
  memcpy(next.ssid, value, ssidLength);
  memcpy(next.password, separator, passwordLength);
  Preferences store;
  bool saved = false;
  {
    FlashGuard guard;
    if (store.begin("lightboard", false)) {
      saved = store.putBytes("wifi", &next, sizeof(next)) == sizeof(next);
      store.end();
    }
  }
  if (saved) {
    wipe(&credentials, sizeof(credentials));
    credentials = next;
    hasCredentials = true;
    reconnectEnabled = true;
    WiFi.disconnect(false, false);
    connectWifi();
  }
  wipe(&next, sizeof(next));
  Serial.println(saved ? "LB_CREDENTIALS_STORED_PRIVATELY" : "LB_STOP: credential storage failed");
}
bool timeReady() {
  time_t now = time(nullptr);
  return now >= 1767225600 && now < 2208988800;  // 2026..2039; reject unset clocks.
}
struct Headers {
  char location[3072];
  bool rejected;
};
esp_err_t httpEvent(esp_http_client_event_t* event) {
  if (event->event_id != HTTP_EVENT_ON_HEADER || !event->header_key || !event->header_value) return ESP_OK;
  Headers* h = (Headers*)event->user_data;
  if (strcasecmp(event->header_key, "Location") == 0) {
    if (strlen(event->header_value) >= sizeof(h->location)) h->rejected = true;
    else strcpy(h->location, event->header_value);
  }
  if (strcasecmp(event->header_key, "Content-Encoding") == 0 &&
      strcasecmp(event->header_value, "identity") != 0) h->rejected = true;
  return ESP_OK;
}
class HttpsStream {
 public:
  esp_http_client_handle_t client = nullptr;
  Headers headers = {};
  ~HttpsStream() { close(); }
  void close() { if (client) { esp_http_client_cleanup(client); client = nullptr; } }
  bool open(const char* initial) {
    char url[3072];
    if (!allowedHttps(initial) || !timeReady()) return false;
    strcpy(url, initial);
    for (int redirect = 0; redirect <= 3; ++redirect) {
      close();
      memset(&headers, 0, sizeof(headers));
      esp_http_client_config_t config = {};
      config.url = url;
      config.timeout_ms = 8000;
      config.disable_auto_redirect = true;
      config.max_authorization_retries = -1;
      config.crt_bundle_attach = esp_crt_bundle_attach;
      config.skip_cert_common_name_check = false;
      config.buffer_size = 1024;
      config.buffer_size_tx = 1024;
      config.event_handler = httpEvent;
      config.user_data = &headers;
      config.user_agent = "Lightboard-OTA-pilot";
      client = esp_http_client_init(&config);
      if (!client) return false;
      esp_http_client_set_header(client, "Accept-Encoding", "identity");
      esp_http_client_set_header(client, "Connection", "close");
      if (esp_http_client_open(client, 0) != ESP_OK || esp_http_client_fetch_headers(client) < 0 || headers.rejected)
        return false;
      int statusCode = esp_http_client_get_status_code(client);
      if (statusCode == 200) return true;
      if (statusCode != 301 && statusCode != 302 && statusCode != 303 && statusCode != 307 && statusCode != 308)
        return false;
      if (!allowedHttps(headers.location)) return false;
      strcpy(url, headers.location);
    }
    return false;
  }
};
bool downloadManifest(char* output, size_t capacity) {
  HttpsStream stream;
  if (!stream.open(kFeedUrl)) { Serial.println("LB_STOP: verified HTTPS feed unavailable (Wi-Fi/clock/certificate/status)"); return false; }
  int length = esp_http_client_get_content_length(stream.client);
  if (length > (int)capacity - 1) { Serial.println("LB_STOP: manifest exceeds bound"); return false; }
  size_t used = 0;
  uint32_t started = millis(), lastData = started;
  while (!expired(millis(), started, 20000) && !expired(millis(), lastData, 8000)) {
    if (used >= capacity - 1) return false;
    int count = esp_http_client_read(stream.client, output + used, capacity - 1 - used);
    if (count < 0) return false;
    if (count > 0) { used += count; lastData = millis(); }
    if (esp_http_client_is_complete_data_received(stream.client)) {
      if (memchr(output, 0, used)) return false;
      output[used] = 0;
      return used > 0 && (length < 0 || length == 0 || (size_t)length == used);
    }
    vTaskDelay(1);
  }
  return false;
}
const cJSON* field(const cJSON* object, const char* name) {
  const cJSON* found = nullptr;
  for (const cJSON* item = object ? object->child : nullptr; item; item = item->next) {
    if (item->string && strcmp(item->string, name) == 0) {
      if (found) return nullptr;  // Reject duplicate security-critical keys.
      found = item;
    }
  }
  return found;
}
const char* text(const cJSON* item) { return cJSON_IsString(item) ? item->valuestring : nullptr; }
bool copyText(const cJSON* object, const char* key, char* out, size_t capacity) {
  const char* value = text(field(object, key));
  if (!value || strlen(value) >= capacity) return false;
  strcpy(out, value); return true;
}
bool checkFeed(bool announce) {
  candidateReady = false;
  wipe(&checkedCandidate, sizeof(checkedCandidate));
  if (WiFi.status() != WL_CONNECTED) { Serial.println("LB_STOP: Wi-Fi is not connected"); return false; }
  char* body = (char*)malloc(kMaxManifest + 1);
  if (!body) { Serial.println("LB_STOP: insufficient manifest memory"); return false; }
  bool received = downloadManifest(body, kMaxManifest + 1);
  const char* end = nullptr;
  cJSON* root = received && boundedJson(body) ? cJSON_ParseWithOpts(body, &end, true) : nullptr;
  if (!root) { free(body); Serial.println("LB_STOP: incomplete or invalid feed"); return false; }
  const cJSON* schema = field(root, "schema_version");
  const cJSON* enabled = field(root, "ota_enabled");
  const cJSON* current = field(root, "current");
  const cJSON* size = field(current, "bytes");
  const char* foundation = text(field(root, "foundation_id"));
  const char* device = text(field(root, "device"));
  Candidate candidate = {};
  bool parsed = cJSON_IsNumber(schema) && schema->valuedouble == schema->valueint &&
      cJSON_IsObject(current) && cJSON_IsNumber(size) && size->valuedouble >= 288 &&
      size->valuedouble <= kAppSlotBytes && size->valuedouble == (uint32_t)size->valuedouble &&
      copyText(current, "url", candidate.url, sizeof(candidate.url)) &&
      copyText(current, "sha256", candidate.sha256, sizeof(candidate.sha256)) &&
      copyText(current, "version", candidate.version, sizeof(candidate.version));
  if (parsed) candidate.bytes = (uint32_t)size->valuedouble;
  const esp_partition_t* target = esp_ota_get_next_update_partition(nullptr);
  const char* repository = text(field(root, "repository"));
  const char* channel = text(field(root, "channel"));
  bool valid = parsed && repository && strcmp(repository, "pmartin5-gif/HelloWorld") == 0 &&
      channel && strcmp(channel, "ota-pilot") == 0 && cJSON_IsTrue(field(root, "published")) &&
      layoutValid() && target && eligible(schema->valueint, cJSON_IsTrue(enabled),
      device, foundation, LB_FOUNDATION_ID, candidate, target->size);
  bool nonOta = cJSON_IsFalse(enabled);
  cJSON_Delete(root); free(body);
  if (!valid) {
    Serial.println(nonOta ? "LB_FEED_REACHABLE: published delivery-test feed; OTA explicitly disabled" :
                            "LB_STOP: feed schema, foundation, image size, or firmware URL is incompatible");
    return false;
  }
  checkedCandidate = candidate;
  candidateCheckedAt = millis();
  candidateReady = true;
  if (announce) Serial.printf("LB_UPDATE_AVAILABLE {\"version\":\"%s\",\"bytes\":%u,\"sha256\":\"%s\"}\n",
      candidate.version, candidate.bytes, candidate.sha256);
  return true;
}
bool downloadAndInstall(const Candidate& candidate) {
  const esp_partition_t* running = esp_ota_get_running_partition();
  const esp_partition_t* target = esp_ota_get_next_update_partition(nullptr);
  if (!healthy || pendingVerify || !layoutValid() || !running || !target || target->address == running->address || candidate.bytes > target->size)
    return false;
  if (strcmp(candidate.version, LB_FIRMWARE_VERSION) == 0) { Serial.println("LB_ALREADY_CURRENT"); return false; }
  HttpsStream stream;
  if (!stream.open(candidate.url) || esp_http_client_is_chunked_response(stream.client) ||
      esp_http_client_get_content_length(stream.client) != (int)candidate.bytes) return false;
  esp_ota_handle_t handle = 0;
  bool begun = false, good = true;
  mbedtls_sha256_context hash;
  mbedtls_sha256_init(&hash);
  good = mbedtls_sha256_starts_ret(&hash, 0) == 0;
  {
    // Flash erase/write stalls cache access. Blank the matrix rather than hold a lit row.
    FlashGuard guard;
    if (good && esp_ota_begin(target, candidate.bytes, &handle) == ESP_OK) begun = true;
    else good = false;
    uint8_t buffer[1024];
    uint32_t received = 0, started = millis(), lastData = started;
    while (good && received < candidate.bytes) {
      if (expired(millis(), started, 120000) || expired(millis(), lastData, 10000)) { good = false; break; }
      int wanted = min((uint32_t)sizeof(buffer), candidate.bytes - received);
      int count = esp_http_client_read(stream.client, (char*)buffer, wanted);
      if (count < 0 || (received == 0 && count > 0 && buffer[0] != 0xe9)) { good = false; break; }
      if (count > 0) {
        good = mbedtls_sha256_update_ret(&hash, buffer, count) == 0 &&
               esp_ota_write(handle, buffer, count) == ESP_OK;
        received += count; lastData = millis();
      }
      vTaskDelay(1);
    }
    uint8_t digest[32] = {};
    char hex[65] = {};
    good = good && received == candidate.bytes && esp_http_client_is_complete_data_received(stream.client) &&
           mbedtls_sha256_finish_ret(&hash, digest) == 0;
    for (size_t i = 0; i < sizeof(digest); ++i) snprintf(hex + i * 2, 3, "%02x", digest[i]);
    good = good && strcmp(hex, candidate.sha256) == 0;
    if (good) {
      good = esp_ota_end(handle) == ESP_OK;
      begun = false;  // esp_ota_end frees the handle on success and failure.
      if (good) good = esp_ota_set_boot_partition(target) == ESP_OK;
    }
    if (begun) esp_ota_abort(handle);
  }
  mbedtls_sha256_free(&hash);
  return good;
}
void healthCheck() {
  if (healthy || terminalHealthFailure || !expired(millis(), healthWindowStart, 30000)) return;
  Metrics m = snapshot();
  bool passed = layoutValid() && m.frames >= 600 && m.maxGap <= 150 &&
      ESP.getFreeHeap() >= 40000 && uxTaskGetStackHighWaterMark(nullptr) >= 1024 &&
      lightboardRefreshStackFree() >= 512 && lightboardRefreshCycles() >= 10000;
  if (passed) {
    esp_err_t result = ESP_OK;
    if (pendingVerify) { FlashGuard guard; result = esp_ota_mark_app_valid_cancel_rollback(); }
    if (result == ESP_OK) { pendingVerify = false; healthy = true; Serial.println("LB_BOOT_HEALTH_PASSED"); }
    else { terminalHealthFailure = true; Serial.println("LB_STOP: boot health confirmation failed; no automatic retry"); }
  } else if (pendingVerify && expired(millis(), healthWindowStart, 60000)) {
    terminalHealthFailure = true;
    Serial.println("LB_BOOT_HEALTH_FAILED: requesting rollback; USB recovery may be required");
    FlashGuard guard;
    if (esp_ota_mark_app_invalid_rollback_and_reboot() != ESP_OK)
      Serial.println("LB_STOP: rollback unavailable; recover through Arduino IDE");
  } else if (!pendingVerify) {
    Serial.println("LB_HEALTH_NOT_READY: inspect status; collecting a fresh 30-second frame window");
    resetHealthWindow();
  }
}
void command(char* input) {
  if (strcmp(input, "status") == 0) status();
  else if (strcmp(input, "help") == 0)
    Serial.println("LB_COMMANDS: status | wifi-diagnose | provision | cancel-provision | offline | reconnect | forget-wifi | check | arm-update | install | rollback");
  else if (strcmp(input, "wifi-diagnose") == 0) diagnoseWifi();
  else if (strncmp(input, "wifi-diagnose\t", sizeof("wifi-diagnose\t") - 1) == 0)
    diagnoseWifi(input + sizeof("wifi-diagnose\t") - 1);
  else if (strcmp(input, "provision") == 0) {
    provisionUntil = millis() + 60000;
    provisionPhase = 1;
    wipe(provisionSsid, sizeof(provisionSsid));
    Serial.println("LB_ENTER_WIFI_NAME: next line is the network name; 60-second window; no echo");
  } else if (strcmp(input, "cancel-provision") == 0) {
    provisionUntil = 0; provisionPhase = 0; wipe(provisionSsid, sizeof(provisionSsid));
    Serial.println("LB_PROVISION_CANCELLED");
  } else if (strncmp(input, "wifi\t", 5) == 0) provision(input + 5);
  else if (strcmp(input, "offline") == 0) {
    reconnectEnabled = false; candidateReady = false; armedUntil = 0;
    WiFi.disconnect(false, false); Serial.println("LB_WIFI_OFFLINE: stored credentials retained");
  } else if (strcmp(input, "reconnect") == 0) { reconnectEnabled = true; connectWifi(); }
  else if (strcmp(input, "forget-wifi") == 0) {
    reconnectEnabled = false; WiFi.disconnect(false, false);
    Preferences store; bool removed = false;
    { FlashGuard guard;
      if (store.begin("lightboard", false)) { removed = store.remove("wifi"); store.end(); }
    }
    wipe(&credentials, sizeof(credentials)); hasCredentials = false;
    candidateReady = false; armedUntil = provisionUntil = 0; provisionPhase = 0;
    wipe(provisionSsid, sizeof(provisionSsid));
    Serial.println(removed ? "LB_CREDENTIALS_REMOVED" : "LB_CREDENTIALS_NOT_FOUND_OR_REMOVE_FAILED");
  } else if (strcmp(input, "check") == 0) checkFeed(true);
  else if (strcmp(input, "arm-update") == 0) {
    if (healthy && !pendingVerify && candidateReady && !expired(millis(), candidateCheckedAt, 60000)) {
      armedUntil = millis() + 60000; Serial.println("LB_UPDATE_ARMED_FOR_60_SECONDS: install requires a second USB command");
    } else Serial.println("LB_STOP: first pass health checks and check a compatible OTA feed");
  } else if (strcmp(input, "install") == 0) {
    bool armed = armedUntil && (int32_t)(armedUntil - millis()) > 0;
    armedUntil = 0;
    Candidate approved = checkedCandidate;
    if (!armed || !checkFeed(false) || !sameCandidate(approved, checkedCandidate)) {
      Serial.println("LB_STOP: update not armed or feed changed; no flash operation"); return;
    }
    candidateReady = false;
    if (downloadAndInstall(approved)) {
      Serial.println("LB_UPDATE_VERIFIED: boot partition selected; restarting"); Serial.flush(); delay(100); ESP.restart();
    } else Serial.println("LB_STOP: update rejected or failed; boot selection not intentionally changed");
  } else if (strcmp(input, "rollback") == 0) {
    armedUntil = 0;
    if (!esp_ota_check_rollback_is_possible()) { Serial.println("LB_STOP: no verified rollback slot; use USB recovery"); return; }
    Serial.println("LB_MANUAL_ROLLBACK_REQUESTED");
    FlashGuard guard;
    if (esp_ota_mark_app_invalid_rollback_and_reboot() != ESP_OK) Serial.println("LB_STOP: rollback failed; use USB recovery");
  } else Serial.println("LB_STOP: unknown command; input omitted");
}
void serialPoll() {
  if (provisionUntil && (int32_t)(provisionUntil - millis()) <= 0) {
    provisionUntil = 0; provisionPhase = 0; wipe(provisionSsid, sizeof(provisionSsid));
    if (lineLength) { wipe(line, sizeof(line)); lineLength = 0; discardLine = true; }
    Serial.println("LB_PROVISION_EXPIRED: credentials not changed");
  }
  if (lineLength && expired(millis(), lineStarted, 30000)) {
    wipe(line, sizeof(line)); lineLength = 0; discardLine = true;
    Serial.println("LB_STOP: serial line timed out; input discarded");
  }
  for (int budget = 0; budget < 64 && Serial.available(); ++budget) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (!discardLine && lineLength) {
        line[lineLength] = 0;
        if (strcmp(line, "cancel-provision") == 0) command(line);
        else if (provisionPhase == 1) {
          if (lineLength <= 32 && !strchr(line, '\t')) {
            memcpy(provisionSsid, line, lineLength + 1); provisionPhase = 2;
            Serial.println("LB_ENTER_WIFI_PASSWORD: next line is the password; input is never echoed by firmware");
          } else command((char*)"cancel-provision");
        } else if (provisionPhase == 2) {
          char privateInput[101] = {};
          if (lineLength <= 64) {
            snprintf(privateInput, sizeof(privateInput), "%s\t%s", provisionSsid, line);
            provision(privateInput);
          } else command((char*)"cancel-provision");
          wipe(privateInput, sizeof(privateInput));
        } else command(line);
      }
      wipe(line, sizeof(line)); lineLength = 0; discardLine = false;
    } else if (!discardLine) {
      if (!lineLength) lineStarted = millis();
      if (lineLength >= sizeof(line) - 1 || ((uint8_t)c < 32 && c != '\t')) {
        wipe(line, sizeof(line)); lineLength = 0; discardLine = true;
        Serial.println("LB_STOP: serial input rejected; content omitted");
      } else line[lineLength++] = c;
    }
  }
}
void worker(void*) {
  // Library diagnostics can include connection details. Emit only our redacted messages.
  esp_log_level_set("wifi", ESP_LOG_NONE);
  esp_log_level_set("HTTP_CLIENT", ESP_LOG_NONE);
  esp_log_level_set("esp-tls", ESP_LOG_NONE);
  esp_log_level_set("esp-x509-crt-bundle", ESP_LOG_NONE);
  hasCredentials = loadCredentials();
  WiFi.onEvent([](arduino_event_id_t, arduino_event_info_t info) {
    lastDisconnectReason.store(info.wifi_sta_disconnected.reason, std::memory_order_relaxed);
  }, ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(false);
  WiFi.mode(WIFI_STA);
  configTime(0, 0, "time.cloudflare.com", "time.google.com", "pool.ntp.org");
  if (hasCredentials) connectWifi();
  else Serial.println("LB_NEEDS_PRIVATE_WIFI_PROVISIONING");
  bool wasConnected = false;
  for (;;) {
    serialPoll(); healthCheck();
    bool connected = WiFi.status() == WL_CONNECTED;
    if (connected && !wasConnected) Serial.println("LB_WIFI_CONNECTED: use status/check for diagnostics");
    if (!connected && wasConnected) { candidateReady = false; armedUntil = 0; Serial.println("LB_WIFI_DISCONNECTED"); }
    if (!connected && hasCredentials && reconnectEnabled && expired(millis(), lastConnectAttempt, 60000)) connectWifi();
    if (!connected && connectStarted && expired(millis(), connectStarted, 20000)) {
      connectStarted = 0; Serial.println("LB_WIFI_ASSOCIATION_NOT_CONFIRMED: animation continues; retry no sooner than 60 seconds");
    }
    wasConnected = connected;
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}
}  // namespace
void observeFrame(uint32_t renderedAt) {
  portENTER_CRITICAL(&metricsMux);
  if (renderedAt != metrics.last) {
    uint32_t gap = renderedAt - metrics.last;
    if (metrics.last && gap > metrics.maxGap) metrics.maxGap = gap;
    metrics.last = renderedAt; ++metrics.frames;
  }
  portEXIT_CRITICAL(&metricsMux);
}
void begin() {
  const esp_partition_t* running = esp_ota_get_running_partition();
  esp_ota_img_states_t state = ESP_OTA_IMG_UNDEFINED;
  pendingVerify = running && esp_ota_get_state_partition(running, &state) == ESP_OK && state == ESP_OTA_IMG_PENDING_VERIFY;
  resetHealthWindow();
  Serial.printf("LB_BOOT version=%s foundation=%s automatic_updates=false\n", LB_FIRMWARE_VERSION, LB_FOUNDATION_ID);
  if (xTaskCreatePinnedToCore(worker, "lightboard-net", 24576, nullptr, 1, &workerHandle, 0) != pdPASS)
    Serial.println("LB_STOP: networking task allocation failed; animation continues");
}
}  // namespace lightboard
