#ifndef APP_H
#define APP_H

#include "rover_state.h"

void app_init(void);
void app_run(void);
rover_state_t *app_get_state(void);
rover_diag_t *app_get_diag(void);

#endif
