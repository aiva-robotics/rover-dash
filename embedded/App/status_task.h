#ifndef STATUS_TASK_H
#define STATUS_TASK_H

#include "rover_state.h"

void status_task_init(rover_state_t *state, rover_diag_t *diag);
void status_task(void);

#endif
