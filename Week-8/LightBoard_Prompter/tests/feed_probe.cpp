#include "UpdatePolicy.h"
#include <assert.h>
#include <string>
#include <algorithm>
#include <ctime>
using namespace lightboard;
struct { void println(const char*) {} void printf(const char*, ...) {} } Serial;
uint32_t tick=0, feedBoot=0, feedSequence=0;
time_t wall=1800000000, feedApiResumeAt=0;
time_t feedTime(time_t*) { return wall; }
bool timeReady() { return true; }
uint32_t millis() { return tick; }
uint32_t esp_random() { return 42; }
void vTaskDelay(int) { ++tick; }
bool apiFailure=false, rateLimited=false;
int apiCalls=0, rawCalls=0, declaredLength=2;
std::string response="{}";
struct Client { size_t offset=0; };
struct HttpsStream {
  struct { int rateRemaining=-1; time_t rateReset=0; } headers;
  Client data; Client* client=&data;
  void close() { data.offset=0; }
  bool open(const char* url, bool fresh=false, bool api=false) {
    assert(fresh);
    if(api) {
      assert(apiFeedUrl(url)); ++apiCalls;
      headers.rateRemaining=rateLimited?0:58; headers.rateReset=wall+120;
      return !apiFailure;
    }
    assert(allowedHttps(url)); ++rawCalls; return true;
  }
};
int esp_http_client_get_content_length(Client*) { return declaredLength; }
int esp_http_client_read(Client* client, char* out, size_t capacity) {
  size_t n=std::min(capacity,response.size()-client->offset);
  memcpy(out,response.data()+client->offset,n);client->offset+=n;return n;
}
bool esp_http_client_is_complete_data_received(Client* client) { return client->offset==response.size(); }
#define time feedTime
// PRODUCTION_FEED
#undef time
int main() {
  char output[64];
  assert(downloadManifest(output,sizeof(output)) && std::string(output)=="{}");
  assert(apiCalls==1 && rawCalls==0);
  apiFailure=true;rateLimited=true;
  assert(downloadManifest(output,sizeof(output)));assert(apiCalls==2 && rawCalls==1);
  assert(feedApiResumeAt==wall+125);
  wall+=30;assert(downloadManifest(output,sizeof(output)));assert(apiCalls==2 && rawCalls==2);
  wall+=100;apiFailure=false;rateLimited=false;
  assert(downloadManifest(output,sizeof(output)));assert(apiCalls==3 && rawCalls==2);
  response=std::string("a\0b",3);declaredLength=3;
  assert(!downloadManifest(output,sizeof(output)));
  response="{}";declaredLength=100;
  assert(!downloadManifest(output,sizeof(output)));
  declaredLength=2;assert(!downloadManifest(output,2));
  return 0;
}
