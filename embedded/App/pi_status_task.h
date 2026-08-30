#ifndef PI_STATUS_TASK_H
#define PI_STATUS_TASK_H

#include "rover_state.h"

void pi_status_task_init(rover_state_t *state, rover_diag_t *diag);
void pi_status_task(void);

#endif
