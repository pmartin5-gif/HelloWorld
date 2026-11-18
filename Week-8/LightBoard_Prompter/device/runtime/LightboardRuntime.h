#pragma once
#include <stdint.h>
namespace lightboard {
void begin();
// Observe completed frames without putting networking or flash writes in loop().
void observeFrame(uint32_t lastRenderedAt);
}
// The sketch blanks output during flash writes, retaining the refresh configuration.
void lightboardFlashGuard(bool paused);
uint32_t lightboardRefreshStackFree();
uint32_t lightboardRefreshCycles();
