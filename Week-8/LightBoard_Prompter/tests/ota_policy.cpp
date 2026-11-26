#include "../device/runtime/UpdatePolicy.h"
#include <assert.h>
#include <string>
#include <string.h>
int main() {
  using namespace lightboard;
  assert(allowedHttps(kFeedUrl));
  char fresh[192], otherFresh[192], tooSmall[8];
  assert(feedRequestUrl(fresh, sizeof(fresh), 12, 1));
  assert(feedRequestUrl(otherFresh, sizeof(otherFresh), 12, 2));
  assert(allowedHttps(fresh) && strcmp(fresh, otherFresh) != 0);
  assert(strncmp(fresh, kFeedUrl, strlen(kFeedUrl)) == 0);
  assert(!feedRequestUrl(tooSmall, sizeof(tooSmall), 12, 1));
  assert(reportingUrl("https://script.google.com/macros/s/abcdefghijklmnopqrstuv/exec"));
  assert(!reportingUrl("https://script.google.com.evil.test/macros/s/abcdefghijklmnopqrstuv/exec"));
  assert(!reportingUrl("https://script.google.com/macros/s/abcdefghijklmnopqrstuv/exec?key=secret"));
  assert(reportRedirectUrl("https://script.googleusercontent.com/macros/echo?user_content_key=abc"));
  assert(!reportRedirectUrl("https://script.googleusercontent.com.evil.test/macros/echo?x"));
  assert(!reportRedirectUrl("https://script.googleusercontent.com/macros/echo?x#fragment"));
  assert(kMaxManifest == 8192);
  const char* forbidden[] = {
    "http://github.com/a", "https://github.com.evil.test/a", "https://user@github.com/a",
    "https://github.com:444/a", "https://github.com\\@evil.test/a", "https://evil.test/a",
    "https://raw.githubusercontent.com", "https://github.com/a#x", "https://github.com/a\nb"
  };
  for (const char* url : forbidden) assert(!allowedHttps(url));
  assert(allowedHttps("https://release-assets.githubusercontent.com/a?sig=123%3D"));
  assert(firmwareUrl("https://github.com/pmartin5-gif/HelloWorld/releases/download/lightboard-ota-123-1/firmware.bin"));
  assert(!firmwareUrl("https://github.com/pmartin5-gif/HelloWorld/releases/download/lightboard-test-123-1/firmware.bin"));
  assert(!firmwareUrl("https://github.com/other/repo/releases/download/lightboard-ota-123-1/firmware.bin"));
  assert(!firmwareUrl("https://github.com/pmartin5-gif/HelloWorld/releases/download/lightboard-ota-../firmware.bin"));
  assert(!firmwareUrl("https://github.com/pmartin5-gif/HelloWorld/releases/download/lightboard-ota-a/firmware.bin?evil"));
  Candidate c = {};
  strcpy(c.url, "https://github.com/pmartin5-gif/HelloWorld/releases/download/lightboard-ota-123-1/firmware.bin");
  strcpy(c.sha256, std::string(64, 'a').c_str());
  strcpy(c.version, "ota-pilot-123abc");
  c.bytes = 1000000;
  Candidate same = c;
  assert(sameCandidate(c, same));
  same.bytes++;
  assert(!sameCandidate(c, same));
  const std::string foundation(64, 'b'), other(64, 'c');
  assert(eligible(2, true, kDevice, foundation.c_str(), foundation.c_str(), c, kAppSlotBytes));
  assert(!eligible(1, true, kDevice, foundation.c_str(), foundation.c_str(), c, kAppSlotBytes));
  assert(!eligible(2, false, kDevice, foundation.c_str(), foundation.c_str(), c, kAppSlotBytes));
  assert(!eligible(2, true, "another-device", foundation.c_str(), foundation.c_str(), c, kAppSlotBytes));
  assert(!eligible(2, true, kDevice, other.c_str(), foundation.c_str(), c, kAppSlotBytes));
  assert(!eligible(2, true, kDevice, nullptr, foundation.c_str(), c, kAppSlotBytes));
  assert(!eligible(2, true, kDevice, foundation.c_str(), foundation.c_str(), c, 999999));
  c.bytes = kAppSlotBytes + 1;
  assert(!eligible(2, true, kDevice, foundation.c_str(), foundation.c_str(), c, c.bytes));
  c.bytes = 287;
  assert(!eligible(2, true, kDevice, foundation.c_str(), foundation.c_str(), c, kAppSlotBytes));
  assert(!sha256Text("wrong"));
  assert(!sha256Text(std::string(64, 'A').c_str()));
  assert(!safeVersion("bad\"version"));
  assert(!safeVersion(std::string(80, 'a').c_str()));
  assert(boundedJson("{\"text\":\"{[}]\",\"enabled\":true}"));
  assert(!boundedJson("{\"text\":\"unterminated}"));
  assert(!boundedJson((std::string(13, '[') + std::string(13, ']')).c_str()));
  assert(expired(4, UINT32_MAX - 5, 10));
  assert(!expired(3, UINT32_MAX - 5, 10));
  return 0;
}
