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
#include <mbedtls/md.h>
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
struct AutoSettings { uint32_t format; uint32_t enabled; char attemptedSha[65]; };
AutoSettings autoSettings = {1, 0, {0}};
uint32_t lastAutomaticCheck = 0;
bool feedAllowsAutomatic = false;
uint32_t feedBoot = 0, feedSequence = 0;
time_t feedApiResumeAt = 0;
struct ReportSettings { uint32_t format; char url[256]; char key[65]; };
ReportSettings reportSettings = {};
struct InstallReceipt { uint32_t format; uint32_t address; uint32_t bytes;
  char version[80]; char foundation[65]; char sha256[65]; };
InstallReceipt installReceipt = {};
unsigned reportProvisionPhase = 0;
char reportUrlDraft[256] = {};
bool reportImageVerified = false;
uint32_t lastReportAttempt = 0;
bool reportDelivered = false;

class FlashGuard {
 public:
  FlashGuard() { lightboardFlashGuard(true); }
  ~FlashGuard() { lightboardFlashGuard(false); }
};
void wipe(void* data, size_t bytes) {
  volatile uint8_t* p = (volatile uint8_t*)data;
  while (bytes--) *p++ = 0;
}
void loadReportSettings() {
  Preferences store;
  if (!store.begin("lightboard", true)) return;
  ReportSettings settings = {}; InstallReceipt receipt = {};
  if (store.getBytesLength("reporting") == sizeof(settings) &&
      store.getBytes("reporting", &settings, sizeof(settings)) == sizeof(settings) &&
      settings.format == 1 && settings.url[255] == 0 && settings.key[64] == 0 &&
      reportingUrl(settings.url) && sha256Text(settings.key)) reportSettings = settings;
  if (store.getBytesLength("image") == sizeof(receipt) &&
      store.getBytes("image", &receipt, sizeof(receipt)) == sizeof(receipt) && receipt.format == 1 &&
      receipt.version[79] == 0 && receipt.foundation[64] == 0 && receipt.sha256[64] == 0 &&
      safeVersion(receipt.version) && sha256Text(receipt.foundation) && sha256Text(receipt.sha256) &&
      receipt.bytes >= 288 && receipt.bytes <= kAppSlotBytes) installReceipt = receipt;
  store.end(); wipe(&settings, sizeof(settings));
}
// Called with the existing flash guard held, after full download/hash validation.
bool saveInstallReceipt(const Candidate& candidate, const esp_partition_t* target) {
  InstallReceipt next = {};
  next.format = 1; next.address = target->address; next.bytes = candidate.bytes;
  strcpy(next.version, candidate.version); strcpy(next.foundation, LB_FOUNDATION_ID);
  strcpy(next.sha256, candidate.sha256);
  Preferences store;
  if (!store.begin("lightboard", false)) return false;
  bool saved = store.putBytes("image", &next, sizeof(next)) == sizeof(next);
  store.end(); return saved;
}
void loadAutoSettings() {
  Preferences store;
  AutoSettings saved = {};
  if (!store.begin("lightboard", true)) return;
  bool found = store.getBytesLength("auto") == sizeof(saved) &&
      store.getBytes("auto", &saved, sizeof(saved)) == sizeof(saved);
  store.end();
  if (found && saved.format == 1 && saved.enabled <= 1 && saved.attemptedSha[64] == 0 &&
      (!saved.attemptedSha[0] || sha256Text(saved.attemptedSha))) autoSettings = saved;
}
bool saveAutoSettings(const AutoSettings& next) {
  FlashGuard guard;
  Preferences store;
  if (!store.begin("lightboard", false)) return false;
  bool saved = store.putBytes("auto", &next, sizeof(next)) == sizeof(next);
  store.end();
  if (saved) autoSettings = next;
  return saved;
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
      "\"health_ok\":%s,\"automatic_updates\":%s}\n",
      LB_FIRMWARE_VERSION, LB_FOUNDATION_ID, ESP.getFlashChipSize(), layoutValid() ? "true" : "false",
      running ? running->label : "none", running ? running->address : 0,
      running ? running->size : 0, target ? target->label : "none", (int)state,
      hasCredentials ? "true" : "false", (int)WiFi.status(),
      WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0,
      ESP.getFreeHeap(), ESP.getMinFreeHeap(), ESP.getMaxAllocHeap(),
      (unsigned)uxTaskGetStackHighWaterMark(nullptr), lightboardRefreshStackFree(), lightboardRefreshCycles(),
      m.frames, m.maxGap, healthy ? "true" : "false", autoSettings.enabled ? "true" : "false");
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
  int cacheAge;
  int rateRemaining;
  time_t rateReset;
};
esp_err_t httpEvent(esp_http_client_event_t* event) {
  if (event->event_id != HTTP_EVENT_ON_HEADER || !event->header_key || !event->header_value) return ESP_OK;
  Headers* h = (Headers*)event->user_data;
  if (strcasecmp(event->header_key, "Age") == 0 && event->header_value[0] && strlen(event->header_value) < 10 &&
      strspn(event->header_value, "0123456789") == strlen(event->header_value))
    h->cacheAge = atoi(event->header_value);
  if (strcasecmp(event->header_key, "X-RateLimit-Remaining") == 0 && event->header_value[0] &&
      strlen(event->header_value) < 8 && strspn(event->header_value, "0123456789") == strlen(event->header_value))
    h->rateRemaining = atoi(event->header_value);
  if (strcasecmp(event->header_key, "X-RateLimit-Reset") == 0 && event->header_value[0] &&
      strlen(event->header_value) <= 10 && strspn(event->header_value, "0123456789") == strlen(event->header_value))
    h->rateReset = (time_t)strtoull(event->header_value, nullptr, 10);
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
  bool open(const char* initial, bool freshFeed = false, bool apiFeed = false) {
    char url[3072];
    if ((!allowedHttps(initial) && !(apiFeed && apiFeedUrl(initial))) || !timeReady()) {
      Serial.println("LB_HTTPS_DIAG: initial URL policy or clock rejected"); return false;
    }
    strcpy(url, initial);
    for (int redirect = 0; redirect <= 3; ++redirect) {
      close();
      memset(&headers, 0, sizeof(headers));
      headers.cacheAge = -1;
      headers.rateRemaining = -1;
      esp_http_client_config_t config = {};
      config.url = url;
      config.timeout_ms = 8000;
      config.disable_auto_redirect = true;
      config.max_authorization_retries = -1;
      config.crt_bundle_attach = esp_crt_bundle_attach;
      config.skip_cert_common_name_check = false;
      config.buffer_size = 4096;
      config.buffer_size_tx = 1024;
      config.event_handler = httpEvent;
      config.user_data = &headers;
      config.user_agent = "Lightboard-OTA-pilot";
      client = esp_http_client_init(&config);
      if (!client) { Serial.println("LB_HTTPS_DIAG: client allocation failed"); return false; }
      esp_http_client_set_header(client, "Accept-Encoding", "identity");
      esp_http_client_set_header(client, "Connection", "close");
      if (freshFeed) esp_http_client_set_header(client, "Cache-Control", "no-cache, max-age=0");
      if (apiFeed) {
        esp_http_client_set_header(client, "Accept", "application/vnd.github.raw+json");
        esp_http_client_set_header(client, "X-GitHub-Api-Version", "2022-11-28");
      }
      esp_err_t openResult = esp_http_client_open(client, 0);
      Serial.printf("LB_HTTPS_DIAG {\"hop\":%d,\"open_result\":%d,\"heap_free\":%u}\n",
          redirect, (int)openResult, ESP.getFreeHeap());
      if (openResult != ESP_OK) return false;
      int64_t fetched = esp_http_client_fetch_headers(client);
      int statusCode = esp_http_client_get_status_code(client);
      if (freshFeed) Serial.printf("LB_FEED_CACHE {\"age_seconds\":%d,\"revalidation_requested\":true}\n", headers.cacheAge);
      Serial.printf("LB_HTTPS_DIAG {\"hop\":%d,\"status\":%d,\"length\":%lld,\"chunked\":%s,\"headers_rejected\":%s,\"redirect_bytes\":%u}\n",
          redirect, statusCode, (long long)fetched,
          esp_http_client_is_chunked_response(client) ? "true" : "false",
          headers.rejected ? "true" : "false", (unsigned)strlen(headers.location));
      if (fetched < 0 || headers.rejected) return false;
      if (statusCode == 200) return true;
      if (statusCode != 301 && statusCode != 302 && statusCode != 303 && statusCode != 307 && statusCode != 308)
        return false;
      if (!allowedHttps(headers.location)) { Serial.println("LB_HTTPS_DIAG: redirect URL policy rejected"); return false; }
      strcpy(url, headers.location);
    }
    return false;
  }
};
void probeFirmware(const char* url) {
  // Read-only network probe: no OTA begin/write/end or boot-partition selection.
  if (!firmwareUrl(url) || WiFi.status() != WL_CONNECTED) {
    Serial.println("LB_PROBE_STOP: repository firmware URL or Wi-Fi rejected"); return;
  }
  HttpsStream stream;
  if (!stream.open(url)) { Serial.println("LB_PROBE_STOP: HTTPS open failed; no flash operation"); return; }
  int length = esp_http_client_get_content_length(stream.client);
  bool chunked = esp_http_client_is_chunked_response(stream.client);
  Serial.printf("LB_PROBE_HEADERS {\"length\":%d,\"chunked\":%s,\"no_flash_operation\":true}\n",
      length, chunked ? "true" : "false");
  if (chunked || length < 288 || length > (int)kAppSlotBytes) return;
  mbedtls_sha256_context hash; mbedtls_sha256_init(&hash);
  bool good = mbedtls_sha256_starts_ret(&hash, 0) == 0;
  uint8_t buffer[1024]; int received = 0; bool magic = false;
  uint32_t started = millis(), lastData = started;
  while (good && received < length) {
    if (expired(millis(), started, 120000) || expired(millis(), lastData, 10000)) { good = false; break; }
    int wanted = min((int)sizeof(buffer), length - received);
    int count = esp_http_client_read(stream.client, (char*)buffer, wanted);
    if (count < 0) { good = false; break; }
    if (count > 0) {
      if (!received) magic = buffer[0] == 0xe9;
      good = mbedtls_sha256_update_ret(&hash, buffer, count) == 0;
      received += count; lastData = millis();
    }
    vTaskDelay(1);
  }
  uint8_t digest[32] = {}; char hex[65] = {};
  good = good && received == length && esp_http_client_is_complete_data_received(stream.client) &&
      mbedtls_sha256_finish_ret(&hash, digest) == 0;
  for (size_t i = 0; i < sizeof(digest); ++i) snprintf(hex + i * 2, 3, "%02x", digest[i]);
  mbedtls_sha256_free(&hash);
  Serial.printf("LB_PROBE_DOWNLOAD {\"bytes\":%d,\"complete\":%s,\"image_magic\":%s,\"sha256\":\"%s\",\"no_flash_operation\":true}\n",
      received, good ? "true" : "false", magic ? "true" : "false", hex);
}
bool downloadManifest(char* output, size_t capacity) {
  HttpsStream stream;
  char requestUrl[192]; bool opened = false;
  if (!feedBoot) feedBoot = esp_random();
  if (timeReady() && time(nullptr) >= feedApiResumeAt &&
      apiFeedRequestUrl(requestUrl, sizeof(requestUrl), feedBoot, ++feedSequence)) {
    opened = stream.open(requestUrl, true, true);
    // Forty normal checks/hour plus at most ten publication rechecks leaves
    // headroom under GitHub's 60/hour unauthenticated IP limit. Honor shared-IP exhaustion.
    if (stream.headers.rateRemaining == 0 && stream.headers.rateReset > time(nullptr))
      feedApiResumeAt = stream.headers.rateReset + 5;
    if (!opened && feedApiResumeAt <= time(nullptr)) feedApiResumeAt = time(nullptr) + 300;
    Serial.printf("LB_FEED_SOURCE {\"source\":\"github_api\",\"available\":%s,\"rate_remaining\":%d}\n",
      opened ? "true" : "false", stream.headers.rateRemaining);
  }
  if (!opened) {
    stream.close();
    opened = feedRequestUrl(requestUrl, sizeof(requestUrl), feedBoot, ++feedSequence) && stream.open(requestUrl, true);
    Serial.println("LB_FEED_SOURCE {\"source\":\"raw_fallback\"}");
  }
  if (!opened) { Serial.println("LB_STOP: verified HTTPS feed unavailable (Wi-Fi/clock/certificate/status)"); return false; }
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
  feedAllowsAutomatic = false;
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
  feedAllowsAutomatic = valid && cJSON_IsTrue(field(root, "automatic_updates"));
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
      if (good) good = saveInstallReceipt(candidate, target) && esp_ota_set_boot_partition(target) == ESP_OK;
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
bool verifyReportImage() {
  const esp_partition_t* running = esp_ota_get_running_partition();
  esp_ota_img_states_t state = ESP_OTA_IMG_UNDEFINED;
  if (!running || installReceipt.format != 1 || running->address != installReceipt.address ||
      strcmp(installReceipt.version, LB_FIRMWARE_VERSION) || strcmp(installReceipt.foundation, LB_FOUNDATION_ID) ||
      esp_ota_get_state_partition(running, &state) != ESP_OK || state != ESP_OTA_IMG_VALID) return false;
  mbedtls_sha256_context hash; mbedtls_sha256_init(&hash);
  bool good = mbedtls_sha256_starts_ret(&hash, 0) == 0;
  uint8_t block[1024], digest[32]; char hex[65] = {};
  for (uint32_t offset = 0; good && offset < installReceipt.bytes;) {
    size_t count = min((uint32_t)sizeof(block), installReceipt.bytes - offset);
    good = esp_partition_read(running, offset, block, count) == ESP_OK &&
      mbedtls_sha256_update_ret(&hash, block, count) == 0;
    offset += count; vTaskDelay(1);
  }
  good = good && mbedtls_sha256_finish_ret(&hash, digest) == 0;
  mbedtls_sha256_free(&hash);
  for (size_t i = 0; good && i < 32; ++i) snprintf(hex + i * 2, 3, "%02x", digest[i]);
  return good && strcmp(hex, installReceipt.sha256) == 0;
}
bool sendReport(const char* body) {
  char url[3072]; strcpy(url, reportSettings.url);
  const size_t bodyBytes = strlen(body);
  for (int hop = 0; hop < 2; ++hop) {
    Headers headers = {}; headers.cacheAge = -1;
    esp_http_client_config_t config = {};
    config.url = url; config.timeout_ms = 8000; config.disable_auto_redirect = true;
    config.max_authorization_retries = -1; config.crt_bundle_attach = esp_crt_bundle_attach;
    config.skip_cert_common_name_check = false; config.buffer_size = 4096; config.buffer_size_tx = 1024;
    config.event_handler = httpEvent; config.user_data = &headers; config.user_agent = "Lightboard-report/1";
    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (!client) return false;
    esp_http_client_set_method(client, hop == 0 ? HTTP_METHOD_POST : HTTP_METHOD_GET);
    esp_http_client_set_header(client, "Accept-Encoding", "identity");
    esp_http_client_set_header(client, "Connection", "close");
    if (!hop) esp_http_client_set_header(client, "Content-Type", "application/json");
    bool good = esp_http_client_open(client, hop == 0 ? bodyBytes : 0) == ESP_OK;
    if (good && !hop) good = esp_http_client_write(client, body, bodyBytes) == (int)bodyBytes;
    if (good) good = esp_http_client_fetch_headers(client) >= 0 && !headers.rejected;
    int code = esp_http_client_get_status_code(client);
    if (good && hop == 0 && (code == 302 || code == 303) && reportRedirectUrl(headers.location)) {
      strcpy(url, headers.location); esp_http_client_cleanup(client); continue;
    }
    char response[256] = {}; size_t used = 0;
    uint32_t started = millis();
    while (good && code == 200 && used < sizeof(response) - 1 && !expired(millis(), started, 12000)) {
      int count = esp_http_client_read(client, response + used, sizeof(response) - 1 - used);
      if (count < 0) { good = false; break; }
      used += count;
      if (esp_http_client_is_complete_data_received(client)) break;
      vTaskDelay(1);
    }
    good = good && code == 200 && esp_http_client_is_complete_data_received(client) &&
      !memchr(response, 0, used) && boundedJson(response);
    cJSON* parsed = good ? cJSON_Parse(response) : nullptr;
    good = parsed && cJSON_IsTrue(field(parsed, "ok"));
    cJSON_Delete(parsed); esp_http_client_cleanup(client); return good;
  }
  return false;
}
void reportInstallation() {
  if (reportSettings.format != 1 || !healthy || pendingVerify || terminalHealthFailure ||
      provisionUntil || WiFi.status() != WL_CONNECTED || !timeReady() ||
      (lastReportAttempt && !expired(millis(), lastReportAttempt, reportDelivered ? 600000 : 60000))) return;
  lastReportAttempt = millis();
  if (!reportImageVerified) reportImageVerified = verifyReportImage();
  if (!reportImageVerified) return; // USB boot/no matching receipt cannot fabricate an OTA acknowledgment.
  char nonce[33], payload[768], signature[65] = {}; uint8_t digest[32];
  snprintf(nonce, sizeof(nonce), "%08lx%08lx%08lx%08lx", (unsigned long)esp_random(),
    (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random());
  int count = snprintf(payload, sizeof(payload),
    "{\"schemaVersion\":1,\"action\":\"installed\",\"boardId\":\"lightboard-main\",\"reportedAt\":%lld,"
    "\"nonce\":\"%s\",\"version\":\"%s\",\"foundation\":\"%s\",\"sha256\":\"%s\","
    "\"bytes\":%u,\"healthy\":true,\"otaState\":2}", (long long)time(nullptr), nonce,
    LB_FIRMWARE_VERSION, LB_FOUNDATION_ID, installReceipt.sha256, installReceipt.bytes);
  if (count <= 0 || count >= (int)sizeof(payload) || mbedtls_md_hmac(
      mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), (const unsigned char*)reportSettings.key, 64,
      (const unsigned char*)payload, count, digest) != 0) return;
  for (size_t i = 0; i < 32; ++i) snprintf(signature + i * 2, 3, "%02x", digest[i]);
  cJSON* envelope = cJSON_CreateObject();
  if (!envelope) return;
  cJSON_AddStringToObject(envelope, "payload", payload); cJSON_AddStringToObject(envelope, "signature", signature);
  char* body = cJSON_PrintUnformatted(envelope);
  bool good = body && strlen(body) <= 2048 && sendReport(body);
  free(body); cJSON_Delete(envelope);
  if (good) { reportDelivered = true; Serial.printf("LB_INSTALLATION_REPORTED {\"version\":\"%s\",\"healthy\":true}\n", LB_FIRMWARE_VERSION); }
  else Serial.println("LB_REPORT_PENDING: will retry the report; no firmware download or model request");
}
void provisionReporting(const char* key) {
  bool valid = provisionUntil && !expired(millis(), provisionUntil - 60000, 60000) &&
    reportProvisionPhase == 2 && reportingUrl(reportUrlDraft) && sha256Text(key);
  ReportSettings next = {};
  if (valid) {
    next.format = 1; strcpy(next.url, reportUrlDraft); strcpy(next.key, key);
    FlashGuard guard; Preferences store;
    valid = store.begin("lightboard", false);
    if (valid) { valid = store.putBytes("reporting", &next, sizeof(next)) == sizeof(next); store.end(); }
    if (valid) { reportSettings = next; lastReportAttempt = 0; reportDelivered = false; }
  }
  provisionUntil = 0; reportProvisionPhase = 0; wipe(reportUrlDraft, sizeof(reportUrlDraft)); wipe(&next, sizeof(next));
  Serial.println(valid ? "LB_REPORTING_STORED_PRIVATELY" : "LB_STOP: reporting setup rejected; input omitted");
}
void automaticUpdate() {
  if (!autoSettings.enabled || !healthy || pendingVerify || terminalHealthFailure || provisionPhase ||
      reportProvisionPhase || !reconnectEnabled || WiFi.status() != WL_CONNECTED ||
      !expired(millis(), lastAutomaticCheck, 90000)) return;
  lastAutomaticCheck = millis();
  if (!checkFeed(false) || !feedAllowsAutomatic ||
      strcmp(checkedCandidate.version, LB_FIRMWARE_VERSION) == 0 ||
      strcmp(checkedCandidate.sha256, autoSettings.attemptedSha) == 0) return;
  Candidate approved = checkedCandidate;
  // Recheck the exact candidate before reserving a flash attempt. Hash verification
  // in downloadAndInstall remains mandatory. Persist BEFORE flash to prevent loops
  // after reset/rollback. A failed download requires explicit auto-on to retry.
  if (!checkFeed(false) || !feedAllowsAutomatic || !sameCandidate(approved, checkedCandidate)) return;
  AutoSettings next = autoSettings;
  strcpy(next.attemptedSha, approved.sha256);
  if (!saveAutoSettings(next)) { Serial.println("LB_STOP: automatic attempt could not be saved"); return; }
  Serial.printf("LB_AUTO_INSTALL {\"version\":\"%s\",\"sha256\":\"%s\"}\n", approved.version, approved.sha256);
  if (downloadAndInstall(approved)) {
    Serial.println("LB_AUTO_REBOOT: verified image written");
    vTaskDelay(pdMS_TO_TICKS(100)); ESP.restart();
  } else Serial.println("LB_AUTO_INSTALL_FAILED: same image will not be retried automatically");
}
void command(char* input) {
  if (strcmp(input, "status") == 0) status();
  else if (strcmp(input, "report-status") == 0)
    Serial.printf("LB_REPORT_STATUS {\"configured\":%s,\"image_verified\":%s,\"delivered\":%s}\n",
      reportSettings.format == 1 ? "true" : "false", reportImageVerified ? "true" : "false", reportDelivered ? "true" : "false");
  else if (strcmp(input, "report-provision") == 0) {
    provisionUntil = millis() + 60000; provisionPhase = 0; reportProvisionPhase = 1;
    wipe(provisionSsid, sizeof(provisionSsid)); wipe(reportUrlDraft, sizeof(reportUrlDraft));
    Serial.println("LB_ENTER_REPORT_URL: next line is reporting-only deployment URL; 60-second window");
  }
  else if (strcmp(input, "help") == 0)
    Serial.println("LB_COMMANDS: status | wifi-diagnose | provision | cancel-provision | offline | reconnect | forget-wifi | check | arm-update | install | auto-on | auto-off | rollback");
  else if (strcmp(input, "auto-on") == 0 || strcmp(input, "auto-off") == 0) {
    AutoSettings next = {1, strcmp(input, "auto-on") == 0 ? 1U : 0U, {0}};
    if (saveAutoSettings(next)) {
      lastAutomaticCheck = millis();
      Serial.println(next.enabled ? "LB_AUTO_ENABLED: eligible published feed checked every 90 seconds" : "LB_AUTO_DISABLED");
    } else Serial.println("LB_STOP: automatic setting was not saved");
  }
  else if (strcmp(input, "wifi-diagnose") == 0) diagnoseWifi();
  else if (strncmp(input, "wifi-diagnose\t", sizeof("wifi-diagnose\t") - 1) == 0)
    diagnoseWifi(input + sizeof("wifi-diagnose\t") - 1);
  else if (strcmp(input, "provision") == 0) {
    provisionUntil = millis() + 60000;
    provisionPhase = 1; reportProvisionPhase = 0; wipe(reportUrlDraft, sizeof(reportUrlDraft));
    wipe(provisionSsid, sizeof(provisionSsid));
    Serial.println("LB_ENTER_WIFI_NAME: next line is the network name; 60-second window; no echo");
  } else if (strcmp(input, "cancel-provision") == 0) {
    provisionUntil = 0; provisionPhase = 0; reportProvisionPhase = 0;
    wipe(provisionSsid, sizeof(provisionSsid)); wipe(reportUrlDraft, sizeof(reportUrlDraft));
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
  } else if (strncmp(input, "probe-firmware\t", 15) == 0) probeFirmware(input + 15);
  else if (strcmp(input, "check") == 0) checkFeed(true);
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
    provisionUntil = 0; provisionPhase = 0; reportProvisionPhase = 0;
    wipe(provisionSsid, sizeof(provisionSsid)); wipe(reportUrlDraft, sizeof(reportUrlDraft));
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
        else if (reportProvisionPhase == 1) {
          if (reportingUrl(line) && lineLength < sizeof(reportUrlDraft)) {
            strcpy(reportUrlDraft, line); reportProvisionPhase = 2;
            Serial.println("LB_ENTER_REPORT_KEY: next line is the private key; input is never echoed");
          } else command((char*)"cancel-provision");
        } else if (reportProvisionPhase == 2) provisionReporting(line);
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
  loadReportSettings();
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
    serialPoll(); healthCheck(); reportInstallation(); automaticUpdate();
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
  loadAutoSettings();
  Serial.printf("LB_BOOT version=%s foundation=%s automatic_updates=%s\n", LB_FIRMWARE_VERSION, LB_FOUNDATION_ID,
      autoSettings.enabled ? "true" : "false");
  if (xTaskCreatePinnedToCore(worker, "lightboard-net", 24576, nullptr, 1, &workerHandle, 0) != pdPASS)
    Serial.println("LB_STOP: networking task allocation failed; animation continues");
}
}  // namespace lightboard
